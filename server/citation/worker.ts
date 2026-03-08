/**
 * AI Citation Worker v2
 *
 * Checks if a given URL is cited by AI search engines:
 *   1. ChatGPT  — OpenAI Responses API with web_search_preview (user BYOK key)
 *   2. Perplexity — direct Sonar API (if PERPLEXITY_API_KEY set) or Manus LLM fallback
 *   3. Google AI Overviews — Puppeteer headless scrape (zero cost)
 *
 * QUERY FAN-OUT STRATEGY (v2):
 *   - Backend fetches the URL directly and extracts: title, H1, H2s, meta description
 *   - LLM generates 6 realistic, language-correct queries from that content
 *   - Zero dependency on frontend data — startCheck only needs auditId
 *   - Language auto-detected from HTML lang attribute
 *
 * CITATION DETECTION: STRICT
 *   - "yes"  = target domain in annotations[].url (ChatGPT) or citations[] (Perplexity)
 *   - "no"   = domain not in citation URLs (text mentions don't count)
 */

import * as crypto from "crypto";
import * as cheerio from "cheerio";
import puppeteer from "puppeteer-core";
import { invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import { audits, citationChecks, citationJobs } from "../../drizzle/schema";
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

// ─── Page Content Extraction ──────────────────────────────────────────────────

interface PageContent {
  title: string;
  h1: string;
  h2s: string[];
  metaDescription: string;
  language: string;
}

/**
 * Fetch the URL and extract key content signals for query fan-out.
 * Does NOT depend on the audit pipeline — fetches independently.
 */
export async function extractPageContent(url: string): Promise<PageContent> {
  try {
    const { default: axios } = await import("axios");
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GEOAuditor/2.0; +https://geoauditor.com)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "pl,en;q=0.9",
      },
      maxRedirects: 5,
    });

    const html: string = typeof response.data === "string" ? response.data : String(response.data);
    const $ = cheerio.load(html);

    // Language detection
    const htmlLang = $("html").attr("lang") ?? "";
    let language = htmlLang.toLowerCase().split("-")[0] || "pl";
    if (!["pl", "en", "de", "fr", "es", "it"].includes(language)) {
      // Heuristic: Polish characters
      const bodyText = $("body").text().slice(0, 500);
      language = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(bodyText) ? "pl" : "en";
    }

    // Title
    const title = ($("title").first().text() || $("h1").first().text() || url)
      .replace(/\s*[|–—-].*$/, "").trim().slice(0, 120);

    // H1
    const h1 = $("h1").first().text().trim().slice(0, 120);

    // H2s (first 5)
    const h2s: string[] = [];
    $("h2").each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 3 && text.length < 100) h2s.push(text);
    });

    // Meta description
    const metaDescription = (
      $("meta[name='description']").attr("content") ||
      $("meta[property='og:description']").attr("content") ||
      ""
    ).trim().slice(0, 200);

    return {
      title,
      h1,
      h2s: h2s.slice(0, 5),
      metaDescription,
      language,
    };
  } catch (e) {
    console.warn("[Citation/extractPageContent] Failed to fetch:", url, e);
    // Minimal fallback from URL
    const domain = new URL(url).hostname.replace("www.", "");
    return { title: domain, h1: "", h2s: [], metaDescription: "", language: "pl" };
  }
}

// ─── Query Fan-Out via LLM ────────────────────────────────────────────────────

/**
 * Generate 6 realistic, language-correct queries from page content.
 * Uses LLM to produce natural-language questions a real user would ask.
 * These are the exact queries sent to ChatGPT, Perplexity, and Google.
 */
