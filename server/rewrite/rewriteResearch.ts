/**
 * rewriteResearch.ts
 *
 * Pre-rewrite research pipeline for Full Rewrite AI.
 * Borrowed architecture from AI Page Creator — adapted for URL-based rewrite context.
 *
 * Pipeline:
 *   1. Query Fan-Out: generate 6 search queries from page metadata
 *   2. Grounding: scrape top results for top 3 queries
 *   3. Research Synthesis: condense into a structured research brief
 *   4. Entity & Tip Extraction: key entities + AI readiness tips
 */

import { invokeLLM } from "../_core/llm";
import { safeParseLLMJson } from "../utils/jsonSanitizer";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PageMetadata {
  url: string;
  title: string;
  h1?: string;
  metaDescription?: string;
  pageType?: string;
  language?: string;
  cleanContent?: string; // first 3000 chars of clean text
}

export interface RewriteResearchSource {
  url: string;
  title: string;
  snippet: string;
  fullContent?: string;
}

export interface RewriteResearchResult {
  queries: string[];
  sources: RewriteResearchSource[];
  researchBrief: string;     // condensed research context for LLM
  keyEntities: string[];     // named entities to weave into rewrite
  aiReadinessTips: string[]; // 5 concrete GEO tips based on research
  answerFirstDraft: string;  // suggested answer-first opening paragraph
}

// ─── Step 1: Query Fan-Out ────────────────────────────────────────────────────

export async function generateRewriteQueries(meta: PageMetadata): Promise<string[]> {
  const lang = (meta.language ?? "pl") === "pl" ? "polskim" : "angielskim";
  const pageTypeLabel = meta.pageType ?? "strona internetowa";

  try {
    const response = await invokeLLM({
      model: "gpt-4.5-preview",
      messages: [
        {
          role: "system",
          content:
            `Jesteś ekspertem SEO i GEO. Generujesz zapytania wyszukiwarkowe, ` +
            `które użytkownicy wpisują w Google, ChatGPT i Perplexity. ` +
            `Odpowiadaj WYŁĄCZNIE w formacie JSON.`,
        },
        {
          role: "user",
          content:
            `Wygeneruj 6 zapytań wyszukiwarkowych dla strony, którą chcemy zoptymalizować:\n\n` +
            `URL: ${meta.url}\n` +
            `Tytuł: ${meta.title}\n` +
            `${meta.h1 ? `H1: ${meta.h1}\n` : ""}` +
            `${meta.metaDescription ? `Meta description: ${meta.metaDescription}\n` : ""}` +
            `Typ strony: ${pageTypeLabel}\n` +
            `Język: ${lang}\n\n` +
            `${meta.cleanContent ? `Fragment treści:\n${meta.cleanContent.slice(0, 800)}\n\n` : ""}` +
            `Zwróć JSON: {"queries": ["zapytanie1", "zapytanie2", ...]}\n\n` +
            `Zapytania muszą być różnorodne: ogólne, szczegółowe, pytające (jak?, co?, dlaczego?), zakupowe/informacyjne.`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 500,
    } as any);

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = safeParseLLMJson(typeof raw === "string" ? raw : JSON.stringify(raw));
    return Array.isArray(parsed.queries) ? parsed.queries.slice(0, 8) : [];
  } catch (e) {
    console.warn("[RewriteResearch] Query fan-out failed:", (e as Error).message);
    // Fallback: deterministic queries from title
    const base = meta.h1 || meta.title;
    return [
      base,
      `jak ${base.toLowerCase()}`,
      `${base} poradnik`,
      `${base} opinie`,
      `najlepszy ${base.toLowerCase()}`,
      `${base} 2025`,
    ];
  }
}

// ─── Step 2: Grounding ────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, timeoutMs = 7000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GEOAuditorBot/1.0; +https://geoauditor.ai/bot)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
      },
    });
    if (!res.ok) return "";
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
      .slice(0, 3000);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

