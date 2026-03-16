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

// ─── Types ────────────────────────────────────────────────────────────────────

export type CitationEngine = "chatgpt" | "google";

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

function buildFallbackQueries(content: PageContent, url: string, round: number): string[] {
  const base = content.h1 || content.title || new URL(url).hostname;
  const lang = content.language;
  const isPolish = lang === "pl";

  // Use modifiers proven to trigger AI Overviews (informational/comparative intent)
  const sets: string[][] = isPolish
    ? [
        [`najlepszy ${base}`, `jak wybrać ${base}`, `${base} ranking`, `co to jest ${base}`, `${base} porównanie`],
        [`${base} 2025`, `tanie ${base}`, `${base} opinie`, `${base} nowoczesne`, `${base} z garażem`],
        [`jak wybrać ${base}`, `${base} krok po kroku`, `${base} poradnik`, `${base} przykład`, `${base} wady zalety`],
        [`${base} dla małych działek`, `${base} online`, `${base} gotowe`, `${base} bezpieczny`, `${base} recenzja`],
        [`${base} alternatywy`, `zamiast ${base}`, `${base} czy warto`, `${base} doświadczenia`, `${base} opłacalność`],
      ]
    : [
        [`best ${base}`, `how to choose ${base}`, `${base} guide`, `what is ${base}`, `${base} comparison`],
        [`top ${base} 2025`, `cheap ${base}`, `${base} reviews`, `modern ${base}`, `${base} with garage`],
        [`${base} step by step`, `${base} tips`, `${base} examples`, `${base} pros cons`, `${base} explained`],
        [`${base} for small lots`, `${base} online`, `${base} ready made`, `${base} safe`, `${base} worth it`],
        [`${base} alternatives`, `instead of ${base}`, `${base} experience`, `${base} ranking`, `${base} advice`],
      ];

  return (sets[round - 1] ?? sets[0]).slice(0, 5);
}

