/**
 * AI Citation Worker v4 — Adaptive Fan-Out
 *
 * Strategy:
 *   1. Generate 5 entity-driven queries from Content Intelligence (keywords, top_questions)
 *   2. Check Google AI Overviews for each query (via SerpApi — reliable, no CAPTCHA)
 *   3. If NO citation found (exact URL or domain), generate 5 more queries (new round)
 *   4. Repeat up to 5 rounds (25 queries max)
 *   5. Stop early as soon as any citation is found
 *
 * Per query we collect:
 *   - isCited: "yes" | "domain" | "no"
 *   - allCitedUrls: every URL cited by AI (competitor domains)
 *   - competitorDomains: extracted hostnames (for Pro upsell)
 *   - round: which fan-out round (1–5)
 *
 * ChatGPT Search runs only in round 1 (cost control).
 * Google AI Overview runs in all rounds via SerpApi.
 */

import * as crypto from "crypto";
import * as cheerio from "cheerio";
import { invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import { citationChecks, citationJobs, audits } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { expandQueriesWithVariants } from "./morphologicalVariants";
import { getQueriesForUrl } from "./db";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CitationEngine = "chatgpt" | "google" | "perplexity" | "gemini";

export interface CitationResult {
  query: string;
  engine: CitationEngine;
  round: number;
  /** "yes" = exact URL cited | "domain" = different page same domain | "no" = not found */
  isCited: "yes" | "domain" | "no";
  citedUrl?: string;
  domainCitedUrl?: string;
  allCitedUrls: string[];
  competitorDomains: string[]; // extracted hostnames
  snippet?: string;
  responseText?: string;
  hasAIOverview?: boolean;
  fromCache?: boolean;
}

export interface CitationRound {
  round: number;
  queries: string[];
  results: CitationResult[];
  foundCitation: boolean; // true if any result is "yes" or "domain"
}

export interface CitationJobResult {
  jobId: number;
  auditId: number;
  url: string;
  rounds: CitationRound[];
  allResults: CitationResult[];
  totalQueriesChecked: number;
  foundCitation: boolean;
  summary: {
    chatgpt: { cited: number; domainCited: number; total: number; queriesWithAI: number };
    google: { cited: number; domainCited: number; total: number; queriesWithAI: number };
    perplexity: { cited: number; domainCited: number; total: number; queriesWithAI: number };
    gemini: { cited: number; domainCited: number; total: number; queriesWithAI: number };
  };
  allCompetitorDomains: { domain: string; count: number }[]; // ranked by frequency
}

// ─── Page Content Extraction ──────────────────────────────────────────────────

interface PageContent {
  title: string;
  h1: string;
  h2s: string[];
  metaDescription: string;
  language: string;
  // From Content Intelligence (if available)
  ciKeywords: string[];
  ciTopQuestions: string[];
  ciTopics: string[];
}

export async function extractPageContent(url: string, ciData?: any): Promise<PageContent> {
  try {
    const { default: axios } = await import("axios");
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GEOAuditor/4.0; +https://geoauditor.com)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "pl,en;q=0.9",
      },
      maxContentLength: 2 * 1024 * 1024,
    });

    const html = typeof response.data === "string" ? response.data : String(response.data);
    const $ = cheerio.load(html);

    const langAttr = $("html").attr("lang") ?? "";
    const lang = langAttr.toLowerCase().split("-")[0];
    const hasPolish = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(html.slice(0, 5000));
    const language = lang || (hasPolish ? "pl" : "en");

    const title = $("title").first().text().trim().replace(/\s+/g, " ").slice(0, 120);
    const h1 = $("h1").first().text().trim().replace(/\s+/g, " ").slice(0, 120);
    const h2s = $("h2").map((_, el) => $(el).text().trim().replace(/\s+/g, " ").slice(0, 80)).get().slice(0, 6);
    const metaDescription = ($("meta[name='description']").attr("content") ?? "").trim().slice(0, 200);

    // Extract CI data if available
    const ciKeywords: string[] = [];
    const ciTopQuestions: string[] = [];
    const ciTopics: string[] = [];

    if (ciData) {
      if (ciData.query_coverage?.top_questions) {
        ciTopQuestions.push(...(ciData.query_coverage.top_questions as string[]).slice(0, 8));
      }
      if (ciData.page_topics) {
        ciTopics.push(...(ciData.page_topics as string[]).slice(0, 6));
      }
      if (ciData.semantic_gaps) {
        ciKeywords.push(...(ciData.semantic_gaps as string[]).slice(0, 4));
      }
    }

    return { title, h1, h2s, metaDescription, language, ciKeywords, ciTopQuestions, ciTopics };
  } catch (e) {
    console.warn("[Citation] extractPageContent failed:", e);
    return { title: "", h1: "", h2s: [], metaDescription: "", language: "en", ciKeywords: [], ciTopQuestions: [], ciTopics: [] };
  }
}

// ─── Query Generation ─────────────────────────────────────────────────────────

/**
 * Per-engine citation patterns (reverse-engineered from AI search behavior):
 * - Google AI Overviews: informational/comparative intent, "how to", "best", "ranking"
 * - Perplexity: question-first intent, deep research, "What is", "How does", "Why"
 * - Gemini: conversational + comparative, "X vs Y", "Should I", "Explain"
 * - ChatGPT: task-oriented, "Help me choose", "Give me a list of", "What are the best"
 */
