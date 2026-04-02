/**
 * Citation Opportunity Finder
 *
 * Answers the question: "Why is my page not cited despite a high audit score?"
 *
 * Architecture:
 *  Level 1 — Structural (deterministic, zero LLM cost):
 *    For each query where AI cited a competitor but NOT the target page,
 *    diff the competitor_audits columns against the target audit.findings.
 *    Output: list of structural gaps per query with actionable recommendations.
 *
 *  Level 2 — Semantic (LLM, ~$0.001 per query, Pro only):
 *    Feed the AI response text (responseText) + competitor URL + target URL
 *    to an LLM. Extract: query intent, response type, winning fragment,
 *    and a concrete content brief ("write this to win next time").
 *
 * Design principles:
 *  - No new DB tables — all data already exists in citation_checks + competitor_audits
 *  - Level 1 is always computed (free + pro)
 *  - Level 2 is computed on-demand for Pro users (lazy, cached in memory for 1h)
 *  - Results are deterministic for the same input (idempotent)
 *  - LLM calls are batched and deduplicated by (query, competitor_url) pair
 */

import { getCitationResultsForAudit } from "./db";
import { getCompetitorAuditsForAudit } from "../competitor/db";
import { getDb } from "../db";
import { audits } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import type { AuditFindings } from "../audit/types";
import type { CompetitorAudit } from "../../drizzle/schema";
import { safeParseLLMJson } from "../utils/jsonSanitizer";

// ─── Types ────────────────────────────────────────────────────────────────────

export type QueryIntent = "informational" | "comparison" | "how-to" | "definition" | "list" | "local" | "transactional";
export type ResponseType = "list" | "guide" | "comparison" | "definition" | "paragraph" | "faq" | "mixed";

export interface StructuralGap {
  checkId: string;
  label: string;
  category: string;
  categoryLabel: string;
  targetHas: boolean;
  competitorHas: boolean;
  recommendation: string;
  impact: string;
  priority: "critical" | "high" | "medium";
}

export interface SemanticInsight {
  queryIntent: QueryIntent;
  responseType: ResponseType;
  /** The specific fragment from the competitor's page that "won" the citation */
  winningFragment: string;
  /** Why the competitor was chosen (1-2 sentences) */
  whyCompetitorWon: string;
  /** Concrete content brief: what to write to win this query */
  contentBrief: string;
  /** Estimated word count for the recommended content addition */
  estimatedWordCount: number;
  /** Whether this is a quick win (can be implemented in <1h) */
  isQuickWin: boolean;
}

export interface CitationOpportunity {
  /** The query where the competitor was cited instead of target */
  query: string;
  /** Which AI engines cited the competitor for this query */
  engines: string[];
  /** The competitor URL that was cited */
  competitorUrl: string;
  /** Competitor domain (clean) */
  competitorDomain: string;
  /** Competitor page title */
  competitorTitle: string | null;
  /** How many times this competitor was cited across all queries */
  competitorCitationCount: number;
  /** Priority: how impactful winning this query would be */
  priority: "critical" | "high" | "medium" | "low";
  /** Level 1: structural gaps between target and competitor */
  structuralGaps: StructuralGap[];
  /** Level 2: LLM semantic insight (Pro only, may be null) */
  semanticInsight: SemanticInsight | null;
  /** Short summary for the "aha moment" card */
  ahaMoment: string;
  /** Snippet from the AI response (what AI said when citing competitor) */
  aiSnippet: string | null;
}

export interface OpportunityFinderResult {
  /** Ordered by priority (critical first) */
  opportunities: CitationOpportunity[];
  /** Total queries checked */
  totalQueriesChecked: number;
  /** Queries where target was cited */
  queriesCited: number;
  /** Queries where competitor was cited instead */
  queriesMissed: number;
  /** Overall opportunity score: 0-100 (higher = more opportunities to capture) */
  opportunityScore: number;
  /** Language of the page */
  language: string;
  /** Timestamp */
  analysedAt: string;
  /** Whether Level 2 semantic analysis was performed */
  hasSemanticInsights: boolean;
}

// ─── Structural Check Definitions ────────────────────────────────────────────
// Maps competitor_audits columns to human-readable labels and recommendations.
// Only includes the checks most relevant to citation decisions.

