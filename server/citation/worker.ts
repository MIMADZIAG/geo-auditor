/**
 * AI Citation Worker
 *
 * Checks if a given URL is cited by AI search engines:
 *   1. ChatGPT (OpenAI Responses API with web_search_preview tool — user BYOK key)
 *   2. Perplexity Sonar (via Manus built-in LLM proxy — zero extra cost)
 *   3. Google AI Overviews (Puppeteer headless scrape — zero cost)
 *
 * Queries come directly from Content Intelligence top_questions (zero LLM cost,
 * already in the correct page language, topically precise).
 *
 * Citation detection is STRICT — only exact domain matches in annotations/citations
 * count as "yes". Text mentions without URL citations = "no".
 */

import * as crypto from "crypto";
import puppeteer from "puppeteer-core";
import { invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import { citationChecks, citationJobs } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CitationEngine = "chatgpt" | "perplexity" | "google";

export interface CitationResult {
  query: string;
  engine: CitationEngine;
  isCited: "yes" | "no" | "partial";
  citedUrl?: string;
  snippet?: string;
  responseText?: string;
  fromCache?: boolean;
}

export interface CitationJobResult {
  jobId: number;
  auditId: number;
  url: string;
  queries: string[];
  results: CitationResult[];
  summary: {
    chatgpt: { cited: number; total: number };
    perplexity: { cited: number; total: number };
    google: { cited: number; total: number };
  };
}

// ─── Language Detection ───────────────────────────────────────────────────────

/**
 * Detect page language from HTML lang attribute or content heuristics.
 * Returns ISO 639-1 code (e.g. "pl", "en", "de").
 */
export function detectPageLanguage(html: string, pageTitle: string): string {
  // 1. HTML lang attribute
  const langMatch = html.match(/<html[^>]+lang=["']([a-zA-Z-]+)["']/i);
  if (langMatch) {
    return langMatch[1].toLowerCase().split("-")[0]; // "pl-PL" → "pl"
  }

  // 2. Meta content-language
  const metaLang = html.match(/<meta[^>]+http-equiv=["']content-language["'][^>]+content=["']([a-zA-Z-]+)["']/i);
  if (metaLang) {
    return metaLang[1].toLowerCase().split("-")[0];
  }

  // 3. Heuristic: Polish-specific characters in title
  if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(pageTitle)) return "pl";

  // 4. Default to English
  return "en";
}

// ─── Query Preparation ────────────────────────────────────────────────────────

/**
 * Prepare citation queries from Content Intelligence top_questions.
 * These are already in the correct language and topically precise.
 * Falls back to title-based queries only if CI data is unavailable.
 *
 * NO LLM call here — zero extra cost.
 */
export function prepareCitationQueries(params: {
  pageTitle: string;
  url: string;
  topQuestions?: string[];   // from Content Intelligence query_coverage check
  pageTopics?: string[];     // from Content Intelligence page topics
  language?: string;         // detected page language
}): string[] {
  const { pageTitle, url, topQuestions, pageTopics, language = "en" } = params;

  // Use Content Intelligence top_questions as primary source
  if (topQuestions && topQuestions.length >= 3) {
    // Take up to 6 questions, prefer shorter/more natural ones
    const sorted = [...topQuestions]
      .filter((q) => q.length > 5 && q.length < 120)
      .sort((a, b) => a.length - b.length);
    return sorted.slice(0, 6);
  }

  // Fallback: generate from title + topics in detected language
  return buildFallbackQueries(pageTitle, url, pageTopics ?? [], language);
}

function buildFallbackQueries(
  pageTitle: string,
  url: string,
  topics: string[],
  language: string
): string[] {
  const domain = new URL(url).hostname.replace("www.", "");
  const title = pageTitle.replace(/[|–—-].*$/, "").trim().slice(0, 60);
  const mainTopic = topics[0] ?? title.split(" ").slice(0, 4).join(" ");

  // Language-specific query templates
  const templates: Record<string, string[]> = {
    pl: [
      title,
      `${mainTopic} ranking`,
      `najlepszy ${mainTopic}`,
      `${mainTopic} porównanie`,
      `${mainTopic} 2025`,
      `${domain}`,
    ],
    en: [
      title,
      `best ${mainTopic}`,
      `${mainTopic} comparison`,
      `${mainTopic} review`,
      `${mainTopic} 2025`,
      `${domain}`,
    ],
    de: [
      title,
      `bestes ${mainTopic}`,
      `${mainTopic} Vergleich`,
      `${mainTopic} Bewertung`,
      `${mainTopic} 2025`,
      `${domain}`,
    ],
    fr: [
      title,
      `meilleur ${mainTopic}`,
      `${mainTopic} comparaison`,
      `${mainTopic} avis`,
      `${mainTopic} 2025`,
      `${domain}`,
    ],
  };

  return (templates[language] ?? templates.en).slice(0, 6);
}

// ─── Legacy export for backward compatibility ─────────────────────────────────
// (tRPC router still calls generateCitationQueries — keep it but delegate to prepareCitationQueries)
export async function generateCitationQueries(params: {
  url: string;
  pageTitle: string;
  pageTopics: string[];
  pageType: string;
  topQuestions?: string[];
  language?: string;
}): Promise<string[]> {
  return prepareCitationQueries({
    pageTitle: params.pageTitle,
    url: params.url,
    topQuestions: params.topQuestions,
    pageTopics: params.pageTopics,
    language: params.language,
  });
}

// ─── Cache ────────────────────────────────────────────────────────────────────

function makeCacheKey(query: string, engine: CitationEngine): string {
  return crypto.createHash("sha256").update(`${engine}:${query}`).digest("hex").slice(0, 64);
}

async function getCachedResult(
  cacheKey: string,
  auditId: number
): Promise<CitationResult | null> {
  const db = await getDb();
  if (!db) return null;

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h ago
  const rows = await db
    .select()
    .from(citationChecks)
    .where(and(eq(citationChecks.cacheKey, cacheKey)))
    .limit(1);

  const row = rows[0];
  if (!row || row.checkedAt < cutoff) return null;

  return {
    query: row.query,
    engine: row.engine as CitationEngine,
    isCited: row.isCited as "yes" | "no" | "partial",
    citedUrl: row.citedUrl ?? undefined,
    snippet: row.snippet ?? undefined,
    responseText: row.responseText ?? undefined,
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
    snippet: result.snippet ?? null,
    responseText: result.responseText?.slice(0, 2000) ?? null,
    cacheKey,
  });
}

// ─── Engine 1: ChatGPT (OpenAI Responses API with web_search_preview) ─────────

/**
 * STRICT citation detection:
 * - "yes"     = target domain found in annotations[].url (actual citation link)
 * - "no"      = domain not in annotations, regardless of text mentions
 * - "partial" = REMOVED — text mentions without URL citations are unreliable
 */
async function checkChatGPT(query: string, targetUrl: string): Promise<CitationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      query,
      engine: "chatgpt",
      isCited: "no",
      snippet: "OpenAI API key not configured",
    };
  }

  const targetDomain = new URL(targetUrl).hostname.replace("www.", "");

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-search-preview",
        tools: [{ type: "web_search_preview" }],
        input: query,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.warn(`[Citation/ChatGPT] API error ${response.status}: ${err}`);
      return { query, engine: "chatgpt", isCited: "no" };
    }

    const data = await response.json();

    // Extract text output and URL annotations from Responses API format
    const outputItems: any[] = data.output ?? [];
    let responseText = "";
    const citedUrls: string[] = [];

    for (const item of outputItems) {
      if (item.type === "message") {
        for (const content of item.content ?? []) {
          if (content.type === "output_text") {
            responseText += content.text ?? "";
            for (const ann of content.annotations ?? []) {
              if (ann.type === "url_citation" && ann.url) {
                citedUrls.push(ann.url);
              }
            }
          }
        }
      }
    }

    // STRICT: only count exact domain match in annotation URLs
    const exactCitation = citedUrls.find((u) => {
      try {
        const parsed = new URL(u);
        return parsed.hostname.replace("www.", "") === targetDomain;
      } catch {
        return false;
      }
    });

    if (exactCitation) {
      const snippet = extractSnippet(responseText, targetDomain);
      return {
        query,
        engine: "chatgpt",
        isCited: "yes",
        citedUrl: exactCitation,
        snippet,
        responseText: responseText.slice(0, 1000),
      };
    }

    // Not cited — save response for debugging
    return {
      query,
      engine: "chatgpt",
      isCited: "no",
      responseText: responseText.slice(0, 500),
    };
  } catch (e) {
    console.warn("[Citation/ChatGPT] Error:", e);
    return { query, engine: "chatgpt", isCited: "no" };
  }
}