async function generateRoundQueries(
  content: PageContent,
  url: string,
  round: number,
  previousQueries: string[]
): Promise<string[]> {
  const { title, h1, h2s, metaDescription, language, ciKeywords, ciTopQuestions, ciTopics } = content;

  const langNote = language === "pl"
    ? "Generate ALL queries in POLISH (język polski). Use natural Polish phrasing."
    : `Generate ALL queries in the same language as the page (${language}).`;

  const pageSignals = [
    title && `Title: ${title}`,
    h1 && `H1: ${h1}`,
    h2s.length > 0 && `H2s: ${h2s.slice(0, 4).join(" | ")}`,
    metaDescription && `Meta description: ${metaDescription}`,
    ciTopics.length > 0 && `Page topics (from AI analysis): ${ciTopics.join(", ")}`,
    ciTopQuestions.length > 0 && `Top questions users ask about this topic: ${ciTopQuestions.slice(0, 5).join(" | ")}`,
    ciKeywords.length > 0 && `Missing topics (semantic gaps): ${ciKeywords.join(", ")}`,
  ].filter(Boolean).join("\n");

  const avoidNote = previousQueries.length > 0
    ? `\n\nIMPORTANT: Do NOT repeat any of these already-used queries:\n${previousQueries.map(q => `- "${q}"`).join("\n")}`
    : "";

  const roundContext = round === 1
    ? "Generate the MOST LIKELY queries users would type into Google or ChatGPT to find this page."
    : round === 2
    ? "The previous queries found no citations. Try BROADER, more general queries about the main topic."
    : round === 3
    ? "Still no citations found. Try queries focused on SPECIFIC subtopics, features, or use cases mentioned on the page."
    : round === 4
    ? "Try queries using DIFFERENT ANGLES: comparisons, alternatives, how-to, or question-format queries."
    : "Final attempt. Try the most GENERIC queries about the domain's industry or niche.";

  try {
    const result = await invokeLLM({
      // gpt-4.1: cheap auxiliary task (query generation); supports json_schema
      model: "gpt-4.1",
      messages: [
        {
          role: "system",
          content: `You are an expert in AI search behavior and GEO (Generative Engine Optimization).

Your task: Generate exactly 5 search queries that are HIGHLY LIKELY to trigger a Google AI Overview (AI-generated summary block) for the topic of this webpage.

${roundContext}

CRITICAL RULES for triggering AI Overviews:
- ${langNote}
- ALWAYS add informational/comparative modifiers that trigger AI Overviews:
  * Polish: "najlepszy", "jak wybrać", "co to jest", "ranking", "tanie", "porównanie", "poradnik", "wady zalety", "czy warto"
  * English: "best", "how to choose", "what is", "guide", "top", "comparison", "pros cons", "worth it"
- Bare noun queries (e.g. just "projekty domów parterowych") rarely trigger AI Overviews — ALWAYS add a modifier
- Do NOT include the domain name or URL in queries
- Each query should be distinct and cover a different angle
- Queries should be 3-10 words long${avoidNote}

Return ONLY a JSON object with a "queries" array of exactly 5 strings.`,
        },
        {
          role: "user",
          content: `Page signals:\n${pageSignals}\n\nURL: ${url}\nRound: ${round}/5`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "queries",
          strict: true,
          schema: {
            type: "object",
            properties: {
              queries: { type: "array", items: { type: "string" } },
            },
            required: ["queries"],
            additionalProperties: false,
          },
        },
      },
    });

    const text = result.choices[0]?.message?.content;
    if (!text) return buildFallbackQueries(content, url, round);

    const parsed = JSON.parse(typeof text === "string" ? text : JSON.stringify(text));
    const queries: string[] = Array.isArray(parsed.queries)
      ? parsed.queries
          .filter((q: unknown) => typeof q === "string" && q.trim().length > 3)
          .map((q: string) => q.trim())
          .slice(0, 5)
      : [];

    return queries.length >= 3 ? queries : buildFallbackQueries(content, url, round);
  } catch (e) {
    console.warn(`[Citation] generateRoundQueries round ${round} failed:`, e);
    return buildFallbackQueries(content, url, round);
  }
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

    // Step 2: Adaptive fan-out loop (max 5 rounds × 5 queries)
    const MAX_ROUNDS = 5;
    const allResults: CitationResult[] = [];
    const rounds: CitationRound[] = [];
    const usedQueries: string[] = [];
    let foundCitation = false;

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      if (foundCitation) break;

      console.log(`[Citation] Job ${jobId}: Round ${round}/${MAX_ROUNDS}`);

      // Generate queries for this round
      const queries = await generateRoundQueries(pageContent, job.url, round, usedQueries);
      usedQueries.push(...queries);

      const roundResults: CitationResult[] = [];

      for (const query of queries) {
        // Google AI Overview — run in ALL rounds via SerpApi
        const googleCacheKey = makeCacheKey(query, "google");
        const googleCached = await getCachedResult(googleCacheKey);
        let googleResult: CitationResult;

        if (googleCached) {
          console.log(`[Citation] Cache hit: google / "${query.slice(0, 40)}"`);
          googleResult = { ...googleCached, round };
        } else {
          googleResult = await checkGoogleAIOverview(query, job.url, language, round);
          await saveResult(jobId, job.auditId, googleResult, googleCacheKey);
          // Small delay to respect SerpApi rate limits
          await new Promise((r) => setTimeout(r, 1000));
        }
        roundResults.push(googleResult);
        allResults.push(googleResult);

        // ChatGPT Search — only in round 1 (cost control)
        if (round === 1) {
          const chatgptCacheKey = makeCacheKey(query, "chatgpt");
          const chatgptCached = await getCachedResult(chatgptCacheKey);
          let chatgptResult: CitationResult;

          if (chatgptCached) {
            console.log(`[Citation] Cache hit: chatgpt / "${query.slice(0, 40)}"`);
            chatgptResult = { ...chatgptCached, round };
          } else {
            chatgptResult = await checkChatGPT(query, job.url, round);
            await saveResult(jobId, job.auditId, chatgptResult, chatgptCacheKey);
            await new Promise((r) => setTimeout(r, 1000));
          }
          roundResults.push(chatgptResult);
          allResults.push(chatgptResult);
        }
      }

      const roundFoundCitation = hasCitation(roundResults);
      rounds.push({
        round,
        queries,
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
    };
    for (const r of allResults) {
      const eng = r.engine as "chatgpt" | "google";
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