interface StructuralCheckDef {
  checkId: string;
  label: string;
  category: string;
  categoryLabel: string;
  column: keyof CompetitorAudit;
  inverted?: boolean; // true = column 1 means BAD
  recommendation: string;
  impact: string;
  priority: "critical" | "high" | "medium";
}

const STRUCTURAL_CHECKS: StructuralCheckDef[] = [
  // Content Structure — highest impact on citation decisions
  {
    checkId: "cs_answer_patterns",
    label: "Bezpośrednia odpowiedź w pierwszym akapicie",
    category: "contentStructure",
    categoryLabel: "Struktura treści",
    column: "cs_answer_patterns",
    recommendation: "Umieść bezpośrednią odpowiedź na pytanie w pierwszych 2-3 zdaniach strony. AI modele preferują strony, które odpowiadają na pytanie natychmiast, bez wstępów.",
    impact: "Najsilniejszy sygnał cytowania — AI cytuje strony, które odpowiadają na pytanie w pierwszym akapicie.",
    priority: "critical",
  },
  {
    checkId: "cs_faq_section",
    label: "Sekcja FAQ",
    category: "contentStructure",
    categoryLabel: "Struktura treści",
    column: "cs_faq_section",
    recommendation: "Dodaj sekcję FAQ z pytaniami i odpowiedziami bezpośrednio związanymi z tematem strony. Użyj formatu pytanie-odpowiedź z nagłówkami H3.",
    impact: "FAQ bezpośrednio odpowiada na pytania użytkowników — AI modele często cytują strony z FAQ jako źródło odpowiedzi.",
    priority: "critical",
  },
  {
    checkId: "cs_tldr_summary",
    label: "Podsumowanie TL;DR / kluczowe punkty",
    category: "contentStructure",
    categoryLabel: "Struktura treści",
    column: "cs_tldr_summary",
    recommendation: "Dodaj sekcję 'W skrócie' lub 'Kluczowe informacje' na początku strony z 3-5 punktami. AI modele często cytują zwięzłe podsumowania.",
    impact: "Podsumowania są łatwe do zacytowania — AI może dosłownie użyć Twojego TL;DR jako odpowiedzi.",
    priority: "critical",
  },
  {
    checkId: "cs_passage_optimization",
    label: "Optymalizacja pod passage indexing",
    category: "contentStructure",
    categoryLabel: "Struktura treści",
    column: "cs_passage_optimization",
    recommendation: "Podziel treść na krótkie, samodzielne akapity (150-300 słów każdy), które odpowiadają na konkretne pytanie. Każdy akapit powinien mieć własny nagłówek.",
    impact: "AI modele wyodrębniają fragmenty (passages) — dobrze podzielona treść jest łatwiejsza do zacytowania.",
    priority: "high",
  },
  {
    checkId: "cs_semantic_chunking",
    label: "Semantyczne chunki treści",
    category: "contentStructure",
    categoryLabel: "Struktura treści",
    column: "cs_semantic_chunking",
    recommendation: "Organizuj treść w tematyczne bloki: każdy blok = jeden temat = jeden nagłówek. Unikaj mieszania różnych tematów w jednym akapicie.",
    impact: "Semantyczna struktura pomaga AI zrozumieć o czym jest każdy fragment i kiedy go cytować.",
    priority: "high",
  },
  {
    checkId: "cs_lists_present",
    label: "Listy i wyliczenia",
    category: "contentStructure",
    categoryLabel: "Struktura treści",
    column: "cs_lists_present",
    recommendation: "Przekształć kluczowe informacje w listy punktowane lub numerowane. Listy są łatwe do zacytowania i dobrze wyglądają w odpowiedziach AI.",
    impact: "Listy są najczęściej cytowanym formatem treści przez AI modele — szczególnie w odpowiedziach na pytania 'jak' i 'co'.",
    priority: "high",
  },
  {
    checkId: "cs_information_gain",
    label: "Unikalne informacje / information gain",
    category: "contentStructure",
    categoryLabel: "Struktura treści",
    column: "cs_information_gain",
    recommendation: "Dodaj unikalne dane, statystyki, case studies lub perspektywy, których nie ma u konkurencji. AI preferuje strony z oryginalną wartością informacyjną.",
    impact: "Strony z unikalną wartością informacyjną są cytowane częściej niż te powielające ogólnodostępne treści.",
    priority: "high",
  },
  {
    checkId: "cs_data_points",
    label: "Dane i statystyki",
    category: "contentStructure",
    categoryLabel: "Struktura treści",
    column: "cs_data_points",
    recommendation: "Dodaj konkretne liczby, procenty, daty i statystyki. Cytuj źródła. AI modele preferują treści z weryfikowalnymi danymi.",
    impact: "Konkretne dane zwiększają wiarygodność i są chętnie cytowane przez AI jako fakty.",
    priority: "high",
  },
  // Structured Data — high impact
  {
    checkId: "sd_faq_schema",
    label: "Schema FAQ (JSON-LD)",
    category: "structuredData",
    categoryLabel: "Dane strukturalne",
    column: "sd_faq_schema",
    recommendation: "Dodaj markup FAQ Schema (JSON-LD) do sekcji FAQ. To bezpośrednio komunikuje AI crawlerom, że strona zawiera pytania i odpowiedzi.",
    impact: "FAQ Schema jest jednym z najsilniejszych sygnałów dla AI — bezpośrednio informuje model o strukturze Q&A.",
    priority: "critical",
  },
  {
    checkId: "sd_howto_schema",
    label: "Schema HowTo (JSON-LD)",
    category: "structuredData",
    categoryLabel: "Dane strukturalne",
    column: "sd_howto_schema",
    recommendation: "Jeśli strona opisuje proces lub instrukcję, dodaj HowTo Schema z krokami. AI modele często cytują strony z HowTo dla zapytań 'jak to zrobić'.",
    impact: "HowTo Schema pozwala AI zrozumieć strukturę instrukcji i cytować konkretne kroki.",
    priority: "high",
  },
  {
    checkId: "sd_article_product",
    label: "Schema Article / Product",
    category: "structuredData",
    categoryLabel: "Dane strukturalne",
    column: "sd_article_product",
    recommendation: "Dodaj Article lub Product Schema z pełnymi metadanymi: autor, data publikacji, opis, cena (dla produktów).",
    impact: "Article/Product Schema pomaga AI zrozumieć kontekst strony i kiedy ją cytować.",
    priority: "high",
  },
  // E-E-A-T — medium-high impact
  {
    checkId: "eeat_author_byline",
    label: "Podpis autora / ekspert",
    category: "eeat",
    categoryLabel: "E-E-A-T",
    column: "eeat_author_byline",
    recommendation: "Dodaj widoczny podpis autora z jego tytułem i doświadczeniem. AI modele preferują treści podpisane przez ekspertów.",
    impact: "Podpis eksperta zwiększa wiarygodność (Expertise) — kluczowy sygnał E-E-A-T dla AI.",
    priority: "high",
  },
  {
    checkId: "eeat_experience_signals",
    label: "Sygnały doświadczenia (E-E-A-T)",
    category: "eeat",
    categoryLabel: "E-E-A-T",
    column: "eeat_experience_signals",
    recommendation: "Dodaj elementy pokazujące realne doświadczenie: case studies, własne zdjęcia, testy produktów, opinie z pierwszej ręki.",
    impact: "Experience (pierwsze E w E-E-A-T) to nowy sygnał Google — AI preferuje treści oparte na realnym doświadczeniu.",
    priority: "high",
  },
  // Meta Tags
  {
    checkId: "mt_meta_description",
    label: "Meta description",
    category: "metaTags",
    categoryLabel: "Meta tagi",
    column: "mt_meta_description",
    recommendation: "Napisz meta description jako bezpośrednią odpowiedź na główne pytanie strony (150-160 znaków). AI modele często używają meta description jako snippet.",
    impact: "Meta description jest często używana przez AI jako gotowy snippet odpowiedzi.",
    priority: "medium",
  },
];