const ENGINE_QUERY_PROFILES: Record<CitationEngine, {
  description: string;
  polishModifiers: string[];
  englishModifiers: string[];
  intentNote: string;
}> = {
  google: {
    description: "Google AI Overviews",
    polishModifiers: ["najlepszy", "jak wybrać", "co to jest", "ranking", "porównanie", "poradnik", "wady zalety", "czy warto", "tanie"],
    englishModifiers: ["best", "how to choose", "what is", "guide", "top", "comparison", "pros cons", "worth it", "review"],
    intentNote: "Google AI Overviews trigger on informational/comparative queries with clear modifiers. Bare noun queries rarely trigger AI Overviews — ALWAYS add a modifier. Focus on 'how to', 'best', 'ranking', 'comparison' intents.",
  },
  perplexity: {
    description: "Perplexity AI",
    polishModifiers: ["jaki jest najlepszy", "jak działa", "dlaczego", "kiedy warto", "co to znaczy", "jak wybrać", "ile kosztuje", "jakie są zalety"],
    englishModifiers: ["what is the best", "how does", "why should I", "when to use", "what does mean", "how to choose", "how much does cost", "what are the benefits of"],
    intentNote: "Perplexity favors question-first, research-oriented queries. Users type full questions. Start queries with question words (Jaki/Jak/Dlaczego or What/How/Why). Perplexity excels at deep-research and factual queries.",
  },
  gemini: {
    description: "Google Gemini",
    polishModifiers: ["vs", "czy warto", "wyjaśnij", "porównaj", "pomóż mi wybrać", "jakie są różnice", "co lepsze", "alternatywy dla"],
    englishModifiers: ["vs", "should I", "explain", "compare", "help me choose", "what are the differences", "which is better", "alternatives to"],
    intentNote: "Gemini favors conversational and comparative queries. Use 'X vs Y' patterns, 'Should I use X or Y?', 'Explain X in simple terms'. Gemini is strong at nuanced comparisons and conversational follow-ups.",
  },
  chatgpt: {
    description: "ChatGPT Search",
    polishModifiers: ["pomóż mi", "daj mi listę", "jakie są najlepsze", "napisz mi", "stwórz", "wyjaśnij mi", "co polecasz", "jak mogę"],
    englishModifiers: ["help me", "give me a list of", "what are the best", "write me", "create", "explain to me", "what do you recommend", "how can I"],
    intentNote: "ChatGPT Search favors task-oriented, action-driven queries. Users ask ChatGPT to DO something. Use imperative or 'help me' framing. ChatGPT cites sources when answering research or recommendation queries.",
  },
};

function buildFallbackQueries(content: PageContent, url: string, round: number, engine: CitationEngine = "google"): string[] {
  const base = content.h1 || content.title || new URL(url).hostname;
  const isPolish = content.language === "pl";
  const profile = ENGINE_QUERY_PROFILES[engine];
  const mods = isPolish ? profile.polishModifiers : profile.englishModifiers;

  // Build engine-specific fallback sets
  const sets: string[][] = isPolish
    ? [
        [`${mods[0]} ${base}`, `${mods[1]} ${base}`, `${base} ${mods[2] ?? "ranking"}`, `${mods[3] ?? "co to jest"} ${base}`, `${base} ${mods[4] ?? "porównanie"}`],
        [`${base} 2025`, `${mods[1]} ${base}`, `${base} opinie`, `${mods[5] ?? "poradnik"} ${base}`, `${base} ${mods[6] ?? "wady zalety"}`],
        [`${mods[1]} ${base}`, `${base} krok po kroku`, `${base} poradnik`, `${base} przykład`, `${base} ${mods[6] ?? "wady zalety"}`],
        [`${base} dla początkujących`, `${base} online`, `${base} gotowe`, `${mods[7] ?? "czy warto"} ${base}`, `${base} recenzja`],
        [`${base} alternatywy`, `zamiast ${base}`, `${mods[7] ?? "czy warto"} ${base}`, `${base} doświadczenia`, `${base} opłacalność`],
      ]
    : [
        [`${mods[0]} ${base}`, `${mods[1]} ${base}`, `${base} ${mods[2] ?? "guide"}`, `${mods[3] ?? "what is"} ${base}`, `${base} ${mods[4] ?? "comparison"}`],
        [`top ${base} 2025`, `${mods[1]} ${base}`, `${base} reviews`, `${mods[5] ?? "guide"} ${base}`, `${base} ${mods[6] ?? "pros cons"}`],
        [`${base} step by step`, `${base} tips`, `${base} examples`, `${base} ${mods[6] ?? "pros cons"}`, `${base} explained`],
        [`${base} for beginners`, `${base} online`, `${base} ready made`, `${mods[7] ?? "worth it"} ${base}`, `${base} ${mods[4] ?? "comparison"}`],
        [`${base} alternatives`, `instead of ${base}`, `${base} experience`, `${base} ranking`, `${base} advice`],
      ];

  return (sets[round - 1] ?? sets[0]).slice(0, 5);
}