async function searchAndScrapeForRewrite(
  query: string,
  excludeDomain?: string
): Promise<RewriteResearchSource[]> {
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=pl-pl`;
  const html = await fetchWithTimeout(searchUrl, 10000);

  const results: RewriteResearchSource[] = [];
  const titleRegex = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;

  const titles: Array<{ url: string; title: string }> = [];
  let m;
  while ((m = titleRegex.exec(html)) !== null && titles.length < 5) {
    const rawUrl = m[1];
    const title = m[2].replace(/<[^>]+>/g, "").trim();
    if (rawUrl && title && rawUrl.startsWith("http")) {
      // Skip the page we're rewriting
      if (excludeDomain && rawUrl.includes(excludeDomain)) continue;
      titles.push({ url: rawUrl, title });
    }
  }

  for (const { url, title } of titles.slice(0, 3)) {
    try {
      const content = await fetchWithTimeout(url, 5000);
      if (content.length > 100) {
        results.push({
          url,
          title,
          snippet: content.slice(0, 250),
          fullContent: content.slice(0, 2000),
        });
      }
    } catch {
      // skip
    }
  }

  return results;
}

export async function groundRewriteResearch(
  queries: string[],
  excludeDomain?: string
): Promise<RewriteResearchSource[]> {
  const allSources: RewriteResearchSource[] = [];
  const seenUrls = new Set<string>();

  // Ground top 3 queries only (speed vs quality balance)
  const groundingQueries = queries.slice(0, 3);

  for (const query of groundingQueries) {
    try {
      const sources = await searchAndScrapeForRewrite(query, excludeDomain);
      for (const s of sources) {
        if (!seenUrls.has(s.url)) {
          seenUrls.add(s.url);
          allSources.push(s);
        }
      }
    } catch (e) {
      console.warn("[RewriteResearch] Grounding query failed:", (e as Error).message);
    }
  }

  return allSources.slice(0, 8);
}

// ─── Step 3: Research Synthesis + Entity/Tip Extraction ──────────────────────

export async function synthesizeRewriteResearch(
  meta: PageMetadata,
  queries: string[],
  sources: RewriteResearchSource[]
): Promise<{
  researchBrief: string;
  keyEntities: string[];
  aiReadinessTips: string[];
  answerFirstDraft: string;
}> {
  if (sources.length === 0) {
    return {
      researchBrief: `Brak danych z groundingu. Temat: ${meta.title}.`,
      keyEntities: [],
      aiReadinessTips: [],
      answerFirstDraft: "",
    };
  }

  const sourcesText = sources
    .map((s, i) => `[${i + 1}] ${s.title}\nURL: ${s.url}\nTreść: ${s.fullContent ?? s.snippet}`)
    .join("\n\n---\n\n");

  try {
    const response = await invokeLLM({
      model: "gpt-4.5-preview",
      messages: [
        {
          role: "system",
          content:
            `Jesteś analitykiem treści i ekspertem GEO. ` +
            `Analizujesz zebrane materiały i tworzysz syntetyczne podsumowanie badań, ` +
            `które posłuży do przepisania istniejącej strony internetowej w sposób maksymalizujący widoczność w AI Search. ` +
            `Odpowiadaj WYŁĄCZNIE w formacie JSON.`,
        },
        {
          role: "user",
          content:
            `Przeanalizuj poniższe materiały zebrane dla strony do przepisania:\n\n` +
            `Strona: ${meta.title}\n` +
            `URL: ${meta.url}\n` +
            `Typ: ${meta.pageType ?? "strona"}\n` +
            `Zapytania docelowe: ${queries.slice(0, 4).join(", ")}\n\n` +
            `ZEBRANE MATERIAŁY Z INTERNETU:\n${sourcesText.slice(0, 10000)}\n\n` +
            `Zwróć JSON:\n` +
            `{\n` +
            `  "researchBrief": "string — 200-300 słów: kluczowe fakty, encje, luki treściowe, co najlepsze strony robią dobrze",\n` +
            `  "keyEntities": ["string — max 15 kluczowych encji (pojęcia, produkty, cechy, terminy branżowe) do wplecenia w treść"],\n` +
            `  "aiReadinessTips": ["string — 5 konkretnych wskazówek GEO jak przepisać tę stronę żeby była cytowana w AI Overviews"],\n` +
            `  "answerFirstDraft": "string — 2-3 zdania bezpośredniej odpowiedzi na główne zapytanie (wzorzec answer-first dla AI snippets)"\n` +
            `}`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 2000,
    } as any);

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = safeParseLLMJson(typeof raw === "string" ? raw : JSON.stringify(raw));

    return {
      researchBrief: String(parsed.researchBrief ?? ""),
      keyEntities: Array.isArray(parsed.keyEntities) ? parsed.keyEntities.slice(0, 15) : [],
      aiReadinessTips: Array.isArray(parsed.aiReadinessTips) ? parsed.aiReadinessTips.slice(0, 5) : [],
      answerFirstDraft: String(parsed.answerFirstDraft ?? ""),
    };
  } catch (e) {
    console.warn("[RewriteResearch] Synthesis failed:", (e as Error).message);
    return {
      researchBrief: `Temat: ${meta.title}. Zapytania: ${queries.slice(0, 3).join(", ")}.`,
      keyEntities: [],
      aiReadinessTips: [],
      answerFirstDraft: "",
    };
  }
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

export async function runRewriteResearch(
  meta: PageMetadata
): Promise<RewriteResearchResult> {
  console.log(`[RewriteResearch] Starting for: ${meta.url}`);

  // Step 1: Query fan-out
  const queries = await generateRewriteQueries(meta);
  console.log(`[RewriteResearch] Fan-out: ${queries.length} queries`);

  // Step 2: Grounding
  const excludeDomain = (() => {
    try { return new URL(meta.url).hostname.replace("www.", ""); } catch { return undefined; }
  })();
  const sources = await groundRewriteResearch(queries, excludeDomain);
  console.log(`[RewriteResearch] Grounding: ${sources.length} sources`);

  // Step 3: Synthesis
  const synthesis = await synthesizeRewriteResearch(meta, queries, sources);

  return {
    queries,
    sources: sources.map(s => ({ url: s.url, title: s.title, snippet: s.snippet })),
    ...synthesis,
  };
}