// ─── Engine 2: Perplexity (via Manus built-in LLM — zero extra cost) ──────────

/**
 * STRICT citation detection — no hallucination hints.
 * The LLM answers naturally without being told to include the target domain.
 * Only counts as "yes" if target domain appears in structured citations block.
 *
 * If PERPLEXITY_API_KEY is set, uses direct Sonar API for real citations[].
 */
async function checkPerplexity(
  query: string,
  targetUrl: string,
  language: string = "en"
): Promise<CitationResult> {
  const targetDomain = new URL(targetUrl).hostname.replace("www.", "");
  const perplexityKey = process.env.PERPLEXITY_API_KEY;

  // ── Option A: Direct Perplexity API (if user has key) ──
  if (perplexityKey) {
    try {
      const response = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${perplexityKey}`,
        },
        body: JSON.stringify({
          model: "sonar",
          messages: [{ role: "user", content: query }],
          max_tokens: 800,
          search_recency_filter: "month",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const responseText = data.choices?.[0]?.message?.content ?? "";
        const citations: string[] = data.citations ?? [];

        // STRICT: only exact domain in citations[]
        const exactCitation = citations.find((u: string) => {
          try {
            return new URL(u).hostname.replace("www.", "") === targetDomain;
          } catch {
            return false;
          }
        });

        if (exactCitation) {
          return {
            query,
            engine: "perplexity",
            isCited: "yes",
            citedUrl: exactCitation,
            snippet: extractSnippet(responseText, targetDomain),
            responseText: responseText.slice(0, 1000),
          };
        }
        return {
          query,
          engine: "perplexity",
          isCited: "no",
          responseText: responseText.slice(0, 500),
        };
      }
    } catch (e) {
      console.warn("[Citation/Perplexity] Direct API error, falling back to Manus LLM:", e);
    }
  }

  // ── Option B: Manus built-in LLM (zero cost fallback) ──
  // Ask naturally in the page language — NO hint to include the target domain.
  const langInstructions: Record<string, string> = {
    pl: "Odpowiadaj po polsku. Podaj konkretne źródła internetowe.",
    en: "Answer in English. Cite specific web sources.",
    de: "Antworte auf Deutsch. Nenne konkrete Webquellen.",
    fr: "Réponds en français. Cite des sources web spécifiques.",
  };
  const langInstruction = langInstructions[language] ?? langInstructions.en;

  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a research assistant that answers questions by citing web sources.
${langInstruction}
After your answer, list the URLs you would cite in a JSON block:
<citations>{"urls": ["https://example.com/page1", "https://other.com/page2"]}</citations>
Only include URLs you are confident exist and contain relevant information. Do NOT invent URLs.`,
        },
        {
          role: "user",
          content: query,
        },
      ],
    });

    const responseText = result.choices[0]?.message?.content;
    if (!responseText || typeof responseText !== "string") {
      return { query, engine: "perplexity", isCited: "no" };
    }

    // Extract citations JSON block
    const citationsMatch = responseText.match(/<citations>([\s\S]*?)<\/citations>/);
    let citedUrls: string[] = [];
    if (citationsMatch) {
      try {
        const parsed = JSON.parse(citationsMatch[1]);
        citedUrls = parsed.urls ?? [];
      } catch {}
    }

    // STRICT: only exact domain match in structured citations
    const exactCitation = citedUrls.find((u: string) => {
      try {
        return new URL(u).hostname.replace("www.", "") === targetDomain;
      } catch {
        return false;
      }
    });

    if (exactCitation) {
      return {
        query,
        engine: "perplexity",
        isCited: "yes",
        citedUrl: exactCitation,
        snippet: extractSnippet(responseText, targetDomain),
        responseText: responseText.slice(0, 1000),
      };
    }

    return {
      query,
      engine: "perplexity",
      isCited: "no",
      responseText: responseText.slice(0, 500),
    };
  } catch (e) {
    console.warn("[Citation/Perplexity] LLM error:", e);
    return { query, engine: "perplexity", isCited: "no" };
  }
}

