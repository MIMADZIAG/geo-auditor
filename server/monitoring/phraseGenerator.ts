/**
 * Phrase Generator — INTENT-MATRIX v4
 *
 * Architecture: reverse-engineering AI citation selection
 * ─────────────────────────────────────────────────────────
 * Instead of generating generic keyword phrases, this module performs
 * "citation reverse-engineering": given a page's content signals, it
 * predicts the EXACT QUESTIONS users type into AI engines that would
 * cause those engines to cite this specific page.
 *
 * Research basis:
 *   - Perplexity RAG pipeline: indexes pages by semantic chunks, retrieves
 *     by cosine similarity to user query. Best citation probability when
 *     query matches the page's "answer pattern" (question → direct answer).
 *   - Google AI Overviews: strongly correlated with top-10 organic positions.
 *     Prefers "featured snippet"-worthy content: direct answers, lists, tables.
 *     Query must have informational intent with moderate-to-high search volume.
 *   - ChatGPT Search: task-oriented queries. User asks ChatGPT to DO something
 *     (recommend, compare, explain). Cites sources when answering research queries.
 *   - Gemini: conversational + comparative. "X vs Y", "explain simply", follow-ups.
 *   - Profound 10M study: cited pages share 3 traits: (1) direct answer in first
 *     paragraph, (2) structured data (lists/tables/headers), (3) E-E-A-T signals.
 *
 * INTENT-MATRIX model:
 *   Layer 1 — ANCHOR queries: URL slug + title → exact match queries (highest P)
 *   Layer 2 — QUESTION queries: top_questions from CI → already validated by users
 *   Layer 3 — INTENT queries: LLM generates per-intent-type queries from page signals
 *     - informational: "co to jest X", "jak działa X", "czym jest X"
 *     - comparative: "X vs Y", "najlepszy X ranking", "porównanie X"
 *     - commercial: "ile kosztuje X", "cena X", "tani X"
 *     - how-to: "jak wybrać X", "jak zrobić X krok po kroku"
 *     - problem-solving: "dlaczego X nie działa", "co zrobić gdy X"
 *
 * Key design decisions:
 *   1. SHARED queries across all engines — the same question is the same question
 *      regardless of which AI engine processes it. Per-engine differentiation
 *      belongs in the query FRAMING (question words), not in topic selection.
 *   2. QUALITY over QUANTITY — 12 high-precision queries beat 50 generic ones.
 *      Each query must have a clear reason why THIS page would be cited for it.
 *   3. FULL QUESTIONS, not keyword phrases — "jak wybrać kredyt gotówkowy w 2024"
 *      not "kredyt gotówkowy". AI engines process natural language, not keywords.
 *   4. LANGUAGE-NATIVE — all queries in the page's detected language.
 *   5. RATIONALE-DRIVEN — each query includes a citation probability explanation
 *      so users understand the GEO logic behind their monitoring setup.
 */

import { invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import { audits } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { safeParseLLMJson } from "../utils/jsonSanitizer";

// ─── Types ────────────────────────────────────────────────────────────────────

export type IntentType =
  | "informational"
  | "comparative"
  | "commercial"
  | "how_to"
  | "problem_solving"
  | "navigational"
  | "transactional";

export interface GeneratedPhrase {
  phrase: string;
  rationale: string;
  intentType: IntentType;
  /** Which AI engines are most likely to cite this page for this query */
  engineAffinity: Array<"chatgpt" | "perplexity" | "gemini" | "google">;
  /** Estimated citation probability: high / medium / low */
  citationProbability: "high" | "medium" | "low";
  sortOrder: number;
}

export interface PhraseGenerationResult {
  phrases: GeneratedPhrase[];
  language: string;
  source: "ci_enriched" | "llm_only" | "fallback";
  intentCoverage: {
    informational: number;
    comparative: number;
    commercial: number;
    how_to: number;
    problem_solving: number;
  };
}

// ─── CI data extraction ───────────────────────────────────────────────────────

interface CISignals {
  topQuestions: string[];
  pageTopics: string[];
  semanticGaps: string[];
  entities: string[];
  title: string;
  h1: string;
  pageType: string;
  language: string;
  /** Direct answer snippets from the page — highest citation probability */
  directAnswers: string[];
  /** Comparative elements found on page (vs, porównanie, ranking) */
  comparativeElements: string[];
}

async function extractCISignals(url: string, userId?: number | null): Promise<CISignals | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select({
      contentIntelligence: audits.contentIntelligence,
      pageTitle: audits.pageTitle,
      pageType: audits.pageType,
    })
    .from(audits)
    .where(userId ? eq(audits.userId, userId) : eq(audits.url, url))
    .orderBy(desc(audits.createdAt))
    .limit(1);

  const row = rows[0];
  if (!row?.contentIntelligence) return null;

  const ci = row.contentIntelligence as any;

  // Layer 1: top_questions — already validated as real user queries
  const topQuestions: string[] = [];
  if (Array.isArray(ci.query_coverage?.top_questions)) {
    topQuestions.push(...(ci.query_coverage.top_questions as string[]).slice(0, 8));
  }

  // Layer 2: page_topics — semantic anchors
  const pageTopics: string[] = [];
  if (Array.isArray(ci.page_topics)) {
    pageTopics.push(...(ci.page_topics as string[]).slice(0, 5));
  }

  // Layer 3: semantic_gaps — what the page COULD answer but doesn't yet
  const semanticGaps: string[] = [];
  if (Array.isArray(ci.semantic_gaps)) {
    semanticGaps.push(...(ci.semantic_gaps as string[]).slice(0, 4));
  }

  // Layer 4: entities — named entities (brands, products, people, places)
  const entities: string[] = [];
  if (Array.isArray(ci.entities)) {
    entities.push(...(ci.entities as string[]).slice(0, 6));
  } else if (Array.isArray(ci.named_entities)) {
    entities.push(...(ci.named_entities as string[]).slice(0, 6));
  }

  // Layer 5: direct answers — first-paragraph answer patterns
  const directAnswers: string[] = [];
  if (Array.isArray(ci.direct_answers)) {
    directAnswers.push(...(ci.direct_answers as string[]).slice(0, 3));
  } else if (ci.query_coverage?.direct_answer) {
    directAnswers.push(ci.query_coverage.direct_answer);
  }

  // Layer 6: comparative elements
  const comparativeElements: string[] = [];
  if (Array.isArray(ci.comparative_elements)) {
    comparativeElements.push(...(ci.comparative_elements as string[]).slice(0, 3));
  }

  const language = ci.detected_language ?? ci.detectedLanguage ?? "en";

  return {
    topQuestions,
    pageTopics,
    semanticGaps,
    entities,
    title: row.pageTitle ?? "",
    h1: ci.h1 ?? ci.main_h1 ?? "",
    pageType: row.pageType ?? "article",
    language,
    directAnswers,
    comparativeElements,
  };
}

// ─── URL slug extraction ──────────────────────────────────────────────────────

function extractSlugQuery(url: string): string | null {
  try {
    const pathname = new URL(url).pathname.replace(/\/$/, "");
    const lastSegment = pathname.split("/").filter(Boolean).pop() ?? "";
    if (lastSegment.length < 4) return null;
    return lastSegment.replace(/-/g, " ").replace(/_/g, " ").trim();
  } catch {
    return null;
  }
}

// ─── Language instruction builder ────────────────────────────────────────────