// ─── Target Findings Extractor ────────────────────────────────────────────────
// Maps audit.findings (JSON) to the same boolean values as competitor_audits columns.

function extractTargetCheckValue(findings: AuditFindings, checkId: string): boolean {
  // Map checkId to the right category and check in findings
  const allChecks = [
    ...(findings.technical?.checks ?? []),
    ...(findings.structuredData?.checks ?? []),
    ...(findings.contentStructure?.checks ?? []),
    ...(findings.eeat?.checks ?? []),
    ...(findings.aiCrawlers?.checks ?? []),
    ...(findings.metaTags?.checks ?? []),
    ...(findings.brandAuthority?.checks ?? []),
  ];

  // Try direct id match first
  const check = allChecks.find(c => c.id === checkId);
  if (check) return check.status === "pass";

  // Fallback: partial match (e.g. "cs_faq_section" → "faq_section")
  const shortId = checkId.replace(/^[a-z]+_/, "");
  const fallback = allChecks.find(c => c.id.includes(shortId) || c.id === shortId);
  if (fallback) return fallback.status === "pass";

  return false;
}

// ─── Priority Calculator ──────────────────────────────────────────────────────

function calcOpportunityPriority(
  structuralGaps: StructuralGap[],
  engines: string[],
  competitorCitationCount: number
): "critical" | "high" | "medium" | "low" {
  const criticalGaps = structuralGaps.filter(g => g.priority === "critical").length;
  const engineCount = engines.length;

  if (criticalGaps >= 2 || (criticalGaps >= 1 && engineCount >= 3)) return "critical";
  if (criticalGaps >= 1 || (structuralGaps.length >= 3 && engineCount >= 2)) return "high";
  if (structuralGaps.length >= 2 || competitorCitationCount >= 3) return "medium";
  return "low";
}