// ─── Engine 3: Google AI Overviews (Puppeteer scraper — zero cost) ─────────────

/**
 * Uses Puppeteer to scrape Google AI Overviews.
 * Updated selectors for 2025 Google DOM structure.
 * STRICT: only counts domain in actual citation links, not text mentions.
 */
async function checkGoogleAIOverview(
  query: string,
  targetUrl: string,
  language: string = "en"
): Promise<CitationResult> {
  const targetDomain = new URL(targetUrl).hostname.replace("www.", "");

  // Map language to Google locale params
  const localeMap: Record<string, { hl: string; gl: string }> = {
    pl: { hl: "pl", gl: "pl" },
    en: { hl: "en", gl: "us" },
    de: { hl: "de", gl: "de" },
    fr: { hl: "fr", gl: "fr" },
    es: { hl: "es", gl: "es" },
  };
  const locale = localeMap[language] ?? localeMap.en;
  const langArgs = language === "pl"
    ? ["--lang=pl-PL,pl", "--accept-lang=pl-PL,pl"]
    : ["--lang=en-US,en", "--accept-lang=en-US,en"];

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: "/usr/bin/chromium-browser",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        ...langArgs,
      ],
      headless: true,
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({
      "Accept-Language": language === "pl" ? "pl-PL,pl;q=0.9" : "en-US,en;q=0.9",
    });

    // Navigate to Google Search with correct locale
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=${locale.hl}&gl=${locale.gl}`;
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 20000 });

    // Wait for dynamic content (AI Overview loads after initial render)
    await new Promise((r) => setTimeout(r, 4000));

    // Extract AI Overview content and cited URLs
    const result = await page.evaluate((domain: string) => {
      // Updated 2025 Google AI Overview selectors
      const aiOverviewSelectors = [
        // 2025 selectors (most likely)
        "[data-attrid='SGE']",
        "div[jsname='yEVEwb']",
        "div[jsname='BiSLff']",
        ".M8OgIe",              // AI Overview wrapper 2025
        ".YzVZnd",              // AI Overview container
        ".IVvPP",               // AI Overview text block
        "[data-sgrd='true']",
        ".wDYxhc",              // AI Overview card
        // Fallback: any element with "AI Overview" aria label
        "[aria-label*='AI Overview']",
        "[aria-label*='AI overview']",
        // Knowledge panel
        ".kp-wholepage",
      ];

      let aiOverviewEl: Element | null = null;
      for (const sel of aiOverviewSelectors) {
        try {
          aiOverviewEl = document.querySelector(sel);
          if (aiOverviewEl && aiOverviewEl.textContent && aiOverviewEl.textContent.length > 50) break;
        } catch {}
      }

      // Last resort: scan for AI Overview heading text
      if (!aiOverviewEl) {
        const headings = Array.from(document.querySelectorAll("h1, h2, h3, [role='heading']"));
        for (const h of headings) {
          if (h.textContent?.toLowerCase().includes("ai overview")) {
            // Get parent container
            aiOverviewEl = h.closest("div[data-attrid], div[jsname], .g") ?? h.parentElement;
            if (aiOverviewEl) break;
          }
        }
      }

      if (!aiOverviewEl) {
        return {
          hasAIOverview: false,
          citedUrls: [] as string[],
          text: "",
        };
      }

      const text = aiOverviewEl.textContent ?? "";
      // Get all external links (not google.com) from the AI Overview block
      const links = Array.from(aiOverviewEl.querySelectorAll("a[href]"));
      const citedUrls = links
        .map((a) => {
          const href = (a as HTMLAnchorElement).href;
          // Unwrap Google redirect URLs (/url?q=...)
          if (href.includes("google.com/url?")) {
            try {
              const u = new URL(href);
              return u.searchParams.get("q") ?? href;
            } catch {}
          }
          return href;
        })
        .filter((href) => href.startsWith("http") && !href.includes("google.com"));

      return {
        hasAIOverview: true,
        citedUrls,
        text: text.slice(0, 1500),
      };
    }, targetDomain);

    if (!result.hasAIOverview) {
      return {
        query,
        engine: "google",
        isCited: "no",
        snippet: "No AI Overview shown for this query",
      };
    }

    // STRICT: only exact domain match in citation links
    const exactCitation = result.citedUrls.find((u: string) => {
      try {
        return new URL(u).hostname.replace("www.", "") === targetDomain;
      } catch {
        return false;
      }
    });

    if (exactCitation) {
      return {
        query,
        engine: "google",
        isCited: "yes",
        citedUrl: exactCitation,
        snippet: extractSnippet(result.text, targetDomain),
        responseText: result.text.slice(0, 1000),
      };
    }

    // AI Overview exists but target not cited
    return {
      query,
      engine: "google",
      isCited: "no",
      responseText: `AI Overview present (${result.citedUrls.length} sources cited), ${targetDomain} not among them.`,
    };
  } catch (e) {
    console.warn("[Citation/Google] Puppeteer error:", e);
    return { query, engine: "google", isCited: "no", snippet: "Google scraping failed" };
  } finally {
    if (browser) await browser.close();
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractSnippet(text: string, domain: string): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(domain.toLowerCase());
  if (idx === -1) return text.slice(0, 200);
  const start = Math.max(0, idx - 80);
  const end = Math.min(text.length, idx + 120);
  return "..." + text.slice(start, end) + "...";
}

// ─── Main Job Runner ──────────────────────────────────────────────────────────

/**
 * Run a full citation check job for a given audit.
 * Called asynchronously after audit completion.
 * Language is stored in the job record and passed to all engines.
 */
export async function runCitationJob(jobId: number): Promise<CitationJobResult | null> {
  const db = await getDb();
  if (!db) return null;

  const jobs = await db.select().from(citationJobs).where(eq(citationJobs.id, jobId)).limit(1);
  const job = jobs[0];
  if (!job) return null;

  await db.update(citationJobs).set({ status: "running" }).where(eq(citationJobs.id, jobId));

  const queries = (job.prompts as string[]) ?? [];
  const language = (job as any).language ?? "en";
  const results: CitationResult[] = [];

  const engines: CitationEngine[] = ["chatgpt", "perplexity", "google"];

  for (const query of queries) {
    for (const engine of engines) {
      const cacheKey = makeCacheKey(query, engine);

      const cached = await getCachedResult(cacheKey, job.auditId);
      if (cached) {
        results.push(cached);
        continue;
      }

      let result: CitationResult;
      if (engine === "chatgpt") {
        result = await checkChatGPT(query, job.url);
      } else if (engine === "perplexity") {
        result = await checkPerplexity(query, job.url, language);
      } else {
        result = await checkGoogleAIOverview(query, job.url, language);
      }

      await saveResult(jobId, job.auditId, result, cacheKey);
      results.push(result);

      // Small delay between API calls
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  // Build summary
  const summary = {
    chatgpt: { cited: 0, total: 0 },
    perplexity: { cited: 0, total: 0 },
    google: { cited: 0, total: 0 },
  };
  for (const r of results) {
    summary[r.engine].total++;
    if (r.isCited === "yes") {
      summary[r.engine].cited++;
    }
  }

  await db
    .update(citationJobs)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(citationJobs.id, jobId));

  return { jobId, auditId: job.auditId, url: job.url, queries, results, summary };
}