async function generateEngineQueries(
  content: PageContent,
  url: string,
  engine: CitationEngine,
  round: number,
  previousQueries: string[]
): Promise<string[]> {
  const { title, h1, h2s, metaDescription, language, ciKeywords, ciTopQuestions, ciTopics } = content;
  const profile = ENGINE_QUERY_PROFILES[engine];

  const langNote = language === "pl"
    ? "Generate ALL queries in POLISH (język polski). Use natural Polish phrasing."
    : `Generate ALL queries in the same language as the page (${language}).`;

  // Rich CI context — the more signals, the better the queries
  const pageSignals = [
    title && `Title: ${title}`,
    h1 && `H1: ${h1}`,
    h2s.length > 0 && `H2s: ${h2s.slice(0, 5).join(" | ")}`,
    metaDescription && `Meta description: ${metaDescription}`,
    ciTopics.length > 0 && `Page topics (Content Intelligence): ${ciTopics.join(", ")}`,
    ciTopQuestions.length > 0 && `Questions users ask about this topic: ${ciTopQuestions.slice(0, 6).join(" | ")}`,
    ciKeywords.length > 0 && `Semantic gaps / missing topics: ${ciKeywords.join(", ")}`,
  ].filter(Boolean).join("\n");

  const avoidNote = previousQueries.length > 0
    ? `\n\nDo NOT repeat these already-used queries:\n${previousQueries.map(q => `- "${q}"`).join("\n")}`
    : "";

  const roundContext = round === 1
    ? `Generate the 5 MOST LIKELY queries a user would type into ${profile.description} to find content like this page.`
    : round === 2
    ? `Previous queries found no citations. Try BROADER queries about the main topic on ${profile.description}.`
    : round === 3
    ? `Still no citations. Try queries about SPECIFIC subtopics, features, or use cases for ${profile.description}.`
    : round === 4
    ? `Try DIFFERENT ANGLES for ${profile.description}: comparisons, alternatives, how-to, or question-format.`
    : `Final attempt. Try the most GENERIC queries about the domain's industry or niche on ${profile.description}.`;

  try {
    const result = await invokeLLM({
      model: "gpt-4.1",
      messages: [
        {
          role: "system",
          content: `You are a world-class GEO (Generative Engine Optimization) expert specializing in reverse-engineering how ${profile.description} selects and cites content.

Your task: Generate exactly 5 search queries optimized for ${profile.description}'s citation algorithm.

## ${profile.description} Citation Behavior
${profile.intentNote}

## Round Context
${roundContext}

## Language Rule
${langNote}

## Query Requirements
- Each query must match the natural intent pattern of ${profile.description} users
- Use these proven modifiers for this engine (${language === "pl" ? "Polish" : "English"}): ${(language === "pl" ? profile.polishModifiers : profile.englishModifiers).slice(0, 5).join(", ")}
- Do NOT include the domain name or URL in queries
- Each query covers a DIFFERENT angle (topic, intent, specificity)
- Query length: 4-12 words${avoidNote}

Return ONLY a JSON object: { "queries": ["query1", "query2", "query3", "query4", "query5"] }`,
        },
        {
          role: "user",
          content: `Page signals:\n${pageSignals}\n\nURL: ${url}\nEngine: ${profile.description}\nRound: ${round}/5`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "queries",
          strict: true,
          schema: {
            type: "object",
            properties: { queries: { type: "array", items: { type: "string" } } },
            required: ["queries"],
            additionalProperties: false,
          },
        },
      },
    });

    const text = result.choices[0]?.message?.content;
    if (!text) return buildFallbackQueries(content, url, round, engine);

    const parsed = JSON.parse(typeof text === "string" ? text : JSON.stringify(text));
    const queries: string[] = Array.isArray(parsed.queries)
      ? parsed.queries
          .filter((q: unknown) => typeof q === "string" && q.trim().length > 3)
          .map((q: string) => q.trim())
          .slice(0, 5)
      : [];

    if (queries.length < 3) return buildFallbackQueries(content, url, round, engine);

    // ── Morphological expansion ──────────────────────────────────────────────
    // Generate 2 semantic/morphological variants per base query (rules + LLM).
    // Variants are appended after the base queries so originals always run first.
    // Total cap: 8 queries per engine per round to control API cost.
    const MAX_QUERIES_PER_ENGINE = 8;
    const slotsAvailable = MAX_QUERIES_PER_ENGINE - queries.length;

    if (slotsAvailable > 0) {
      try {
        // Only expand the top-3 base queries to keep variant quality high
        const seedQueries = queries.slice(0, 3);
        const { variants } = await expandQueriesWithVariants(
          seedQueries,
          content.language,
          2 // max variants per seed query
        );

        // Deduplicate against already-used queries (from previous rounds)
        const usedNorm = new Set(previousQueries.map(q => q.toLowerCase().trim()));
        const baseNorm = new Set(queries.map(q => q.toLowerCase().trim()));
        const freshVariants = variants
          .filter(v => {
            const norm = v.toLowerCase().trim();
            return !usedNorm.has(norm) && !baseNorm.has(norm);
          })
          .slice(0, slotsAvailable);

        if (freshVariants.length > 0) {
          console.log(`[Citation] Morphological variants for ${engine} round ${round}: +${freshVariants.length} (${freshVariants.join(" | ")})`);
          queries.push(...freshVariants);
        }
      } catch (e) {
        console.warn(`[Citation] Morphological expansion failed for ${engine} round ${round}:`, e);
        // Non-fatal — proceed with base queries only
      }
    }

    return queries;
  } catch (e) {
    console.warn(`[Citation] generateEngineQueries ${engine} round ${round} failed:`, e);
    return buildFallbackQueries(content, url, round, engine);
  }
}

/** Shared query generation for backward-compat (Google-optimized) */
async function generateRoundQueries(
  content: PageContent,
  url: string,
  round: number,
  previousQueries: string[]
): Promise<string[]> {
  return generateEngineQueries(content, url, "google", round, previousQueries);
}

// ─── Competitor Domain Extraction ─────────────────────────────────────────────

function extractCompetitorDomains(allCitedUrls: string[], targetDomain: string): string[] {
  const domains = new Set<string>();
  for (const url of allCitedUrls) {
    try {
      const hostname = new URL(url).hostname.replace("www.", "");
      if (hostname !== targetDomain && hostname.length > 0) {
        domains.add(hostname);
      }
    } catch {}
  }
  return Array.from(domains);
}

function rankCompetitorDomains(results: CitationResult[]): { domain: string; count: number }[] {
  const freq: Record<string, number> = {};
  for (const r of results) {
    for (const domain of r.competitorDomains) {
      freq[domain] = (freq[domain] ?? 0) + 1;
    }
  }
  return Object.entries(freq)
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count);
}

// ─── Cache Helpers ────────────────────────────────────────────────────────────

function makeCacheKey(query: string, engine: CitationEngine): string {
  return crypto.createHash("sha256").update(`${engine}::${query}`).digest("hex").slice(0, 64);
}

async function getCachedResult(cacheKey: string): Promise<CitationResult | null> {
  const db = await getDb();
  if (!db) return null;

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(citationChecks)
    .where(eq(citationChecks.cacheKey, cacheKey))
    .limit(1);

  const row = rows[0];
  if (!row || row.checkedAt < cutoff) return null;

  // IMPORTANT: Do NOT serve stale negative cache entries (hasAIOverview=false, isCited="no").
  // These may have been created with the old buggy SerpApi config (no location/mobile).
  // Only serve cache hits that actually found something useful.
  // Negative results expire after 4h instead of 24h to allow re-checking.
  const negativeCutoff = new Date(Date.now() - 4 * 60 * 60 * 1000);
  if (!row.hasAIOverview && row.isCited === "no" && row.checkedAt < negativeCutoff) {
    return null; // Force re-check for stale negative results
  }

  const allCitedUrls = Array.isArray(row.allCitedUrls) ? (row.allCitedUrls as string[]) : [];
  const competitorDomains = Array.isArray(row.competitorDomains)
    ? (row.competitorDomains as string[])
    : [];

  return {
    query: typeof row.query === "string" ? row.query : "",
    engine: row.engine as CitationEngine,
    round: row.round ?? 1,
    isCited: row.isCited as "yes" | "domain" | "no",
    citedUrl: row.citedUrl ?? undefined,
    domainCitedUrl: row.domainCitedUrl ?? undefined,
    allCitedUrls,
    competitorDomains,
    snippet: row.snippet ?? undefined,
    responseText: row.responseText ?? undefined,
    hasAIOverview: row.hasAIOverview ?? false,
    fromCache: true,
  };
}