export async function fanOutQueries(content: PageContent, url: string): Promise<string[]> {
  const { title, h1, h2s, metaDescription, language } = content;

  const langInstructions: Record<string, string> = {
    pl: "Generuj zapytania PO POLSKU. Zapytania muszą brzmieć naturalnie, jak pytania zadawane przez użytkownika w Google lub ChatGPT.",
    en: "Generate queries IN ENGLISH. Queries must sound natural, like questions a real user would type into Google or ChatGPT.",
    de: "Generiere Anfragen AUF DEUTSCH. Die Anfragen müssen natürlich klingen.",
    fr: "Génère des requêtes EN FRANÇAIS. Les requêtes doivent sonner naturellement.",
  };
  const langInstruction = langInstructions[language] ?? langInstructions.en;

  const pageContext = [
    `URL: ${url}`,
    `Tytuł strony: ${title}`,
    h1 ? `H1: ${h1}` : "",
    h2s.length > 0 ? `Nagłówki H2: ${h2s.join(" | ")}` : "",
    metaDescription ? `Meta description: ${metaDescription}` : "",
  ].filter(Boolean).join("\n");

  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `Jesteś ekspertem SEO i GEO (Generative Engine Optimization). Twoim zadaniem jest wygenerowanie 6 zapytań, które użytkownicy mogliby wpisać do ChatGPT, Perplexity lub Google, i na które ta konkretna strona powinna się pojawić w odpowiedzi.

${langInstruction}

ZASADY:
- Zapytania muszą być REALISTYCZNE — takie jakie naprawdę wpisują użytkownicy
- Zapytania muszą być PRECYZYJNE — związane z konkretną tematyką strony
- Zapytania muszą być w JĘZYKU STRONY (${language})
- NIE używaj nazwy domeny jako zapytania
- NIE generuj zapytań zbyt ogólnych (np. "kredyt" — za ogólne)
- Mieszaj typy: pytania informacyjne ("jak...?", "co to...?"), porównawcze ("najlepszy...", "ranking..."), transakcyjne ("gdzie kupić...", "ile kosztuje...")
- Zwróć TYLKO JSON array z 6 stringami, bez żadnego dodatkowego tekstu`,
        },
        {
          role: "user",
          content: `Wygeneruj 6 zapytań dla tej strony:\n\n${pageContext}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "citation_queries",
          strict: true,
          schema: {
            type: "object",
            properties: {
              queries: {
                type: "array",
                items: { type: "string" },
                description: "6 realistic search queries in the page language",
              },
            },
            required: ["queries"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = result.choices[0]?.message?.content;
    if (content && typeof content === "string") {
      const parsed = JSON.parse(content);
      const queries: string[] = (parsed.queries ?? [])
        .filter((q: unknown) => typeof q === "string" && q.trim().length > 3)
        .slice(0, 6);
      if (queries.length >= 3) return queries;
    }
  } catch (e) {
    console.warn("[Citation/fanOutQueries] LLM error, using fallback:", e);
  }

  // Fallback: deterministic queries from title + H2s
  return buildFallbackQueries(title, h1, h2s, language);
}

function buildFallbackQueries(
  title: string,
  h1: string,
  h2s: string[],
  language: string
): string[] {
  const mainTopic = (h1 || title).replace(/[|–—-].*$/, "").trim().slice(0, 60);
  const subtopic = h2s[0] ?? "";

  const templates: Record<string, string[]> = {
    pl: [
      mainTopic,
      subtopic ? subtopic : `jak ${mainTopic.toLowerCase()}`,
      `${mainTopic} ranking`,
      `najlepszy ${mainTopic.toLowerCase()}`,
      `${mainTopic} porównanie`,
      `${mainTopic} 2025`,
    ],
    en: [
      mainTopic,
      subtopic ? subtopic : `how to ${mainTopic.toLowerCase()}`,
      `best ${mainTopic.toLowerCase()}`,
      `${mainTopic} comparison`,
      `${mainTopic} review 2025`,
      `${mainTopic} guide`,
    ],
    de: [
      mainTopic,
      `bestes ${mainTopic.toLowerCase()}`,
      `${mainTopic} Vergleich`,
      `${mainTopic} Bewertung`,
      `${mainTopic} 2025`,
      subtopic || `wie ${mainTopic.toLowerCase()}`,
    ],
    fr: [
      mainTopic,
      `meilleur ${mainTopic.toLowerCase()}`,
      `${mainTopic} comparaison`,
      `${mainTopic} avis`,
      `${mainTopic} 2025`,
      subtopic || `comment ${mainTopic.toLowerCase()}`,
    ],
  };

  return (templates[language] ?? templates.en)
    .filter((q) => q && q.trim().length > 3)
    .slice(0, 6);
}

// ─── Cache ────────────────────────────────────────────────────────────────────

function makeCacheKey(query: string, engine: CitationEngine): string {
  return crypto.createHash("sha256").update(`${engine}:${query}`).digest("hex").slice(0, 64);
}

async function getCachedResult(cacheKey: string): Promise<CitationResult | null> {
  const db = await getDb();
  if (!db) return null;

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h cache
  const rows = await db
    .select()
    .from(citationChecks)
    .where(eq(citationChecks.cacheKey, cacheKey))
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

// ─── Engine 1: ChatGPT (OpenAI Responses API) ─────────────────────────────────

async function checkChatGPT(query: string, targetUrl: string): Promise<CitationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { query, engine: "chatgpt", isCited: "no", snippet: "OpenAI API key not configured" };
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
      console.warn(`[Citation/ChatGPT] API error ${response.status}: ${err.slice(0, 200)}`);
      return { query, engine: "chatgpt", isCited: "no" };
    }

    const data = await response.json();
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

    // STRICT: only exact domain match in annotation URLs
    const exactCitation = citedUrls.find((u) => {
      try {
        return new URL(u).hostname.replace("www.", "") === targetDomain;
      } catch { return false; }
    });

    if (exactCitation) {
      return {
        query, engine: "chatgpt", isCited: "yes",
        citedUrl: exactCitation,
        snippet: extractSnippet(responseText, targetDomain),
        responseText: responseText.slice(0, 1000),
      };
    }

    return { query, engine: "chatgpt", isCited: "no", responseText: responseText.slice(0, 500) };
  } catch (e) {
    console.warn("[Citation/ChatGPT] Error:", e);
    return { query, engine: "chatgpt", isCited: "no" };
  }
}

// ─── Engine 2: Perplexity ─────────────────────────────────────────────────────

async function checkPerplexity(
  query: string,
  targetUrl: string,
  language: string = "en"
): Promise<CitationResult> {
  const targetDomain = new URL(targetUrl).hostname.replace("www.", "");
  const perplexityKey = process.env.PERPLEXITY_API_KEY;

  // Option A: Direct Perplexity Sonar API (real citations[])
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

        const exactCitation = citations.find((u: string) => {
          try { return new URL(u).hostname.replace("www.", "") === targetDomain; }
          catch { return false; }
        });

        if (exactCitation) {
          return {
            query, engine: "perplexity", isCited: "yes",
            citedUrl: exactCitation,
            snippet: extractSnippet(responseText, targetDomain),
            responseText: responseText.slice(0, 1000),
          };
        }
        return { query, engine: "perplexity", isCited: "no", responseText: responseText.slice(0, 500) };
      }
    } catch (e) {
      console.warn("[Citation/Perplexity] Direct API error, falling back:", e);
    }
  }

  // Option B: Manus built-in LLM (zero cost) — ask naturally, parse citations block
  const langInstructions: Record<string, string> = {
    pl: "Odpowiadaj po polsku. Na końcu odpowiedzi podaj listę URL źródeł.",
    en: "Answer in English. At the end, list the source URLs you cited.",
    de: "Antworte auf Deutsch. Liste am Ende die Quell-URLs auf.",
    fr: "Réponds en français. Liste les URLs sources à la fin.",
  };
  const langInstruction = langInstructions[language] ?? langInstructions.en;

  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a research assistant. Answer the user's question based on current web knowledge.
${langInstruction}
After your answer, output a JSON citations block EXACTLY like this (no other format):
<citations>{"urls": ["https://source1.com/page", "https://source2.com/page"]}</citations>
IMPORTANT: Only include URLs you are highly confident exist. Do NOT invent URLs.`,
        },
        { role: "user", content: query },
      ],
    });

    const text = result.choices[0]?.message?.content;
    if (!text || typeof text !== "string") {
      return { query, engine: "perplexity", isCited: "no" };
    }

    const citationsMatch = text.match(/<citations>([\s\S]*?)<\/citations>/);
    let citedUrls: string[] = [];
    if (citationsMatch) {
      try {
        const parsed = JSON.parse(citationsMatch[1]);
        citedUrls = Array.isArray(parsed.urls) ? parsed.urls : [];
      } catch {}
    }

    const exactCitation = citedUrls.find((u: string) => {
      try { return new URL(u).hostname.replace("www.", "") === targetDomain; }
      catch { return false; }
    });

    if (exactCitation) {
      return {
        query, engine: "perplexity", isCited: "yes",
        citedUrl: exactCitation,
        snippet: extractSnippet(text, targetDomain),
        responseText: text.slice(0, 1000),
      };
    }

    return { query, engine: "perplexity", isCited: "no", responseText: text.slice(0, 500) };
  } catch (e) {
    console.warn("[Citation/Perplexity] LLM error:", e);
    return { query, engine: "perplexity", isCited: "no" };
  }
}