function buildLanguageInstruction(language: string): string {
  const langMap: Record<string, string> = {
    pl: "JĘZYK: Wszystkie zapytania MUSZĄ być w języku polskim. Pisz naturalnie, tak jak użytkownik wpisuje pytanie w ChatGPT lub Perplexity — pełne zdania, nie słowa kluczowe.",
    de: "SPRACHE: Alle Anfragen MÜSSEN auf Deutsch sein. Natürliche Frageformulierungen, keine Keywords.",
    fr: "LANGUE: Toutes les requêtes DOIVENT être en français. Formulations naturelles, pas de mots-clés.",
    es: "IDIOMA: Todas las consultas DEBEN estar en español. Formulaciones naturales, no palabras clave.",
    it: "LINGUA: Tutte le query DEVONO essere in italiano.",
    en: "LANGUAGE: All queries MUST be in English. Natural question formulations, not keyword phrases.",
  };
  return langMap[language] ?? langMap.en;
}

// ─── Intent-matrix system prompt ─────────────────────────────────────────────

function buildSystemPrompt(maxPhrases: number, language: string): string {
  const langInstruction = buildLanguageInstruction(language);

  return `You are the world's leading GEO (Generative Engine Optimization) expert, specializing in reverse-engineering how AI engines select content for citations.

Your task: given a page's content signals, predict the EXACT QUESTIONS users type into AI engines (ChatGPT, Perplexity, Gemini, Google AI Overviews) that would cause those engines to cite this specific page.

${langInstruction}

## Citation Selection Mechanics (how each engine works)

**Perplexity**: RAG pipeline — indexes pages by semantic chunks, retrieves by cosine similarity to user query. Best citation probability when query matches the page's "answer pattern". Prefers full questions starting with question words (Jak/Co/Dlaczego/Który/Ile).

**Google AI Overviews**: Strongly correlated with top-10 organic positions. Prefers "featured snippet"-worthy content. Query must have informational intent. Triggers on "jak", "co to jest", "dlaczego", "ile kosztuje" patterns.

**ChatGPT Search**: Task-oriented queries. User asks ChatGPT to DO something (recommend, compare, explain). Cites sources when answering research or recommendation queries. Triggered by "pomóż mi", "jakie są najlepsze", "porównaj", "wyjaśnij".

**Gemini**: Conversational + comparative. "X vs Y", "wyjaśnij prosto", follow-up questions. Strong at nuanced comparisons.

## INTENT-MATRIX: Generate queries covering ALL 5 intent types

For each intent type, generate queries that:
1. Are FULL QUESTIONS (not keyword phrases) — "jak wybrać kredyt gotówkowy" not "kredyt gotówkowy"
2. Are SPECIFIC enough that this page could be one of 3-5 cited sources
3. Do NOT contain the domain name or URL
4. Match natural language patterns users actually type

**Intent types to cover:**
- informational (2-3 queries): "co to jest X", "jak działa X", "czym jest X", "dlaczego X"
- comparative (2 queries): "X vs Y", "najlepszy X ranking 2024", "porównanie X i Y"
- how_to (2 queries): "jak wybrać X", "jak zrobić X krok po kroku", "jak sprawdzić X"
- commercial (2 queries): "ile kosztuje X", "cena X", "tani X", "X opinie"
- problem_solving (1-2 queries): "dlaczego X nie działa", "co zrobić gdy X", "X problemy"

## Engine affinity rules
- informational → all engines (especially Google AI Overviews + Perplexity)
- comparative → ChatGPT + Gemini
- how_to → Perplexity + Google AI Overviews
- commercial → ChatGPT + Perplexity
- problem_solving → Perplexity + ChatGPT

## Citation probability scoring
- high: query directly matches a question the page answers in first paragraph
- medium: query matches a topic the page covers in depth
- low: query is adjacent to the page's topic but not the primary focus

Generate exactly ${maxPhrases} queries. Each must have a rationale explaining WHY this page would be cited for this query (reference specific engine behavior).

Return JSON only.`;
}

// ─── Main generator ───────────────────────────────────────────────────────────