async function saveResult(
  jobId: number,
  auditId: number,
  result: CitationResult,
  cacheKey: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.insert(citationChecks).values({
    jobId,
    auditId,
    query: result.query,
    engine: result.engine,
    isCited: result.isCited,
    citedUrl: result.citedUrl ?? null,
    domainCitedUrl: result.domainCitedUrl ?? null,
    allCitedUrls: result.allCitedUrls,
    competitorDomains: result.competitorDomains,
    snippet: result.snippet ?? null,
    responseText: result.responseText?.slice(0, 2000) ?? null,
    hasAIOverview: result.hasAIOverview ?? false,
    round: result.round,
    cacheKey,
  });
}

// ─── Engine 1: ChatGPT Search ─────────────────────────────────────────────────

async function checkChatGPT(query: string, targetUrl: string, round: number): Promise<CitationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { query, engine: "chatgpt", round, isCited: "no", allCitedUrls: [], competitorDomains: [], snippet: "OpenAI API key not configured" };
  }

  const targetDomain = new URL(targetUrl).hostname.replace("www.", "");
  const targetPath = new URL(targetUrl).pathname.replace(/\/$/, "");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-search-preview",
        web_search_options: {},
        messages: [{ role: "user", content: query }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.warn(`[Citation/ChatGPT] API error ${response.status}: ${err.slice(0, 200)}`);
      return { query, engine: "chatgpt", round, isCited: "no", allCitedUrls: [], competitorDomains: [] };
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;
    const responseText: string = message?.content ?? "";
    const allCitedUrls: string[] = [];

    for (const ann of message?.annotations ?? []) {
      if (ann.type === "url_citation" && ann.url_citation?.url) {
        const url = ann.url_citation.url.split("?utm_source=")[0];
        if (!allCitedUrls.includes(url)) allCitedUrls.push(url);
      }
    }

    const competitorDomains = extractCompetitorDomains(allCitedUrls, targetDomain);

    const exactCitation = allCitedUrls.find((u) => {
      try {
        const cu = new URL(u);
        return cu.hostname.replace("www.", "") === targetDomain &&
               cu.pathname.replace(/\/$/, "") === targetPath;
      } catch { return false; }
    });

    if (exactCitation) {
      return {
        query, engine: "chatgpt", round, isCited: "yes",
        citedUrl: exactCitation, allCitedUrls, competitorDomains,
        snippet: extractSnippet(responseText, targetDomain),
        responseText: responseText.slice(0, 1500),
      };
    }

    const domainCitation = allCitedUrls.find((u) => {
      try { return new URL(u).hostname.replace("www.", "") === targetDomain; }
      catch { return false; }
    });

    if (domainCitation) {
      return {
        query, engine: "chatgpt", round, isCited: "domain",
        domainCitedUrl: domainCitation, allCitedUrls, competitorDomains,
        snippet: extractSnippet(responseText, targetDomain),
        responseText: responseText.slice(0, 1500),
      };
    }

    return { query, engine: "chatgpt", round, isCited: "no", allCitedUrls, competitorDomains, responseText: responseText.slice(0, 800) };
  } catch (e) {
    console.warn("[Citation/ChatGPT] Error:", e);
    return { query, engine: "chatgpt", round, isCited: "no", allCitedUrls: [], competitorDomains: [] };
  }
}

// ─── Engine 2: Google AI Overviews (SerpApi) ──────────────────────────────────

/**
 * SerpApi response types for Google AI Overview
 */
interface SerpApiAIOverviewReference {
  title?: string;
  link?: string;
  snippet?: string;
  /**
   * SerpApi returns `source` as EITHER:
   *   - a plain string like "mfinanse.plhttps://mfinanse.pl" (direct response)
   *   - a string like "mFinanse" (deferred response)
   * Never an object — do NOT use ref.source?.link
   */
  source?: string | { name?: string; link?: string };
  thumbnail?: string;
  source_icon?: string;
  index?: number;
}

interface SerpApiAIOverview {
  // Direct result (text_blocks + references present)
  text_blocks?: Array<{ snippet?: string; type?: string; list?: Array<{ snippet?: string; title?: string }> }>;
  references?: SerpApiAIOverviewReference[];
  text?: string;
  // Deferred result (requires second request via google_ai_overview engine)
  page_token?: string;
  serpapi_link?: string;
  // Error
  error?: string;
}

interface SerpApiResponse {
  ai_overview?: SerpApiAIOverview;
  error?: string;
  search_metadata?: { status?: string };
}

// ─── Location map for SerpApi ─────────────────────────────────────────────────
const LOCALE_MAP: Record<string, { hl: string; gl: string; location: string }> = {
  pl: { hl: "pl", gl: "pl", location: "Warsaw, Poland" },
  en: { hl: "en", gl: "us", location: "United States" },
  de: { hl: "de", gl: "de", location: "Berlin, Germany" },
  fr: { hl: "fr", gl: "fr", location: "Paris, France" },
  es: { hl: "es", gl: "es", location: "Madrid, Spain" },
  it: { hl: "it", gl: "it", location: "Rome, Italy" },
};

/**
 * Fetch AI Overview data from SerpApi.
 * Handles both direct results (text_blocks present) and deferred results (page_token).
 * Uses device=mobile + location for significantly higher AI Overview detection rate.
 */
