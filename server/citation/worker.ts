/**
 * AI Citation Worker v3 — Complete Rewrite
 *
 * Checks if a given URL is cited by AI search engines:
 *   1. ChatGPT Search  — OpenAI chat/completions with web_search_options
 *   2. Google AI Overviews — Puppeteer headless scrape
 *
 * WHAT IT RETURNS:
 *   - isCited: "yes" (exact URL), "domain" (same domain, different page), "no"
 *   - allCitedUrls: ALL URLs cited by AI for this query (competitor domains)
 *   - hasAIOverview: whether Google AI Overview was present at all
 *
 * QUERY STRATEGY:
 *   - Backend fetches the URL, extracts title/H1/H2/meta description
 *   - LLM generates 4 realistic user queries in the page's language
 *   - Fallback: deterministic queries from page title
 */

import * as crypto from "crypto";
import * as cheerio from "cheerio";
import puppeteer from "puppeteer-core";
import { invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import { citationChecks, citationJobs } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CitationEngine = "chatgpt" | "google";

export interface CitationResult {
  query: string;
  engine: CitationEngine;
  /** "yes" = exact URL cited | "domain" = different page same domain | "no" = not found */
  isCited: "yes" | "domain" | "no";
  citedUrl?: string;        // exact URL cited (when isCited = "yes")
  domainCitedUrl?: string;  // URL from same domain (when isCited = "domain")
  allCitedUrls: string[];   // ALL URLs cited by AI (including competitors)
  snippet?: string;
  responseText?: string;
  hasAIOverview?: boolean;  // Google only: was AI Overview present?
  fromCache?: boolean;
}

export interface CitationJobResult {
  jobId: number;
  auditId: number;
  url: string;
  queries: string[];
  results: CitationResult[];
  summary: {
    chatgpt: { cited: number; domainCited: number; total: number; queriesWithAI: number };
    google: { cited: number; domainCited: number; total: number; queriesWithAI: number };
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

export async function extractPageContent(url: string): Promise<PageContent> {
  try {
    const { default: axios } = await import("axios");
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GEOAuditor/3.0; +https://geoauditor.com)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "pl,en;q=0.9",
      },
      maxContentLength: 2 * 1024 * 1024,
    });

    const html = typeof response.data === "string" ? response.data : String(response.data);
    const $ = cheerio.load(html);

    // Language detection
    const langAttr = $("html").attr("lang") ?? "";
    const lang = langAttr.toLowerCase().split("-")[0];
    const hasPolish = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(html.slice(0, 5000));
    const language = lang || (hasPolish ? "pl" : "en");

    const title = $("title").first().text().trim().replace(/\s+/g, " ").slice(0, 120);
    const h1 = $("h1").first().text().trim().replace(/\s+/g, " ").slice(0, 120);
    const h2s = $("h2").map((_, el) => $(el).text().trim().replace(/\s+/g, " ").slice(0, 80)).get().slice(0, 5);
    const metaDescription = ($("meta[name='description']").attr("content") ?? "").trim().slice(0, 200);

    return { title, h1, h2s, metaDescription, language };
  } catch (e) {
    console.warn("[Citation] extractPageContent failed:", e);
    return { title: "", h1: "", h2s: [], metaDescription: "", language: "en" };
  }
}

// ─── Query Fan-Out ────────────────────────────────────────────────────────────

function buildFallbackQueries(content: PageContent, url: string): string[] {
  const base = content.h1 || content.title || new URL(url).hostname;
  const lang = content.language;

  if (lang === "pl") {
    return [
      base,
      `${base} ranking`,
      `najlepszy ${base}`,
      `${base} opinie`,
    ].filter(Boolean).slice(0, 4);
  }
  return [
    base,
    `best ${base}`,
    `${base} review`,
    `${base} comparison`,
  ].filter(Boolean).slice(0, 4);
}

