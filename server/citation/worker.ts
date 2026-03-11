/**
 * AI Citation Worker v4 — Adaptive Fan-Out
 *
 * Strategy:
 *   1. Generate 5 entity-driven queries from Content Intelligence (keywords, top_questions)
 *   2. Check Google AI Overviews for each query
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
 * Google AI Overview runs in all rounds (free via Puppeteer).
 */

import * as crypto from "crypto";
import * as cheerio from "cheerio";
import puppeteer from "puppeteer-core";
import { invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import { citationChecks, citationJobs, audits } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

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
      // Extract keywords from CI dimensions
      if (ciData.query_coverage?.top_questions) {
        ciTopQuestions.push(...(ciData.query_coverage.top_questions as string[]).slice(0, 8));
      }
      if (ciData.page_topics) {
        ciTopics.push(...(ciData.page_topics as string[]).slice(0, 6));
      }
      // Extract from semantic gaps (what topics are missing — also useful for queries)
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

  const sets: string[][] = isPolish
    ? [
        [base, `${base} ranking`, `najlepszy ${base}`, `${base} opinie`, `${base} porównanie`],
        [`jak wybrać ${base}`, `${base} 2025`, `${base} kalkulator`, `${base} bez prowizji`, `${base} oferta`],
        [`${base} warunki`, `${base} wymagania`, `${base} krok po kroku`, `${base} przykład`, `${base} co to jest`],
        [`${base} dla firm`, `${base} online`, `${base} ranking 2025`, `${base} bezpieczny`, `${base} recenzja`],
        [`${base} alternatywy`, `zamiast ${base}`, `${base} wady zalety`, `${base} czy warto`, `${base} doświadczenia`],
      ]
    : [
        [base, `best ${base}`, `${base} review`, `${base} comparison`, `${base} guide`],
        [`how to choose ${base}`, `${base} 2025`, `${base} calculator`, `${base} without fees`, `${base} offer`],
        [`${base} requirements`, `${base} step by step`, `${base} example`, `what is ${base}`, `${base} explained`],
        [`${base} for business`, `${base} online`, `${base} ranking 2025`, `${base} safe`, `${base} pros cons`],
        [`${base} alternatives`, `instead of ${base}`, `${base} worth it`, `${base} experience`, `${base} tips`],
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

  // Build rich context for LLM
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
      messages: [
        {
          role: "system",
          content: `You are an expert in AI search behavior and GEO (Generative Engine Optimization). 
          
Your task: Generate exactly 5 search queries that real users would type into ChatGPT or Google to find information covered by this webpage.

${roundContext}

Rules:
- ${langNote}
- Queries must be natural and conversational (how real users ask AI assistants)
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

// ─── Engine 2: Google AI Overviews (Puppeteer) ────────────────────────────────

async function checkGoogleAIOverview(
  query: string,
  targetUrl: string,
  language: string = "en",
  round: number = 1
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
    console.log(`[Citation/Google] Round ${round}: "${query.slice(0, 50)}"`);
    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 4000));

    const result = await page.evaluate(() => {
      let el: Element | null = null;

      const classSelectors = [
        ".YzCcne", ".M8OgIe", ".YzVZnd", ".kno-result",
        "[data-attrid='SGE']", "div[jsname='yEVEwb']",
        ".AIOverview", ".ai-overview",
      ];
      for (const sel of classSelectors) {
        try {
          const found = document.querySelector(sel);
          if (found && (found.textContent?.length ?? 0) > 100) { el = found; break; }
        } catch {}
      }

      if (!el) {
        const headings = Array.from(document.querySelectorAll("h1, h2, h3, [role='heading']"));
        for (const h of headings) {
          const txt = h.textContent?.trim() ?? "";
          if (txt === "AI Overview" || txt === "Przegląd od AI" || txt.startsWith("AI Overview")) {
            let parent = h.parentElement;
            for (let i = 0; i < 5 && parent; i++) {
              if (parent.querySelectorAll("a[href]").length >= 2) { el = parent; break; }
              parent = parent.parentElement;
            }
            if (el) break;
          }
        }
      }

      if (!el) {
        const candidates = Array.from(document.querySelectorAll("[aria-label*='AI'], [data-ved]"));
        for (const c of candidates) {
          const txt = c.textContent?.trim() ?? "";
          if ((txt.includes("AI Overview") || txt.includes("Przegląd od AI")) && c.querySelectorAll("a[href]").length >= 2) {
            el = c; break;
          }
        }
      }

      if (!el) return { hasAIOverview: false, allCitedUrls: [] as string[], text: "" };

      const text = el.textContent ?? "";
      const links = Array.from(el.querySelectorAll("a[href]"));
      const allCitedUrls = links
        .map((a) => {
          let href = (a as HTMLAnchorElement).href;
          if (href.includes("/url?q=") || href.includes("google.com/url")) {
            try { const u = new URL(href); href = u.searchParams.get("q") ?? href; } catch {}
          }
          return href.split("#")[0];
        })
        .filter((href) => {
          if (!href.startsWith("http")) return false;
          try {
            const u = new URL(href);
            return !u.hostname.includes("google.com") && !u.hostname.includes("googleapis.com") && !u.hostname.includes("gstatic.com");
          } catch { return false; }
        });

      return { hasAIOverview: true, allCitedUrls: Array.from(new Set(allCitedUrls)), text: text.slice(0, 2000) };
    });

    console.log(`[Citation/Google] hasAIOverview: ${result.hasAIOverview}, sources: ${result.allCitedUrls.length}`);

    if (!result.hasAIOverview) {
      return {
        query, engine: "google", round, isCited: "no",
        allCitedUrls: [], competitorDomains: [],
        hasAIOverview: false,
        snippet: "Brak AI Overview dla tego zapytania",
      };
    }

    const competitorDomains = extractCompetitorDomains(result.allCitedUrls, targetDomain);

    const exactCitation = result.allCitedUrls.find((u: string) => {
      try {
        const cu = new URL(u);
        return cu.hostname.replace("www.", "") === targetDomain &&
               cu.pathname.replace(/\/$/, "") === targetPath;
      } catch { return false; }
    });

    if (exactCitation) {
      return {
        query, engine: "google", round, isCited: "yes",
        citedUrl: exactCitation, allCitedUrls: result.allCitedUrls, competitorDomains,
        hasAIOverview: true,
        snippet: extractSnippet(result.text, targetDomain),
        responseText: result.text.slice(0, 1500),
      };
    }

    const domainCitation = result.allCitedUrls.find((u: string) => {
      try { return new URL(u).hostname.replace("www.", "") === targetDomain; }
      catch { return false; }
    });

    if (domainCitation) {
      return {
        query, engine: "google", round, isCited: "domain",
        domainCitedUrl: domainCitation, allCitedUrls: result.allCitedUrls, competitorDomains,
        hasAIOverview: true,
        snippet: extractSnippet(result.text, targetDomain),
        responseText: result.text.slice(0, 1500),
      };
    }

    return {
      query, engine: "google", round, isCited: "no",
      allCitedUrls: result.allCitedUrls, competitorDomains,
      hasAIOverview: true,
      responseText: result.text.slice(0, 800),
    };
  } catch (e) {
    console.warn("[Citation/Google] Puppeteer error:", e);
    return { query, engine: "google", round, isCited: "no", allCitedUrls: [], competitorDomains: [], hasAIOverview: false };
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
    const QUERIES_PER_ROUND = 5;
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
        // Google AI Overview — run in ALL rounds
        const googleCacheKey = makeCacheKey(query, "google");
        let googleCached = await getCachedResult(googleCacheKey);
        let googleResult: CitationResult;

        if (googleCached) {
          console.log(`[Citation] Cache hit: google / "${query.slice(0, 40)}"`);
          googleResult = { ...googleCached, round };
        } else {
          googleResult = await checkGoogleAIOverview(query, job.url, language, round);
          await saveResult(jobId, job.auditId, googleResult, googleCacheKey);
          await new Promise((r) => setTimeout(r, 2000));
        }
        roundResults.push(googleResult);
        allResults.push(googleResult);

        // ChatGPT Search — only in round 1 (cost control)
        if (round === 1) {
          const chatgptCacheKey = makeCacheKey(query, "chatgpt");
          let chatgptCached = await getCachedResult(chatgptCacheKey);
          let chatgptResult: CitationResult;

          if (chatgptCached) {
            console.log(`[Citation] Cache hit: chatgpt / "${query.slice(0, 40)}"`);
            chatgptResult = { ...chatgptCached, round };
          } else {
            chatgptResult = await checkChatGPT(query, job.url, round);
            await saveResult(jobId, job.auditId, chatgptResult, chatgptCacheKey);
            await new Promise((r) => setTimeout(r, 1500));
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