async function fetchSerpApiAIOverview(
  query: string,
  locale: { hl: string; gl: string; location: string },
  apiKey: string
): Promise<SerpApiAIOverview | null> {
  const { default: axios } = await import("axios");

  // ── Step 1: Main search ──────────────────────────────────────────────────────
  // device=mobile dramatically increases AI Overview appearance rate.
  // location=city-level simulates a real user in the target country.
  const params = new URLSearchParams({
    q: query,
    engine: "google",
    api_key: apiKey,
    hl: locale.hl,
    gl: locale.gl,
    location: locale.location,
    device: "mobile",  // mobile shows AI Overviews much more frequently
    num: "10",
  });

  const response = await axios.get<SerpApiResponse>(
    `https://serpapi.com/search.json?${params.toString()}`,
    { timeout: 30000 }
  );

  const data = response.data;

  if (data.error) {
    console.warn(`[Citation/Google/SerpApi] API error: ${data.error}`);
    return null;
  }

  const aiOverview = data.ai_overview;
  if (!aiOverview) {
    console.log(`[Citation/Google/SerpApi] No ai_overview key in response for: "${query.slice(0, 50)}"`);
    return null;
  }

  // ── Step 2: Handle deferred AI Overview (page_token) ────────────────────────
  // Google sometimes requires a second request to fetch the actual AI Overview content.
  // The page_token expires within ~1 minute — must be used immediately.
  // Deferred responses have: { page_token, serpapi_link } but NO text_blocks
  if (aiOverview.page_token && aiOverview.serpapi_link) {
    console.log(`[Citation/Google/SerpApi] page_token detected — fetching deferred AI Overview...`);
    try {
      // serpapi_link already contains the full URL with engine=google_ai_overview&page_token=...
      // We just need to append our api_key
      const deferredUrl = `${aiOverview.serpapi_link}&api_key=${apiKey}`;
      const deferredResponse = await axios.get<{ ai_overview?: SerpApiAIOverview }>(
        deferredUrl,
        { timeout: 25000 }
      );
      const deferredAO = deferredResponse.data?.ai_overview;
      if (deferredAO && deferredAO.text_blocks) {
        const refCount = deferredAO.references?.length ?? 0;
        console.log(`[Citation/Google/SerpApi] Deferred AI Overview fetched: ${deferredAO.text_blocks.length} blocks, ${refCount} refs`);
        return deferredAO;
      }
      // Deferred response came back but no text_blocks — AI Overview may not have loaded
      console.warn(`[Citation/Google/SerpApi] Deferred response had no text_blocks`);
    } catch (e) {
      console.warn(`[Citation/Google/SerpApi] Failed to fetch deferred AI Overview:`, e);
    }
    // page_token present but deferred fetch failed — return null (no usable data)
    return null;
  }

  // ── Step 3: Handle error response ───────────────────────────────────────────
  if (aiOverview.error && !aiOverview.text_blocks) {
    console.log(`[Citation/Google/SerpApi] AI Overview error: ${aiOverview.error}`);
    return null;
  }

  return aiOverview;
}

async function checkGoogleAIOverview(
  query: string,
  targetUrl: string,
  language: string = "en",
  round: number = 1
): Promise<CitationResult> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    console.warn("[Citation/Google] SERPAPI_API_KEY not configured");
    return {
      query, engine: "google", round, isCited: "no",
      allCitedUrls: [], competitorDomains: [],
      hasAIOverview: false,
      snippet: "SerpApi key not configured",
    };
  }

  const targetDomain = new URL(targetUrl).hostname.replace("www.", "");
  const targetPath = new URL(targetUrl).pathname.replace(/\/$/, "");
  const locale = LOCALE_MAP[language] ?? LOCALE_MAP.en;

  try {
    console.log(`[Citation/Google/SerpApi] Round ${round}: "${query.slice(0, 60)}" [${locale.hl}/${locale.gl}/${locale.location}]`);

    const aiOverview = await fetchSerpApiAIOverview(query, locale, apiKey);

    if (!aiOverview) {
      console.log(`[Citation/Google/SerpApi] No AI Overview for: "${query.slice(0, 50)}"`);
      return {
        query, engine: "google", round, isCited: "no",
        allCitedUrls: [], competitorDomains: [],
        hasAIOverview: false,
        snippet: "Brak AI Overview dla tego zapytania",
      };
    }

    // Extract all cited URLs from references
    // SerpApi returns different structures depending on whether the result is direct or deferred:
    //   Direct:   { link, source: "domain.comhttps://domain.com", index }
    //   Deferred: { title, link, snippet, source: "DisplayName", thumbnail, source_icon, index }
    // In BOTH cases, `link` is the canonical URL. Never rely on `source` for the URL.
    const allCitedUrls: string[] = [];
    const references = aiOverview.references ?? [];

    for (const ref of references) {
      // `link` is always the correct field — present in both direct and deferred responses
      const rawLink = ref.link;
      if (rawLink && rawLink.startsWith("http")) {
        // Strip fragment (#...), text fragments (:~:text=...), and query tracking params
        let cleanUrl = rawLink;
        // Remove :~:text= fragment (Google text highlight)
        cleanUrl = cleanUrl.split("#:~:text=")[0];
        // Remove regular fragment
        cleanUrl = cleanUrl.split("#")[0];
        // Remove trailing slash for consistency
        cleanUrl = cleanUrl.replace(/\/$/, "");
        // Filter out Google internal URLs
        try {
          const h = new URL(cleanUrl).hostname;
          if (!h.includes("google.com") && !h.includes("translate.") && cleanUrl.length > 10) {
            if (!allCitedUrls.includes(cleanUrl)) allCitedUrls.push(cleanUrl);
          }
        } catch { /* invalid URL, skip */ }
      }
    }

    // Build overview text from text_blocks (including nested list items)
    const textParts: string[] = [];
    for (const block of aiOverview.text_blocks ?? []) {
      if (block.snippet) textParts.push(block.snippet);
      if (block.list) {
        for (const item of block.list) {
          if (item.snippet) textParts.push(item.snippet);
        }
      }
    }
    if (aiOverview.text) textParts.push(aiOverview.text);
    const overviewText = textParts.filter(Boolean).join(" ").slice(0, 2000);

    console.log(`[Citation/Google/SerpApi] AI Overview found: ${references.length} raw refs → ${allCitedUrls.length} clean URLs`);
    if (allCitedUrls.length > 0) {
      console.log(`[Citation/Google/SerpApi] Cited URLs: ${allCitedUrls.slice(0, 5).join(" | ")}`);
    }

    const competitorDomains = extractCompetitorDomains(allCitedUrls, targetDomain);

    // Check for exact URL citation
    const exactCitation = allCitedUrls.find((u) => {
      try {
        const cu = new URL(u);
        return cu.hostname.replace("www.", "") === targetDomain &&
               cu.pathname.replace(/\/$/, "") === targetPath;
      } catch { return false; }
    });

    if (exactCitation) {
      return {
        query, engine: "google", round, isCited: "yes",
        citedUrl: exactCitation, allCitedUrls, competitorDomains,
        hasAIOverview: true,
        snippet: extractSnippet(overviewText, targetDomain),
        responseText: overviewText.slice(0, 1500),
      };
    }

    // Check for domain-level citation (different page, same domain)
    const domainCitation = allCitedUrls.find((u) => {
      try { return new URL(u).hostname.replace("www.", "") === targetDomain; }
      catch { return false; }
    });

    if (domainCitation) {
      return {
        query, engine: "google", round, isCited: "domain",
        domainCitedUrl: domainCitation, allCitedUrls, competitorDomains,
        hasAIOverview: true,
        snippet: extractSnippet(overviewText, targetDomain),
        responseText: overviewText.slice(0, 1500),
      };
    }

    return {
      query, engine: "google", round, isCited: "no",
      allCitedUrls, competitorDomains,
      hasAIOverview: true,
      responseText: overviewText.slice(0, 800),
    };
  } catch (e) {
    console.warn("[Citation/Google/SerpApi] Error:", e);
    return { query, engine: "google", round, isCited: "no", allCitedUrls: [], competitorDomains: [], hasAIOverview: false };
  }
}

