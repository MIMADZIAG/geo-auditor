/**
 * Phrase Generator — Monitoring v3
 *
 * Generates a stable, ranked set of search phrases for a monitored page.
 * Phrases are grounded in Content Intelligence (CI) data from the last audit,
 * ensuring they reflect the actual topics and questions the page covers.
 *
 * Design principles:
 *   1. CI-first: top_questions and page_topics from the last audit are the
 *      primary signal — they are already in the page's native language and
 *      represent what AI engines are likely to query.
 *   2. LLM enrichment: CI signals are passed to LLM which adds rationale,
 *      intent classification, and fills gaps where CI data is thin.
 *   3. Language-native: all phrases are generated in the page's detected language.
 *   4. Deterministic count: returns exactly maxPhrases phrases (or fewer if
 *      content is too thin), sorted by expected citation probability.
 *   5. No duplication with citation worker: this module is for INITIALIZATION
 *      only. The citation worker uses stored phrases from monitored_page_phrases.
 */

import { invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import { audits } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { safeParseLLMJson } from "../utils/jsonSanitizer";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GeneratedPhrase {
  phrase: string;
  rationale: string;
  intentType: "informational" | "navigational" | "commercial" | "transactional";
  sortOrder: number;
}

export interface PhraseGenerationResult {
  phrases: GeneratedPhrase[];
  language: string;
  source: "ci_enriched" | "llm_only" | "fallback";
}

// ─── CI data extraction ───────────────────────────────────────────────────────

interface CISignals {
  topQuestions: string[];
  pageTopics: string[];
  semanticGaps: string[];
  title: string;
  h1: string;
  pageType: string;
  language: string;
}

async function extractCISignals(url: string, userId?: number | null): Promise<CISignals | null> {
  const db = await getDb();
  if (!db) return null;

  // Find the most recent completed audit for this URL (owned by this user or public)
  const conditions = [eq(audits.url, url), eq(audits.status, "completed")];

  const rows = await db
    .select({
      contentIntelligence: audits.contentIntelligence,
      pageTitle: audits.pageTitle,
      pageType: audits.pageType,
    })
    .from(audits)
    .where(
      userId
        ? eq(audits.userId, userId)
        : eq(audits.url, url)
    )
    .orderBy(desc(audits.createdAt))
    .limit(1);

  const row = rows[0];
  if (!row?.contentIntelligence) return null;

  const ci = row.contentIntelligence as any;

  // Extract top_questions from query_coverage dimension
  const topQuestions: string[] = [];
  if (Array.isArray(ci.query_coverage?.top_questions)) {
    topQuestions.push(...(ci.query_coverage.top_questions as string[]).slice(0, 8));
  }

  // Extract page_topics
  const pageTopics: string[] = [];
  if (Array.isArray(ci.page_topics)) {
    pageTopics.push(...(ci.page_topics as string[]).slice(0, 5));
  }

  // Extract semantic_gaps (missing subtopics — good for additional phrases)
  const semanticGaps: string[] = [];
  if (Array.isArray(ci.semantic_gaps)) {
    semanticGaps.push(...(ci.semantic_gaps as string[]).slice(0, 4));
  }

  // Detect language from CI or page
  const language = ci.detected_language ?? ci.detectedLanguage ?? "en";

  return {
    topQuestions,
    pageTopics,
    semanticGaps,
    title: row.pageTitle ?? "",
    h1: "",
    pageType: row.pageType ?? "article",
    language,
  };
}

// ─── Language instruction builder ────────────────────────────────────────────

function buildLanguageInstruction(language: string): string {
  if (language === "pl") {
    return `JĘZYK: Wszystkie frazy MUSZĄ być w języku polskim. Używaj naturalnego języka polskiego, takiego jak użytkownicy wpisują w ChatGPT lub Perplexity.`;
  }
  if (language === "de") return `LANGUAGE: All phrases MUST be in German.`;
  if (language === "fr") return `LANGUAGE: All phrases MUST be in French.`;
  if (language === "es") return `LANGUAGE: All phrases MUST be in Spanish.`;
  return `LANGUAGE: All phrases MUST be in English.`;
}

// ─── Main generator ───────────────────────────────────────────────────────────

export async function generatePhrasesForPage(params: {
  url: string;
  userId?: number | null;
  maxPhrases?: number;
}): Promise<PhraseGenerationResult> {
  const { url, userId, maxPhrases = 10 } = params;

  // Step 1: Pull CI signals from last audit
  const ci = await extractCISignals(url, userId);

  const hasCIData = ci && (ci.topQuestions.length > 0 || ci.pageTopics.length > 0);
  const language = ci?.language ?? "en";
  const langInstruction = buildLanguageInstruction(language);

  // Step 2: Build context for LLM
  const ciContext = hasCIData
    ? [
        ci!.topQuestions.length > 0
          ? `Pytania użytkowników (z analizy treści): ${ci!.topQuestions.join(" | ")}`
          : null,
        ci!.pageTopics.length > 0
          ? `Główne tematy strony: ${ci!.pageTopics.join(", ")}`
          : null,
        ci!.semanticGaps.length > 0
          ? `Brakujące podtematy (luki semantyczne): ${ci!.semanticGaps.join(", ")}`
          : null,
        ci!.title ? `Tytuł strony: ${ci!.title}` : null,
        ci!.pageType ? `Typ strony: ${ci!.pageType}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    : `URL strony: ${url}`;

  // Step 3: LLM call with structured output
  const systemPrompt = `Jesteś ekspertem GEO (Generative Engine Optimization) specjalizującym się w reverse-engineeringu algorytmów cytowania ChatGPT, Perplexity, Google AI Overviews, Claude i Gemini.

Twoim zadaniem jest wybranie ${maxPhrases} zapytań, po których użytkownicy tych silników AI realnie szukają informacji zbieżnych z treścią podanej podstrony.

${langInstruction}

ZASADY SELEKCJI FRAZ:
1. Fraza musi mieć intencję informacyjną lub komercyjną — AI cytuje strony odpowiadające na pytania
2. Fraza musi być wystarczająco specyficzna, żeby ta konkretna strona mogła być jedną z 3-5 cytowanych
3. Fraza NIE może zawierać nazwy domeny ani URL — mierzymy widoczność generyczną
4. Każda fraza pokrywa inny kąt: definicja / porównanie / "jak zrobić" / "najlepszy X" / "co to jest" / "ile kosztuje"
5. Priorytetyzuj frazy z pytań użytkowników (top_questions z CI) — są już zwalidowane jako realne zapytania
6. Frazy z intencją "informational" mają najwyższy potencjał cytowania przez AI
7. Frazy z intencją "commercial" są wartościowe dla e-commerce i porównywarek

UZASADNIENIE (rationale):
- Napisz 1-2 zdania wyjaśniające DLACZEGO ta fraza może skutkować cytowaniem tej strony
- Odwołaj się do konkretnego zachowania danego silnika AI (np. "Perplexity preferuje frazy z intencją 'jak wybrać'")
- Uzasadnienie ma być edukacyjne — użytkownik ma zrozumieć logikę GEO

Zwróć dokładnie ${maxPhrases} fraz (lub mniej jeśli treść strony jest zbyt uboga) jako JSON.`;

  const userPrompt = `Sygnały strony:\n${ciContext}\n\nURL: ${url}\n\nWygeneruj ${maxPhrases} fraz monitoringowych.`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "monitoring_phrases",
          strict: true,
          schema: {
            type: "object",
            properties: {
              phrases: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    phrase: { type: "string" },
                    rationale: { type: "string" },
                    intentType: {
                      type: "string",
                      enum: ["informational", "navigational", "commercial", "transactional"],
                    },
                  },
                  required: ["phrase", "rationale", "intentType"],
                  additionalProperties: false,
                },
              },
            },
            required: ["phrases"],
            additionalProperties: false,
          },
        },
      },
    });

    const text = result.choices[0]?.message?.content;
    if (!text) throw new Error("Empty LLM response");

    const parsed = safeParseLLMJson(typeof text === "string" ? text : JSON.stringify(text));
    const rawPhrases = Array.isArray(parsed.phrases) ? parsed.phrases : [];

    const phrases: GeneratedPhrase[] = rawPhrases
      .filter(
        (p: any) =>
          typeof p.phrase === "string" &&
          p.phrase.trim().length > 3 &&
          typeof p.rationale === "string"
      )
      .slice(0, maxPhrases)
      .map((p: any, idx: number) => ({
        phrase: p.phrase.trim(),
        rationale: p.rationale.trim(),
        intentType: (["informational", "navigational", "commercial", "transactional"].includes(
          p.intentType
        )
          ? p.intentType
          : "informational") as GeneratedPhrase["intentType"],
        sortOrder: idx,
      }));

    if (phrases.length === 0) throw new Error("No valid phrases generated");

    return {
      phrases,
      language,
      source: hasCIData ? "ci_enriched" : "llm_only",
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
          intentType: "informational" as const,
          sortOrder: idx,
        }));
      return { phrases: fallbackPhrases, language, source: "fallback" };
    }
    return { phrases: [], language, source: "fallback" };
  }
}