// ─── Engine 3: Google AI Overviews (Puppeteer) ────────────────────────────────

async function checkGoogleAIOverview(
  query: string,
  targetUrl: string,
  language: string = "en"
): Promise<CitationResult> {
  const targetDomain = new URL(targetUrl).hostname.replace("www.", "");

  const localeMap: Record<string, { hl: string; gl: string }> = {
    pl: { hl: "pl", gl: "pl" },
    en: { hl: "en", gl: "us" },
    de: { hl: "de", gl: "de" },
    fr: { hl: "fr", gl: "fr" },
    es: { hl: "es", gl: "es" },
  };
  const locale = localeMap[language] ?? localeMap.en;
  const acceptLang = language === "pl" ? "pl-PL,pl;q=0.9" : "en-US,en;q=0.9";

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: "/usr/bin/chromium-browser",
      args: [
        "--no-sandbox", "--disable-setuid-sandbox",
        "--disable-dev-shm-usage", "--disable-gpu",
        `--lang=${locale.hl}`,
      ],
      headless: true,
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({ "Accept-Language": acceptLang });

    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=${locale.hl}&gl=${locale.gl}`;
    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 25000 });
    await new Promise((r) => setTimeout(r, 3000));

    const result = await page.evaluate((domain: string) => {
      // 2025 Google AI Overview selectors (multiple fallbacks)
      const selectors = [
        "[data-attrid='SGE']",
        "div[jsname='yEVEwb']",
        "div[jsname='BiSLff']",
        ".M8OgIe",
        ".YzVZnd",
        ".IVvPP",
        "[data-sgrd='true']",
        ".wDYxhc",
        "[aria-label*='AI Overview']",
        "[aria-label*='AI overview']",
        "[aria-label*='Przegląd AI']",
        // 2025 new structure
        "div[data-ved][jscontroller]",
      ];

      let el: Element | null = null;
      for (const sel of selectors) {
        try {
          const found = document.querySelector(sel);
          if (found && (found.textContent?.length ?? 0) > 100) { el = found; break; }
        } catch {}
      }

      // Fallback: find by "AI Overview" / "Przegląd AI" heading text
      if (!el) {
        const allEls = Array.from(document.querySelectorAll("*"));
        for (const e of allEls) {
          const txt = e.textContent?.trim() ?? "";
          if ((txt === "AI Overview" || txt === "Przegląd AI") && e.tagName !== "BODY") {
            el = e.closest("div[data-attrid], div[jsname], section") ?? e.parentElement;
            if (el && (el.textContent?.length ?? 0) > 100) break;
            el = null;
          }
        }
      }

      if (!el) return { hasAIOverview: false, citedUrls: [] as string[], text: "" };

      const text = el.textContent ?? "";
      const links = Array.from(el.querySelectorAll("a[href]"));
      const citedUrls = links
        .map((a) => {
          const href = (a as HTMLAnchorElement).href;
          if (href.includes("google.com/url?")) {
            try { return new URL(href).searchParams.get("q") ?? href; } catch {}
          }
          return href;
        })
        .filter((href) => href.startsWith("http") && !href.includes("google.com"));

      return { hasAIOverview: true, citedUrls, text: text.slice(0, 1500) };
    }, targetDomain);

    if (!result.hasAIOverview) {
      return { query, engine: "google", isCited: "no", snippet: "No AI Overview for this query" };
    }

    const exactCitation = result.citedUrls.find((u: string) => {
      try { return new URL(u).hostname.replace("www.", "") === targetDomain; }
      catch { return false; }
    });

    if (exactCitation) {
      return {
        query, engine: "google", isCited: "yes",
        citedUrl: exactCitation,
        snippet: extractSnippet(result.text, targetDomain),
        responseText: result.text.slice(0, 1000),
      };
    }

    return {
      query, engine: "google", isCited: "no",
      responseText: `AI Overview found (${result.citedUrls.length} sources), ${targetDomain} not cited.`,
    };
  } catch (e) {
    console.warn("[Citation/Google] Puppeteer error:", e);
    return { query, engine: "google", isCited: "no", snippet: "Google scraping failed" };
  } finally {
    if (browser) await browser.close().catch(() => {});
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
 * Run a full citation check job.
 * Fetches page content independently, generates queries via LLM fan-out,
 * then checks all 3 engines with 24h caching.
 */
export async function runCitationJob(jobId: number): Promise<CitationJobResult | null> {
  const db = await getDb();
  if (!db) return null;

  const jobs = await db.select().from(citationJobs).where(eq(citationJobs.id, jobId)).limit(1);
  const job = jobs[0];
  if (!job) return null;

  await db.update(citationJobs).set({ status: "running" }).where(eq(citationJobs.id, jobId));

  try {
    // Step 1: Extract page content for query fan-out
    console.log(`[Citation] Job ${jobId}: extracting page content from ${job.url}`);
    const pageContent = await extractPageContent(job.url);

    // Step 2: Generate queries via LLM fan-out (or use stored prompts if already set)
    let queries: string[] = (job.prompts as string[]) ?? [];
    if (queries.length === 0) {
      console.log(`[Citation] Job ${jobId}: generating queries via fan-out (lang: ${pageContent.language})`);
      queries = await fanOutQueries(pageContent, job.url);

      // Store generated queries back in the job
      await db.update(citationJobs)
        .set({ prompts: queries, language: pageContent.language })
        .where(eq(citationJobs.id, jobId));
    }

    const language = (job as any).language || pageContent.language;
    console.log(`[Citation] Job ${jobId}: checking ${queries.length} queries × 3 engines`);

    const results: CitationResult[] = [];

    for (const query of queries) {
      for (const engine of ["chatgpt", "perplexity", "google"] as CitationEngine[]) {
        const cacheKey = makeCacheKey(query, engine);
        const cached = await getCachedResult(cacheKey);
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

        // Delay between API calls to avoid rate limits
        await new Promise((r) => setTimeout(r, 1000));
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
      if (r.isCited === "yes") summary[r.engine].cited++;
    }

    await db
      .update(citationJobs)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(citationJobs.id, jobId));

    console.log(`[Citation] Job ${jobId}: completed. Summary:`, JSON.stringify(summary));
    return { jobId, auditId: job.auditId, url: job.url, queries, results, summary };
  } catch (e) {
    console.error(`[Citation] Job ${jobId} failed:`, e);
    await db
      .update(citationJobs)
      .set({ status: "failed" })
      .where(eq(citationJobs.id, jobId));
    return null;
  }
}

// ─── Legacy exports (backward compat) ────────────────────────────────────────

export function detectPageLanguage(html: string, pageTitle: string): string {
  const langMatch = html.match(/<html[^>]+lang=["']([a-zA-Z-]+)["']/i);
  if (langMatch) return langMatch[1].toLowerCase().split("-")[0];
  if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(pageTitle)) return "pl";
  return "en";
}

export function prepareCitationQueries(params: {
  pageTitle: string; url: string;
  topQuestions?: string[]; pageTopics?: string[]; language?: string;
}): string[] {
  if (params.topQuestions && params.topQuestions.length >= 1) {
    return params.topQuestions.filter((q) => q?.trim().length > 0).slice(0, 6);
  }
  return buildFallbackQueries(params.pageTitle, "", [], params.language ?? "en");
}

export async function generateCitationQueries(params: {
  url: string; pageTitle: string; pageTopics: string[];
  pageType: string; topQuestions?: string[]; language?: string;
}): Promise<string[]> {
  return prepareCitationQueries({
    pageTitle: params.pageTitle, url: params.url,
    topQuestions: params.topQuestions, pageTopics: params.pageTopics,
    language: params.language,
  });
}