// ─── Engine 3: Perplexity Sonar ─────────────────────────────────────────────

async function checkPerplexity(query: string, targetUrl: string, round: number): Promise<CitationResult> {
  const apiKey = process.env.SONAR_API_KEY;
  if (!apiKey) {
    return { query, engine: "perplexity", round, isCited: "no", allCitedUrls: [], competitorDomains: [], snippet: "Perplexity API key not configured" };
  }
  const targetDomain = new URL(targetUrl).hostname.replace("www.", "");
  const targetPath = new URL(targetUrl).pathname.replace(/\/$/, "");
  try {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [{ role: "user", content: query }],
        return_citations: true,
        return_related_questions: false,
        search_recency_filter: "month",
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      console.warn(`[Citation/Perplexity] API error ${response.status}: ${err.slice(0, 200)}`);
      return { query, engine: "perplexity", round, isCited: "no", allCitedUrls: [], competitorDomains: [] };
    }
    const data = await response.json();
    const message = data.choices?.[0]?.message;
    const responseText: string = message?.content ?? "";
    // Perplexity returns citations as array of URLs in data.citations
    const rawCitations: string[] = Array.isArray(data.citations) ? data.citations : [];
    const allCitedUrls: string[] = rawCitations
      .filter((u: string) => typeof u === "string" && u.startsWith("http"))
      .map((u: string) => u.split("#")[0].replace(/\/$/, ""))
      .filter((u: string, i: number, arr: string[]) => arr.indexOf(u) === i);
    const competitorDomains = extractCompetitorDomains(allCitedUrls, targetDomain);
    const exactCitation = allCitedUrls.find((u) => {
      try {
        const cu = new URL(u);
        return cu.hostname.replace("www.", "") === targetDomain && cu.pathname.replace(/\/$/, "") === targetPath;
      } catch { return false; }
    });
    if (exactCitation) {
      return { query, engine: "perplexity", round, isCited: "yes", citedUrl: exactCitation, allCitedUrls, competitorDomains, hasAIOverview: true, snippet: extractSnippet(responseText, targetDomain), responseText: responseText.slice(0, 1500) };
    }
    const domainCitation = allCitedUrls.find((u) => { try { return new URL(u).hostname.replace("www.", "") === targetDomain; } catch { return false; } });
    if (domainCitation) {
      return { query, engine: "perplexity", round, isCited: "domain", domainCitedUrl: domainCitation, allCitedUrls, competitorDomains, hasAIOverview: true, snippet: extractSnippet(responseText, targetDomain), responseText: responseText.slice(0, 1500) };
    }
    return { query, engine: "perplexity", round, isCited: "no", allCitedUrls, competitorDomains, hasAIOverview: allCitedUrls.length > 0, responseText: responseText.slice(0, 800) };
  } catch (e) {
    console.warn("[Citation/Perplexity] Error:", e);
    return { query, engine: "perplexity", round, isCited: "no", allCitedUrls: [], competitorDomains: [] };
  }
}

// ─── Engine 4: Google Gemini (grounding) ─────────────────────────────────────

// ─── Gemini grounding URL extractor (shared between primary and fallback) ────
function extractGeminiCitedUrls(groundingChunks: Array<{ web?: { uri?: string; title?: string } }>): string[] {
  const allCitedUrls: string[] = [];
  for (const chunk of groundingChunks) {
    const uri = chunk.web?.uri ?? "";
    const title = chunk.web?.title ?? "";
    // Gemini grounding API wraps real URLs in vertexaisearch redirect wrappers.
    // Real domain is recoverable from chunk.web.title (e.g. "ocar.pl" or "site.com - Page Title").
    const isRedirect = uri.includes("grounding-api-redirect") || uri.includes("vertexaisearch");
    if (!isRedirect && uri.startsWith("http")) {
      const clean = uri.split("#")[0].replace(/\/$/, "");
      if (!allCitedUrls.includes(clean)) allCitedUrls.push(clean);
    } else if (title) {
      const rawHost = title.split(" ")[0].replace(/[^a-zA-Z0-9.-]/g, "").toLowerCase();
      if (rawHost && rawHost.includes(".")) {
        const canonical = `https://${rawHost}`;
        if (!allCitedUrls.includes(canonical)) allCitedUrls.push(canonical);
      }
    }
  }
  return allCitedUrls;
}

// ─── Gemini single-model attempt ─────────────────────────────────────────────
async function callGeminiModel(
  model: string,
  query: string,
  apiKey: string
): Promise<{ ok: true; data: unknown } | { ok: false; status: number; body: string }> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: query }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
      }),
    }
  );
  if (!response.ok) {
    const body = await response.text();
    return { ok: false, status: response.status, body };
  }
  return { ok: true, data: await response.json() };
}