async function fanOutQueries(content: PageContent, url: string): Promise<string[]> {
  const { title, h1, h2s, metaDescription, language } = content;
  const pageSignals = [
    title && `Title: ${title}`,
    h1 && `H1: ${h1}`,
    h2s.length > 0 && `H2s: ${h2s.slice(0, 3).join(" | ")}`,
    metaDescription && `Meta: ${metaDescription}`,
  ].filter(Boolean).join("\n");

  const langNote = language === "pl"
    ? "Generate queries in POLISH (język polski)."
    : `Generate queries in the same language as the page (${language}).`;

  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert in AI search behavior. Given a webpage's content signals, generate 4 realistic search queries that real users would type into ChatGPT or Google to find information covered by this page.

Rules:
- Queries must be natural, conversational (like real users ask AI assistants)
- ${langNote}
- Do NOT include the domain name or URL in queries
- Focus on the informational intent of the page
- Return ONLY a JSON array of 4 strings, nothing else

Example output: ["kredyt gotówkowy ranking 2025", "najlepszy kredyt gotówkowy porównanie", "jak wybrać kredyt gotówkowy", "kredyt gotówkowy kalkulator oprocentowanie"]`,
        },
        {
          role: "user",
          content: `Page signals:\n${pageSignals}\n\nURL: ${url}`,
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
              queries: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["queries"],
            additionalProperties: false,
          },
        },
      },
    });

    const text = result.choices[0]?.message?.content;
    if (!text) return buildFallbackQueries(content, url);

    const parsed = JSON.parse(typeof text === "string" ? text : JSON.stringify(text));
    const queries: string[] = Array.isArray(parsed.queries)
      ? parsed.queries.filter((q: unknown) => typeof q === "string" && q.trim().length > 3).slice(0, 4)
      : [];

    return queries.length >= 2 ? queries : buildFallbackQueries(content, url);
  } catch (e) {
    console.warn("[Citation] fanOutQueries LLM failed, using fallback:", e);
    return buildFallbackQueries(content, url);
  }
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
    .where(and(eq(citationChecks.cacheKey, cacheKey)))
    .limit(1);

  const row = rows[0];
  if (!row || row.checkedAt < cutoff) return null;

  return {
    query: typeof row.query === "string" ? row.query : "",
    engine: row.engine as CitationEngine,
    isCited: row.isCited as "yes" | "domain" | "no",
    citedUrl: row.citedUrl ?? undefined,
    domainCitedUrl: row.domainCitedUrl ?? undefined,
    allCitedUrls: Array.isArray(row.allCitedUrls) ? (row.allCitedUrls as string[]) : [],
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
    snippet: result.snippet ?? null,
    responseText: result.responseText?.slice(0, 2000) ?? null,
    hasAIOverview: result.hasAIOverview ?? false,
    cacheKey,
  });
}

// ─── Engine 1: ChatGPT Search ─────────────────────────────────────────────────

async function checkChatGPT(query: string, targetUrl: string): Promise<CitationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { query, engine: "chatgpt", isCited: "no", allCitedUrls: [], snippet: "OpenAI API key not configured" };
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
      return { query, engine: "chatgpt", isCited: "no", allCitedUrls: [] };
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;
    const responseText: string = message?.content ?? "";
    const allCitedUrls: string[] = [];

    // Extract URLs from annotations (url_citation type in chat/completions format)
    for (const ann of message?.annotations ?? []) {
      if (ann.type === "url_citation" && ann.url_citation?.url) {
        const url = ann.url_citation.url.split("?utm_source=")[0]; // strip tracking
        if (!allCitedUrls.includes(url)) allCitedUrls.push(url);
      }
    }

    // Check 1: exact URL match (same domain + same path)
    const exactCitation = allCitedUrls.find((u) => {
      try {
        const cu = new URL(u);
        return cu.hostname.replace("www.", "") === targetDomain &&
               cu.pathname.replace(/\/$/, "") === targetPath;
      } catch { return false; }
    });

    if (exactCitation) {
      return {
        query, engine: "chatgpt", isCited: "yes",
        citedUrl: exactCitation,
        allCitedUrls,
        snippet: extractSnippet(responseText, targetDomain),
        responseText: responseText.slice(0, 1500),
      };
    }

    // Check 2: same domain, different page
    const domainCitation = allCitedUrls.find((u) => {
      try { return new URL(u).hostname.replace("www.", "") === targetDomain; }
      catch { return false; }
    });

    if (domainCitation) {
      return {
        query, engine: "chatgpt", isCited: "domain",
        domainCitedUrl: domainCitation,
        allCitedUrls,
        snippet: extractSnippet(responseText, targetDomain),
        responseText: responseText.slice(0, 1500),
      };
    }

    return { query, engine: "chatgpt", isCited: "no", allCitedUrls, responseText: responseText.slice(0, 800) };
  } catch (e) {
    console.warn("[Citation/ChatGPT] Error:", e);
    return { query, engine: "chatgpt", isCited: "no", allCitedUrls: [] };
  }
}

// ─── Engine 2: Google AI Overviews (Puppeteer) ────────────────────────────────

async function checkGoogleAIOverview(
  query: string,
  targetUrl: string,
  language: string = "en"
): Promise<CitationResult> {
  const targetDomain = new URL(targetUrl).hostname.replace("www.", "");
  const targetPath = new URL(targetUrl).pathname.replace(/\/$/, "");

  const localeMap: Record<string, { hl: string; gl: string; acceptLang: string }> = {
    pl: { hl: "pl", gl: "pl", acceptLang: "pl-PL,pl;q=0.9" },
    en: { hl: "en", gl: "us", acceptLang: "en-US,en;q=0.9" },
    de: { hl: "de", gl: "de", acceptLang: "de-DE,de;q=0.9" },
    fr: { hl: "fr", gl: "fr", acceptLang: "fr-FR,fr;q=0.9" },
    es: { hl: "es", gl: "es", acceptLang: "es-ES,es;q=0.9" },
  };
  const locale = localeMap[language] ?? localeMap.en;

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: "/usr/bin/chromium-browser",
      args: [
        "--no-sandbox", "--disable-setuid-sandbox",
        "--disable-dev-shm-usage", "--disable-gpu",
        "--disable-blink-features=AutomationControlled",
        `--lang=${locale.hl}`,
      ],
      headless: true,
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({ "Accept-Language": locale.acceptLang });

    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=${locale.hl}&gl=${locale.gl}`;
    console.log(`[Citation/Google] Searching: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30000 });
    // Wait extra for AI Overview to load (it's async)
    await new Promise((r) => setTimeout(r, 4000));

    const result = await page.evaluate(() => {
      // Strategy: find AI Overview container using multiple selectors
      // AI Overview is a special block with "AI Overview" or "Przegląd od AI" heading
      let el: Element | null = null;

      // 1. Known class selectors (updated March 2026)
      const classSelectors = [
        ".YzCcne", ".M8OgIe", ".YzVZnd", ".kno-result",
        "[data-attrid='SGE']", "div[jsname='yEVEwb']",
        ".AIOverview", ".ai-overview",
      ];
      for (const sel of classSelectors) {
        try {
          const found = document.querySelector(sel);
          if (found && (found.textContent?.length ?? 0) > 100) {
            el = found;
            break;
          }
        } catch {}
      }

      // 2. Find by heading text "AI Overview" or "Przegląd od AI"
      if (!el) {
        const headings = Array.from(document.querySelectorAll("h1, h2, h3, [role='heading']"));
        for (const h of headings) {
          const txt = h.textContent?.trim() ?? "";
          if (txt === "AI Overview" || txt === "Przegląd od AI" || txt.startsWith("AI Overview")) {
            // Get parent container
            let parent = h.parentElement;
            for (let i = 0; i < 5 && parent; i++) {
              if (parent.querySelectorAll("a[href]").length >= 2) {
                el = parent;
                break;
              }
              parent = parent.parentElement;
            }
            if (el) break;
          }
        }
      }

      // 3. Find by aria-label or data attributes
      if (!el) {
        const candidates = Array.from(document.querySelectorAll("[aria-label*='AI'], [data-ved]"));
        for (const c of candidates) {
          const txt = c.textContent?.trim() ?? "";
          if (
            (txt.includes("AI Overview") || txt.includes("Przegląd od AI")) &&
            c.querySelectorAll("a[href]").length >= 2
          ) {
            el = c;
            break;
          }
        }
      }

      if (!el) {
        return { hasAIOverview: false, allCitedUrls: [] as string[], text: "", html: "" };
      }

      const text = el.textContent ?? "";
      const links = Array.from(el.querySelectorAll("a[href]"));

      const allCitedUrls = links
        .map((a) => {
          let href = (a as HTMLAnchorElement).href;
          // Unwrap Google redirect URLs (/url?q=...)
          if (href.includes("/url?q=") || href.includes("google.com/url")) {
            try {
              const urlObj = new URL(href);
              href = urlObj.searchParams.get("q") ?? href;
            } catch {}
          }
          // Remove fragment anchors
          href = href.split("#")[0];
          return href;
        })
        .filter((href) => {
          if (!href.startsWith("http")) return false;
          try {
            const u = new URL(href);
            // Exclude Google domains
            if (u.hostname.includes("google.com")) return false;
            if (u.hostname.includes("googleapis.com")) return false;
            if (u.hostname.includes("gstatic.com")) return false;
            return true;
          } catch { return false; }
        });

      // Deduplicate
      const unique = Array.from(new Set(allCitedUrls));

      return {
        hasAIOverview: true,
        allCitedUrls: unique,
        text: text.slice(0, 2000),
        html: el.innerHTML.slice(0, 500),
      };
    });

    console.log(`[Citation/Google] Query: "${query}" → hasAIOverview: ${result.hasAIOverview}, sources: ${result.allCitedUrls.length}`);

    if (!result.hasAIOverview) {
      return {
        query, engine: "google", isCited: "no",
        allCitedUrls: [],
        hasAIOverview: false,
        snippet: "Brak AI Overview dla tego zapytania",
      };
    }

    // Check 1: exact URL match
    const exactCitation = result.allCitedUrls.find((u: string) => {
      try {
        const cu = new URL(u);
        return cu.hostname.replace("www.", "") === targetDomain &&
               cu.pathname.replace(/\/$/, "") === targetPath;
      } catch { return false; }
    });

    if (exactCitation) {
      return {
        query, engine: "google", isCited: "yes",
        citedUrl: exactCitation,
        allCitedUrls: result.allCitedUrls,
        hasAIOverview: true,
        snippet: extractSnippet(result.text, targetDomain),
        responseText: result.text.slice(0, 1500),
      };
    }

    // Check 2: same domain, different page
    const domainCitation = result.allCitedUrls.find((u: string) => {
      try { return new URL(u).hostname.replace("www.", "") === targetDomain; }
      catch { return false; }
    });

    if (domainCitation) {
      return {
        query, engine: "google", isCited: "domain",
        domainCitedUrl: domainCitation,
        allCitedUrls: result.allCitedUrls,
        hasAIOverview: true,
        snippet: extractSnippet(result.text, targetDomain),
        responseText: result.text.slice(0, 1500),
      };
    }

    return {
      query, engine: "google", isCited: "no",
      allCitedUrls: result.allCitedUrls,
      hasAIOverview: true,
      responseText: result.text.slice(0, 800),
    };
  } catch (e) {
    console.warn("[Citation/Google] Puppeteer error:", e);
    return { query, engine: "google", isCited: "no", allCitedUrls: [], hasAIOverview: false };
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
  const end = Math.min(text.length, idx + 150);
  return "..." + text.slice(start, end) + "...";
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
    // Step 1: Extract page content
    console.log(`[Citation] Job ${jobId}: extracting page content from ${job.url}`);
    const pageContent = await extractPageContent(job.url);

    // Step 2: Generate queries
    let queries: string[] = (job.prompts as string[]) ?? [];
    if (queries.length === 0) {
      console.log(`[Citation] Job ${jobId}: generating queries (lang: ${pageContent.language})`);
      queries = await fanOutQueries(pageContent, job.url);
      await db.update(citationJobs)
        .set({ prompts: queries, language: pageContent.language })
        .where(eq(citationJobs.id, jobId));
    }

    const language = (job as any).language || pageContent.language;
    console.log(`[Citation] Job ${jobId}: checking ${queries.length} queries × 2 engines`);

    const results: CitationResult[] = [];

    for (const query of queries) {
      for (const engine of ["chatgpt", "google"] as CitationEngine[]) {
        const cacheKey = makeCacheKey(query, engine);
        const cached = await getCachedResult(cacheKey);
        if (cached) {
          console.log(`[Citation] Cache hit: ${engine} / "${query.slice(0, 40)}"`);
          results.push(cached);
          continue;
        }

        let result: CitationResult;
        if (engine === "chatgpt") {
          result = await checkChatGPT(query, job.url);
        } else {
          result = await checkGoogleAIOverview(query, job.url, language);
        }

        await saveResult(jobId, job.auditId, result, cacheKey);
        results.push(result);

        // Delay between calls
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    // Build summary
    const summary = {
      chatgpt: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 },
      google: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 },
    };
    for (const r of results) {
      const eng = r.engine as "chatgpt" | "google";
      summary[eng].total++;
      if (r.isCited === "yes") summary[eng].cited++;
      if (r.isCited === "domain") summary[eng].domainCited++;
      if (r.hasAIOverview !== false && (r.allCitedUrls.length > 0 || r.isCited !== "no")) {
        summary[eng].queriesWithAI++;
      }
    }

    await db
      .update(citationJobs)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(citationJobs.id, jobId));

    console.log(`[Citation] Job ${jobId}: completed.`, JSON.stringify(summary));
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