export async function generatePhrasesForPage(params: {
  url: string;
  userId?: number | null;
  maxPhrases?: number;
}): Promise<PhraseGenerationResult> {
  const { url, userId, maxPhrases = 12 } = params;

  // Step 1: Pull CI signals from last audit
  const ci = await extractCISignals(url, userId);
  const hasCIData = ci && (ci.topQuestions.length > 0 || ci.pageTopics.length > 0);
  const language = ci?.language ?? "en";

  // Step 2: Build rich context for LLM
  const slugQuery = extractSlugQuery(url);

  const contextParts: string[] = [];

  if (slugQuery) {
    contextParts.push(`URL slug (anchor phrase): "${slugQuery}"`);
  }

  if (ci?.title) {
    contextParts.push(`Page title: ${ci.title}`);
  }

  if (ci?.h1) {
    contextParts.push(`H1: ${ci.h1}`);
  }

  if (ci?.pageType) {
    contextParts.push(`Page type: ${ci.pageType}`);
  }

  if (hasCIData) {
    if (ci!.topQuestions.length > 0) {
      contextParts.push(`\n## Validated user questions (from content analysis — highest priority):\n${ci!.topQuestions.map(q => `- ${q}`).join("\n")}`);
    }

    if (ci!.pageTopics.length > 0) {
      contextParts.push(`\n## Main page topics:\n${ci!.pageTopics.map(t => `- ${t}`).join("\n")}`);
    }

    if (ci!.entities.length > 0) {
      contextParts.push(`\n## Named entities on page (brands, products, concepts):\n${ci!.entities.map(e => `- ${e}`).join("\n")}`);
    }

    if (ci!.directAnswers.length > 0) {
      contextParts.push(`\n## Direct answers found on page (highest citation probability):\n${ci!.directAnswers.map(a => `- ${a}`).join("\n")}`);
    }

    if (ci!.comparativeElements.length > 0) {
      contextParts.push(`\n## Comparative elements (vs, ranking, comparison):\n${ci!.comparativeElements.map(c => `- ${c}`).join("\n")}`);
    }

    if (ci!.semanticGaps.length > 0) {
      contextParts.push(`\n## Semantic gaps (topics adjacent to page — useful for how_to and problem_solving queries):\n${ci!.semanticGaps.map(g => `- ${g}`).join("\n")}`);
    }
  }

  contextParts.push(`\nURL: ${url}`);

  const ciContext = contextParts.join("\n");

  // Step 3: LLM call with structured output
  const systemPrompt = buildSystemPrompt(maxPhrases, language);
  const userPrompt = `Page signals:\n${ciContext}\n\nGenerate ${maxPhrases} high-precision citation queries using the INTENT-MATRIX model.`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "intent_matrix_queries",
          strict: true,
          schema: {
            type: "object",
            properties: {
              queries: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    phrase: { type: "string" },
                    rationale: { type: "string" },
                    intentType: {
                      type: "string",
                      enum: [
                        "informational",
                        "comparative",
                        "commercial",
                        "how_to",
                        "problem_solving",
                        "navigational",
                        "transactional",
                      ],
                    },
                    engineAffinity: {
                      type: "array",
                      items: {
                        type: "string",
                        enum: ["chatgpt", "perplexity", "gemini", "google"],
                      },
                    },
                    citationProbability: {
                      type: "string",
                      enum: ["high", "medium", "low"],
                    },
                  },
                  required: [
                    "phrase",
                    "rationale",
                    "intentType",
                    "engineAffinity",
                    "citationProbability",
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ["queries"],
            additionalProperties: false,
          },
        },
      },
    });

    const text = result.choices[0]?.message?.content;
    if (!text) throw new Error("Empty LLM response");

    const parsed = safeParseLLMJson(typeof text === "string" ? text : JSON.stringify(text));
    const rawQueries = Array.isArray(parsed.queries) ? parsed.queries : [];

    const VALID_INTENTS: IntentType[] = [
      "informational",
      "comparative",
      "commercial",
      "how_to",
      "problem_solving",
      "navigational",
      "transactional",
    ];

    const VALID_ENGINES = ["chatgpt", "perplexity", "gemini", "google"];

    const phrases: GeneratedPhrase[] = rawQueries
      .filter(
        (q: any) =>
          typeof q.phrase === "string" &&
          q.phrase.trim().length > 5 &&
          typeof q.rationale === "string"
      )
      .slice(0, maxPhrases)
      .map((q: any, idx: number) => ({
        phrase: q.phrase.trim(),
        rationale: q.rationale.trim(),
        intentType: (VALID_INTENTS.includes(q.intentType) ? q.intentType : "informational") as IntentType,
        engineAffinity: Array.isArray(q.engineAffinity)
          ? q.engineAffinity.filter((e: any) => VALID_ENGINES.includes(e))
          : ["chatgpt", "perplexity", "gemini", "google"],
        citationProbability: (["high", "medium", "low"].includes(q.citationProbability)
          ? q.citationProbability
          : "medium") as "high" | "medium" | "low",
        sortOrder: idx,
      }));

    // Sort: high probability first, then by intent diversity
    phrases.sort((a, b) => {
      const probOrder = { high: 0, medium: 1, low: 2 };
      return probOrder[a.citationProbability] - probOrder[b.citationProbability];
    });

    // Recalculate sortOrder after sorting
    phrases.forEach((p, idx) => { p.sortOrder = idx; });

    if (phrases.length === 0) throw new Error("No valid queries generated");

    // Calculate intent coverage
    const intentCoverage = {
      informational: phrases.filter(p => p.intentType === "informational").length,
      comparative: phrases.filter(p => p.intentType === "comparative").length,
      commercial: phrases.filter(p => p.intentType === "commercial").length,
      how_to: phrases.filter(p => p.intentType === "how_to").length,
      problem_solving: phrases.filter(p => p.intentType === "problem_solving").length,
    };

    console.log(`[PhraseGenerator] Generated ${phrases.length} intent-matrix queries for ${url}. Coverage: ${JSON.stringify(intentCoverage)}`);

    return {
      phrases,
      language,
      source: hasCIData ? "ci_enriched" : "llm_only",
      intentCoverage,
    };
  } catch (err) {
    console.error("[PhraseGenerator] LLM generation failed:", err);

    // Fallback: use CI top_questions directly if available
    if (ci && ci.topQuestions.length > 0) {
      const fallbackPhrases: GeneratedPhrase[] = ci.topQuestions
        .slice(0, maxPhrases)
        .map((q, idx) => ({
          phrase: q,
          rationale: "Pytanie zidentyfikowane przez analizę treści jako realne zapytanie użytkowników AI.",
          intentType: "informational" as IntentType,
          engineAffinity: ["chatgpt", "perplexity", "gemini", "google"] as Array<"chatgpt" | "perplexity" | "gemini" | "google">,
          citationProbability: "medium" as const,
          sortOrder: idx,
        }));
      return {
        phrases: fallbackPhrases,
        language,
        source: "fallback",
        intentCoverage: { informational: fallbackPhrases.length, comparative: 0, commercial: 0, how_to: 0, problem_solving: 0 },
      };
    }

    // Last resort: URL slug
    const slugQuery = extractSlugQuery(url);
    if (slugQuery) {
      return {
        phrases: [{
          phrase: slugQuery,
          rationale: "URL slug jako anchor query — najwyższe prawdopodobieństwo cytowania dla tej konkretnej strony.",
          intentType: "informational",
          engineAffinity: ["chatgpt", "perplexity", "gemini", "google"],
          citationProbability: "high",
          sortOrder: 0,
        }],
        language,
        source: "fallback",
        intentCoverage: { informational: 1, comparative: 0, commercial: 0, how_to: 0, problem_solving: 0 },
      };
    }

    return {
      phrases: [],
      language,
      source: "fallback",
      intentCoverage: { informational: 0, comparative: 0, commercial: 0, how_to: 0, problem_solving: 0 },
    };
  }
}