async function checkGemini(query: string, targetUrl: string, round: number): Promise<CitationResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { query, engine: "gemini", round, isCited: "no", allCitedUrls: [], competitorDomains: [], snippet: "Gemini API key not configured" };
  }
  const targetDomain = new URL(targetUrl).hostname.replace("www.", "");
  const targetPath = new URL(targetUrl).pathname.replace(/\/$/, "");
  // Model cascade: primary → fallback on 429 (quota exhausted)
  const GEMINI_MODELS = ["gemini-2.5-flash-lite", "gemini-flash-lite-latest"];
  try {
    let data: unknown = null;
    for (const model of GEMINI_MODELS) {
      const result = await callGeminiModel(model, query, apiKey);
      if (result.ok) {
        data = result.data;
        break;
      }
      // 429 = quota exhausted → try next model; any other error → give up
      if (result.status === 429) {
        console.warn(`[Citation/Gemini] Model ${model} quota exhausted (429), trying fallback...`);
        continue;
      }
      console.warn(`[Citation/Gemini] API error ${result.status} on ${model}: ${result.body.slice(0, 200)}`);
      return { query, engine: "gemini", round, isCited: "no", allCitedUrls: [], competitorDomains: [] };
    }
    if (!data) {
      console.warn("[Citation/Gemini] All models quota exhausted — skipping Gemini for this query");
      return { query, engine: "gemini", round, isCited: "no", allCitedUrls: [], competitorDomains: [] };
    }
    const candidate = (data as { candidates?: unknown[] })?.candidates?.[0] as Record<string, unknown> | undefined;
    const responseText: string = (candidate?.content as { parts?: Array<{ text?: string }> })?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const groundingChunks: Array<{ web?: { uri?: string; title?: string } }> =
      (candidate?.groundingMetadata as { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> })?.groundingChunks ?? [];
    const searchEntryPoint = (candidate?.groundingMetadata as { searchEntryPoint?: unknown } | undefined)?.searchEntryPoint;
    const allCitedUrls = extractGeminiCitedUrls(groundingChunks);
    const hasGrounding = allCitedUrls.length > 0 || !!searchEntryPoint;
    const competitorDomains = extractCompetitorDomains(allCitedUrls, targetDomain);
    // Exact URL match
    const exactCitation = allCitedUrls.find((u) => {
      try {
        const cu = new URL(u);
        return cu.hostname.replace("www.", "") === targetDomain && cu.pathname.replace(/\/$/, "") === targetPath;
      } catch { return false; }
    });
    if (exactCitation) {
      return { query, engine: "gemini", round, isCited: "yes", citedUrl: exactCitation, allCitedUrls, competitorDomains, hasAIOverview: true, snippet: extractSnippet(responseText, targetDomain), responseText: responseText.slice(0, 1500) };
    }
    // Domain-level match
    const domainCitation = allCitedUrls.find((u) => { try { return new URL(u).hostname.replace("www.", "") === targetDomain; } catch { return false; } });
    if (domainCitation) {
      return { query, engine: "gemini", round, isCited: "domain", domainCitedUrl: domainCitation, allCitedUrls, competitorDomains, hasAIOverview: true, snippet: extractSnippet(responseText, targetDomain), responseText: responseText.slice(0, 1500) };
    }
    return { query, engine: "gemini", round, isCited: "no", allCitedUrls, competitorDomains, hasAIOverview: hasGrounding, responseText: responseText.slice(0, 800) };
  } catch (e) {
    console.warn("[Citation/Gemini] Error:", e);
    return { query, engine: "gemini", round, isCited: "no", allCitedUrls: [], competitorDomains: [] };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractSnippet(text: string, domain: string): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(domain.toLowerCase());
  if (idx === -1) return text.slice(0, 200);
  const start = Math.max(0, idx - 80);
  const end = Math.min(text.length, idx + 150);
  return "..." + text.slice(start, end) + "...";
}

function hasCitation(results: CitationResult[]): boolean {
  return results.some((r) => r.isCited === "yes" || r.isCited === "domain");
}

// ─── Main Job Runner ──────────────────────────────────────────────────────────