// ─── Aha Moment Generator ─────────────────────────────────────────────────────
// Generates the one-sentence "aha moment" for each opportunity.

function generateAhaMoment(
  query: string,
  competitorDomain: string,
  structuralGaps: StructuralGap[],
  engines: string[]
): string {
  const engineNames: Record<string, string> = {
    chatgpt: "ChatGPT",
    google: "Google AI",
    perplexity: "Perplexity",
    gemini: "Gemini",
  };
  const engineStr = engines.map(e => engineNames[e] ?? e).join(", ");

  if (structuralGaps.length === 0) {
    return `${engineStr} cytuje ${competitorDomain} zamiast Ciebie — różnica jest subtelna, ale możliwa do zniwelowania.`;
  }

  const topGap = structuralGaps[0];
  return `${engineStr} cytuje ${competitorDomain} bo ma "${topGap.label}" — Twoja strona tego nie ma.`;
}

// ─── Level 2: LLM Semantic Analysis ──────────────────────────────────────────

const semanticCache = new Map<string, { result: SemanticInsight; expiresAt: number }>();

async function computeSemanticInsight(
  query: string,
  responseText: string,
  competitorUrl: string,
  targetUrl: string,
  language: string
): Promise<SemanticInsight | null> {
  const cacheKey = `${query}::${competitorUrl}`;
  const cached = semanticCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const langNote = language === "pl"
    ? "Odpowiedz w języku polskim."
    : `Respond in ${language === "en" ? "English" : language}.`;

  const systemPrompt = `You are an expert in AI Search Optimization (GEO/AEO). 
Your task is to analyze why an AI model cited a competitor URL instead of the target URL for a given query.
${langNote}
Always respond with valid JSON matching the exact schema provided.`;

  const userPrompt = `Query: "${query}"
Target URL (NOT cited): ${targetUrl}
Competitor URL (WAS cited): ${competitorUrl}

AI Response text (what the AI said when citing the competitor):
---
${responseText.slice(0, 1500)}
---

Analyze why the competitor was cited instead of the target. Return JSON with this exact schema:
{
  "queryIntent": "informational|comparison|how-to|definition|list|local|transactional",
  "responseType": "list|guide|comparison|definition|paragraph|faq|mixed",
  "winningFragment": "The specific type of content/fragment the competitor has that made AI cite it (1 sentence, specific)",
  "whyCompetitorWon": "Why the competitor was chosen over the target (1-2 sentences, specific and actionable)",
  "contentBrief": "Concrete instruction: what specific content to add/change on the target page to win this query next time (2-3 sentences, very specific)",
  "estimatedWordCount": 150,
  "isQuickWin": true
}

Rules:
- winningFragment must be specific (e.g. "direct answer in first paragraph" not "good content")
- contentBrief must be actionable and specific (e.g. "Add a 200-word FAQ section answering 'X' with a direct answer in the first sentence")
- estimatedWordCount: realistic estimate of content to add (50-500)
- isQuickWin: true if can be implemented in under 1 hour`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "semantic_insight",
          strict: true,
          schema: {
            type: "object",
            properties: {
              queryIntent: { type: "string" },
              responseType: { type: "string" },
              winningFragment: { type: "string" },
              whyCompetitorWon: { type: "string" },
              contentBrief: { type: "string" },
              estimatedWordCount: { type: "number" },
              isQuickWin: { type: "boolean" },
            },
            required: ["queryIntent", "responseType", "winningFragment", "whyCompetitorWon", "contentBrief", "estimatedWordCount", "isQuickWin"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response?.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = safeParseLLMJson<{
      queryIntent?: string;
      responseType?: string;
      winningFragment?: string;
      whyCompetitorWon?: string;
      contentBrief?: string;
      estimatedWordCount?: number;
      isQuickWin?: boolean;
    }>(typeof content === "string" ? content : JSON.stringify(content), {});
    const result: SemanticInsight = {
      queryIntent: (parsed.queryIntent ?? "informational") as QueryIntent,
      responseType: (parsed.responseType ?? "paragraph") as ResponseType,
      winningFragment: parsed.winningFragment ?? "",
      whyCompetitorWon: parsed.whyCompetitorWon ?? "",
      contentBrief: parsed.contentBrief ?? "",
      estimatedWordCount: Math.max(50, Math.min(500, parsed.estimatedWordCount ?? 150)),
      isQuickWin: Boolean(parsed.isQuickWin),
    };

    // Cache for 1 hour
    semanticCache.set(cacheKey, { result, expiresAt: Date.now() + 60 * 60 * 1000 });
    return result;
  } catch (err) {
    console.error("[OpportunityFinder] LLM error for query:", query, err);
    return null;
  }
}

// ─── Main Engine ──────────────────────────────────────────────────────────────

export async function computeOpportunities(
  auditId: number,
  options: { includeSemanticInsights?: boolean } = {}
): Promise<OpportunityFinderResult | null> {
  const db = await getDb();
  if (!db) return null;

  // 1. Load audit data
  const [auditRows, citationData, competitorAuditRows] = await Promise.all([
    db.select().from(audits).where(eq(audits.id, auditId)).limit(1),
    getCitationResultsForAudit(auditId),
    getCompetitorAuditsForAudit(auditId),
  ]);

  const audit = auditRows[0];
  if (!audit || !audit.findings) return null;

  const { job, checks } = citationData;
  if (!job || checks.length === 0) return null;

  const findings = audit.findings as unknown as AuditFindings;
  const targetUrl = audit.url;
  const language = job.language ?? "pl";

  // 2. Group checks by query — find queries where competitor was cited but not target
  const queryMap = new Map<string, typeof checks>();
  for (const check of checks) {
    const q = check.query?.trim();
    if (!q) continue;
    if (!queryMap.has(q)) queryMap.set(q, []);
    queryMap.get(q)!.push(check);
  }

  const totalQueriesChecked = queryMap.size;
  let queriesCited = 0;
  let queriesMissed = 0;

  // Build competitor lookup: domain → CompetitorAudit
  const competitorByDomain = new Map<string, CompetitorAudit>();
  for (const ca of competitorAuditRows) {
    if (ca.status === "completed") {
      competitorByDomain.set(ca.domain, ca);
    }
  }

  // 3. For each missed query, find the best competitor and compute gaps
  const opportunities: CitationOpportunity[] = [];

  for (const [query, queryChecks] of Array.from(queryMap.entries())) {
    const targetCited = queryChecks.some((c: { isCited: string }) => c.isCited === "yes" || c.isCited === "domain");

    if (targetCited) {
      queriesCited++;
      continue;
    }

    // Find all competitor URLs cited for this query
    const citedUrlsForQuery: string[] = [];
    let bestSnippet: string | null = null;
    let bestResponseText: string | null = null;
    const citingEngines: string[] = [];

    for (const check of queryChecks) {
      const cited = check.allCitedUrls as string[] | null;
      if (cited && cited.length > 0) {
        citedUrlsForQuery.push(...cited);
        queriesMissed++;
        if (!citingEngines.includes(check.engine)) citingEngines.push(check.engine);
        if (!bestSnippet && check.snippet) bestSnippet = check.snippet;
        if (!bestResponseText && check.responseText) bestResponseText = check.responseText;
        break; // count once per query
      }
    }

    if (citedUrlsForQuery.length === 0) continue;

    // Find the best competitor match (one with a completed audit)
    let bestCompetitor: CompetitorAudit | null = null;
    let bestCompetitorUrl = citedUrlsForQuery[0];

    for (const citedUrl of citedUrlsForQuery) {
      try {
        const domain = new URL(citedUrl).hostname.replace("www.", "");
        const ca = competitorByDomain.get(domain);
        if (ca) {
          bestCompetitor = ca;
          bestCompetitorUrl = citedUrl;
          break;
        }
      } catch { /* invalid URL */ }
    }

    // 4. Level 1: Structural diff
    const structuralGaps: StructuralGap[] = [];

    if (bestCompetitor) {
      for (const def of STRUCTURAL_CHECKS) {
        const competitorValue = bestCompetitor[def.column] as number | null;
        const competitorHas = def.inverted
          ? competitorValue === 0
          : competitorValue === 1;

        const targetHas = extractTargetCheckValue(findings, def.checkId);

        // Gap = competitor has it, target doesn't
        if (competitorHas && !targetHas) {
          structuralGaps.push({
            checkId: def.checkId,
            label: def.label,
            category: def.category,
            categoryLabel: def.categoryLabel,
            targetHas,
            competitorHas,
            recommendation: def.recommendation,
            impact: def.impact,
            priority: def.priority,
          });
        }
      }
    }

    // Sort gaps: critical first
    structuralGaps.sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2 };
      return (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
    });

    const competitorDomain = bestCompetitor?.domain ?? (() => {
      try { return new URL(bestCompetitorUrl).hostname.replace("www.", ""); }
      catch { return bestCompetitorUrl; }
    })();

    const priority = calcOpportunityPriority(
      structuralGaps,
      citingEngines,
      bestCompetitor?.citationCount ?? 1
    );

    const ahaMoment = generateAhaMoment(query, competitorDomain, structuralGaps, citingEngines);

    // 5. Level 2: Semantic insight (Pro only, on-demand)
    let semanticInsight: SemanticInsight | null = null;
    if (options.includeSemanticInsights && bestResponseText) {
      semanticInsight = await computeSemanticInsight(
        query,
        bestResponseText,
        bestCompetitorUrl,
        targetUrl,
        language
      );
    }

    opportunities.push({
      query,
      engines: citingEngines,
      competitorUrl: bestCompetitorUrl,
      competitorDomain,
      competitorTitle: bestCompetitor?.pageTitle ?? null,
      competitorCitationCount: bestCompetitor?.citationCount ?? 1,
      priority,
      structuralGaps,
      semanticInsight,
      ahaMoment,
      aiSnippet: bestSnippet,
    });
  }

  // 6. Sort opportunities: critical → high → medium → low, then by engine count
  const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
  opportunities.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 4;
    const pb = PRIORITY_ORDER[b.priority] ?? 4;
    if (pa !== pb) return pa - pb;
    return b.engines.length - a.engines.length;
  });

  // 7. Opportunity score: inverse of missed ratio, weighted by priority
  const missedWeight = opportunities.reduce((sum, o) => {
    const w = { critical: 4, high: 3, medium: 2, low: 1 }[o.priority] ?? 1;
    return sum + w;
  }, 0);
  const maxWeight = totalQueriesChecked * 4;
  const opportunityScore = maxWeight > 0
    ? Math.round(Math.max(0, 100 - (missedWeight / maxWeight) * 100))
    : 100;

  return {
    opportunities,
    totalQueriesChecked,
    queriesCited,
    queriesMissed,
    opportunityScore,
    language,
    analysedAt: new Date().toISOString(),
    hasSemanticInsights: options.includeSemanticInsights ?? false,
  };
}