export async function runCitationJob(jobId: number): Promise<CitationJobResult | null> {
  const db = await getDb();
  if (!db) return null;

  const jobs = await db.select().from(citationJobs).where(eq(citationJobs.id, jobId)).limit(1);
  const job = jobs[0];
  if (!job) return null;

  await db.update(citationJobs).set({ status: "running" }).where(eq(citationJobs.id, jobId));

  try {
    console.log(`[Citation] Job ${jobId}: starting adaptive fan-out for ${job.url}`);

    // Step 1: Extract page content + CI data
    const auditRows = await db.select().from(audits).where(eq(audits.id, job.auditId)).limit(1);
    const auditRow = auditRows[0];
    const ciData = auditRow?.contentIntelligence ?? null;

    const pageContent = await extractPageContent(job.url, ciData);
    const language = pageContent.language;

    await db.update(citationJobs)
      .set({ language })
      .where(eq(citationJobs.id, jobId));

    // Step 2: Reuse proven queries from last completed job for this URL (analytical consistency + cost reduction)
    const cachedQueries = await getQueriesForUrl(job.url);
    if (cachedQueries) {
      const total = Object.values(cachedQueries).flat().length;
      console.log(`[Citation] Job ${jobId}: reusing ${total} cached queries from previous job for ${job.url} (skipping LLM generation for round 1)`);
    } else {
      console.log(`[Citation] Job ${jobId}: no cached queries — generating fresh via LLM`);
    }

    // Step 3: Adaptive fan-out loop (max 5 rounds × 5 queries)
    const MAX_ROUNDS = 5;
    const allResults: CitationResult[] = [];
    const rounds: CitationRound[] = [];
    const usedQueries: string[] = [];
    let foundCitation = false;

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      if (foundCitation) break;

      console.log(`[Citation] Job ${jobId}: Round ${round}/${MAX_ROUNDS}`);

      // Round 1: use cached queries if available (consistency + cost), otherwise generate fresh
      // Round 2+: always generate fresh (broader fan-out to find new citations)
      let googleQueries: string[];
      let chatgptQueries: string[];
      let perplexityQueries: string[];
      let geminiQueries: string[];

      if (round === 1 && cachedQueries) {
        googleQueries = (cachedQueries["google"] ?? []).slice(0, 8);
        chatgptQueries = (cachedQueries["chatgpt"] ?? []).slice(0, 8);
        perplexityQueries = (cachedQueries["perplexity"] ?? []).slice(0, 8);
        geminiQueries = (cachedQueries["gemini"] ?? []).slice(0, 8);
      } else {
        [googleQueries, chatgptQueries, perplexityQueries, geminiQueries] = await Promise.all([
          generateEngineQueries(pageContent, job.url, "google", round, usedQueries),
          round === 1 ? generateEngineQueries(pageContent, job.url, "chatgpt", round, usedQueries) : Promise.resolve([] as string[]),
          round === 1 ? generateEngineQueries(pageContent, job.url, "perplexity", round, usedQueries) : Promise.resolve([] as string[]),
          round === 1 ? generateEngineQueries(pageContent, job.url, "gemini", round, usedQueries) : Promise.resolve([] as string[]),
        ]);
      }

      // Track all queries used (deduplicated) for avoid-repetition in next rounds
      const allRoundQueries = Array.from(new Set([...googleQueries, ...chatgptQueries, ...perplexityQueries, ...geminiQueries]));
      usedQueries.push(...allRoundQueries);

      console.log(`[Citation] Job ${jobId}: Round ${round} queries — google:${googleQueries.length} chatgpt:${chatgptQueries.length} perplexity:${perplexityQueries.length} gemini:${geminiQueries.length} [${round === 1 && cachedQueries ? "CACHED" : "FRESH"}]`);

      const roundResults: CitationResult[] = [];

      // Google AI Overview — run in ALL rounds with Google-optimized queries
      for (const query of googleQueries) {
        const cacheKey = makeCacheKey(query, "google");
        const cached = await getCachedResult(cacheKey);
        let result: CitationResult;
        if (cached) {
          result = { ...cached, round };
        } else {
          result = await checkGoogleAIOverview(query, job.url, language, round);
          await saveResult(jobId, job.auditId, result, cacheKey);
          await new Promise((r) => setTimeout(r, 800));
        }
        roundResults.push(result);
        allResults.push(result);
      }

      // ChatGPT, Perplexity, Gemini — round 1 only, each with engine-optimized queries
      if (round === 1) {
        for (const query of chatgptQueries) {
          const cacheKey = makeCacheKey(query, "chatgpt");
          const cached = await getCachedResult(cacheKey);
          let result: CitationResult;
          if (cached) {
            result = { ...cached, round };
          } else {
            result = await checkChatGPT(query, job.url, round);
            await saveResult(jobId, job.auditId, result, cacheKey);
            await new Promise((r) => setTimeout(r, 800));
          }
          roundResults.push(result);
          allResults.push(result);
        }

        for (const query of perplexityQueries) {
          const cacheKey = makeCacheKey(query, "perplexity");
          const cached = await getCachedResult(cacheKey);
          let result: CitationResult;
          if (cached) {
            result = { ...cached, round };
          } else {
            result = await checkPerplexity(query, job.url, round);
            await saveResult(jobId, job.auditId, result, cacheKey);
            await new Promise((r) => setTimeout(r, 800));
          }
          roundResults.push(result);
          allResults.push(result);
        }

        for (const query of geminiQueries) {
          const cacheKey = makeCacheKey(query, "gemini");
          const cached = await getCachedResult(cacheKey);
          let result: CitationResult;
          if (cached) {
            result = { ...cached, round };
          } else {
            result = await checkGemini(query, job.url, round);
            await saveResult(jobId, job.auditId, result, cacheKey);
            await new Promise((r) => setTimeout(r, 800));
          }
          roundResults.push(result);
          allResults.push(result);
        }
      }

      const roundFoundCitation = hasCitation(roundResults);
      rounds.push({
        round,
        queries: allRoundQueries, // store all engine queries for this round
        results: roundResults,
        foundCitation: roundFoundCitation,
      });

      if (roundFoundCitation) {
        foundCitation = true;
        console.log(`[Citation] Job ${jobId}: Citation found in round ${round}! Stopping.`);
      } else {
        console.log(`[Citation] Job ${jobId}: Round ${round} — no citation found. ${round < MAX_ROUNDS ? "Continuing..." : "Max rounds reached."}`);
      }
    }

    // Step 3: Build summary
    const summary = {
      chatgpt: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 },
      google: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 },
      perplexity: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 },
      gemini: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 },
    };
    for (const r of allResults) {
      const eng = r.engine as "chatgpt" | "google" | "perplexity" | "gemini";
      summary[eng].total++;
      if (r.isCited === "yes") summary[eng].cited++;
      if (r.isCited === "domain") summary[eng].domainCited++;
      if (r.hasAIOverview !== false && (r.allCitedUrls.length > 0 || r.isCited !== "no")) {
        summary[eng].queriesWithAI++;
      }
    }

    const allCompetitorDomains = rankCompetitorDomains(allResults);

    // Save all queries used
    await db.update(citationJobs)
      .set({
        status: "completed",
        completedAt: new Date(),
        prompts: usedQueries,
      })
      .where(eq(citationJobs.id, jobId));

    console.log(`[Citation] Job ${jobId}: completed. Rounds: ${rounds.length}, Found: ${foundCitation}, Competitors: ${allCompetitorDomains.length}`);

    return {
      jobId,
      auditId: job.auditId,
      url: job.url,
      rounds,
      allResults,
      totalQueriesChecked: usedQueries.length,
      foundCitation,
      summary,
      allCompetitorDomains,
    };
  } catch (e) {
    console.error(`[Citation] Job ${jobId} failed:`, e);
    await db.update(citationJobs).set({ status: "failed" }).where(eq(citationJobs.id, jobId));
    return null;
  }
}

// ─── Legacy exports ───────────────────────────────────────────────────────────

export function detectPageLanguage(html: string, pageTitle: string): string {
  const langMatch = html.match(/<html[^>]+lang=["']([a-zA-Z-]+)["']/i);
  if (langMatch) return langMatch[1].toLowerCase().split("-")[0];
  if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(pageTitle)) return "pl";
  return "en";
}
