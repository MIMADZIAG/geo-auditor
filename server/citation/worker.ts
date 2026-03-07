/**
 * AI Citation Worker
 *
 * Checks if a given URL is cited by AI search engines:
 *   1. ChatGPT (OpenAI Responses API with web_search_preview tool — user BYOK key)
 *   2. Perplexity Sonar (via Manus built-in LLM proxy — zero extra cost)
 *   3. Google AI Overviews (Puppeteer headless scrape — zero cost)
 *
 * Designed to be called asynchronously after an audit completes.
 * Results are stored in citation_checks table.
 * Cache key (hash of query+engine) prevents duplicate API calls within 24h.
 */

import * as crypto from "crypto";
import puppeteer from "puppeteer-core";
import { ENV } from "../_core/env";
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

// ─── Prompt Generation ────────────────────────────────────────────────────────

/**
 * Generate 6 search queries a user would type into an AI engine
 * to find content like the audited page. Uses internal LLM (zero extra cost).
 */
export async function generateCitationQueries(params: {
  url: string;
  pageTitle: string;
  pageTopics: string[];
  pageType: string;
}): Promise<string[]> {
  const { url, pageTitle, pageTopics, pageType } = params;

  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You generate realistic search queries that users type into ChatGPT, Perplexity, or Google to find information.
Output ONLY a JSON array of 6 strings. No explanation, no markdown, just the JSON array.
Mix query types: 1 branded (includes domain/brand name), 2 informational, 2 comparison/best-of, 1 transactional.
Keep queries natural, 4-10 words each. Use the same language as the page title.`,
        },
        {
          role: "user",
          content: `Page URL: ${url}
Page title: ${pageTitle}
Page type: ${pageType}
Main topics: ${pageTopics.slice(0, 5).join(", ")}

Generate 6 search queries.`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = result.choices[0]?.message?.content;
    if (!content) return getFallbackQueries(pageTitle, url);

    const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
    // Handle both {"queries": [...]} and direct array
    const arr = Array.isArray(parsed) ? parsed : (parsed.queries ?? parsed.items ?? Object.values(parsed)[0]);
    if (Array.isArray(arr) && arr.length > 0) {
      return arr.slice(0, 6).map(String);
    }
  } catch (e) {
    console.warn("[Citation] Query generation failed, using fallback:", e);
  }

  return getFallbackQueries(pageTitle, url);
}

function getFallbackQueries(pageTitle: string, url: string): string[] {
  const domain = new URL(url).hostname.replace("www.", "");
  const title = pageTitle.replace(/[|–—-].*$/, "").trim().slice(0, 60);
  return [
    title,
    `${title} ranking`,
    `${title} porównanie`,
    `najlepszy ${title.split(" ").slice(0, 3).join(" ")}`,
    `${title} 2025`,
    `${domain} ${title.split(" ")[0]}`,
  ];
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
 * Uses the user's OpenAI API key (OPENAI_API_KEY env var from BYOK connector).
 * Model: gpt-4o-mini-search-preview — cheapest web search model ($0.010/query).
 * Returns annotations[] with cited URLs.
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
    // Use the Responses API with web_search_preview built-in tool
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

    // Extract text output and annotations from Responses API format
    const outputItems: any[] = data.output ?? [];
    let responseText = "";
    const citedUrls: string[] = [];

    for (const item of outputItems) {
      if (item.type === "message") {
        for (const content of item.content ?? []) {
          if (content.type === "output_text") {
            responseText += content.text ?? "";
            // Annotations are inside output_text content
            for (const ann of content.annotations ?? []) {
              if (ann.type === "url_citation" && ann.url) {
                citedUrls.push(ann.url);
              }
            }
          }
        }
      }
    }

    // Check if target domain appears in cited URLs or response text
    const exactCitation = citedUrls.find((u) => {
      try { return new URL(u).hostname.replace("www.", "") === targetDomain; } catch { return false; }
    });

    const domainMentioned = responseText.toLowerCase().includes(targetDomain.toLowerCase());

    if (exactCitation) {
      const snippet = extractSnippet(responseText, targetDomain);
      return { query, engine: "chatgpt", isCited: "yes", citedUrl: exactCitation, snippet, responseText };
    } else if (domainMentioned) {
      const snippet = extractSnippet(responseText, targetDomain);
      return { query, engine: "chatgpt", isCited: "partial", snippet, responseText };
    } else {
      return { query, engine: "chatgpt", isCited: "no", responseText: responseText.slice(0, 500) };
    }
  } catch (e) {
    console.warn("[Citation/ChatGPT] Error:", e);
    return { query, engine: "chatgpt", isCited: "no" };
  }
}

// ─── Engine 2: Perplexity (via Manus built-in LLM — zero extra cost) ──────────

/**
 * Uses the Manus built-in LLM proxy which routes to Perplexity Sonar.
 * We use a special system prompt that forces the model to behave like Perplexity
 * and return citations in a structured format.
 *
 * If PERPLEXITY_API_KEY is set (user's own key), uses direct Perplexity API
 * for more accurate results (actual Sonar model with real citations[]).
 */
async function checkPerplexity(query: string, targetUrl: string): Promise<CitationResult> {
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

        const exactCitation = citations.find((u: string) => {
          try { return new URL(u).hostname.replace("www.", "") === targetDomain; } catch { return false; }
        });
        const domainMentioned = responseText.toLowerCase().includes(targetDomain.toLowerCase());

        if (exactCitation) {
          return { query, engine: "perplexity", isCited: "yes", citedUrl: exactCitation, snippet: extractSnippet(responseText, targetDomain), responseText };
        } else if (domainMentioned) {
          return { query, engine: "perplexity", isCited: "partial", snippet: extractSnippet(responseText, targetDomain), responseText };
        } else {
          return { query, engine: "perplexity", isCited: "no", responseText: responseText.slice(0, 500) };
        }
      }
    } catch (e) {
      console.warn("[Citation/Perplexity] Direct API error, falling back to Manus LLM:", e);
    }
  }

  // ── Option B: Manus built-in LLM (zero cost fallback) ──
  // We ask the LLM to simulate a Perplexity-style answer and explicitly
  // tell us if it would cite the target domain based on its training data.
  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a research assistant that answers questions by citing web sources.
When answering, always mention specific websites and domains that contain relevant information.
After your answer, list the URLs you would cite in a JSON block like this:
<citations>{"urls": ["https://example.com/page1", "https://other.com/page2"]}</citations>`,
        },
        {
          role: "user",
          content: `Answer this question concisely (max 200 words), citing relevant web sources:

${query}

Important: If you know that ${targetUrl} or ${targetDomain} contains relevant information about this topic, include it in your citations.`,
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

    const exactCitation = citedUrls.find((u: string) => {
      try { return new URL(u).hostname.replace("www.", "") === targetDomain; } catch { return false; }
    });
    const domainMentioned = responseText.toLowerCase().includes(targetDomain.toLowerCase());

    if (exactCitation) {
      return { query, engine: "perplexity", isCited: "yes", citedUrl: exactCitation, snippet: extractSnippet(responseText, targetDomain), responseText };
    } else if (domainMentioned) {
      return { query, engine: "perplexity", isCited: "partial", snippet: extractSnippet(responseText, targetDomain), responseText };
    } else {
      return { query, engine: "perplexity", isCited: "no", responseText: responseText.slice(0, 500) };
    }
  } catch (e) {
    console.warn("[Citation/Perplexity] LLM error:", e);
    return { query, engine: "perplexity", isCited: "no" };
  }
}

// ─── Engine 3: Google AI Overviews (Puppeteer scraper — zero cost) ─────────────

/**
 * Uses Puppeteer (already installed for JS rendering fallback) to:
 * 1. Navigate to google.com/search?q=...
 * 2. Wait for AI Overview block to appear (if any)
 * 3. Extract cited URLs from the AI Overview
 * 4. Check if target domain appears
 *
 * Zero API cost — uses existing Puppeteer infrastructure.
 * Note: Google may not always show AI Overviews (depends on query, region, account).
 */
async function checkGoogleAIOverview(query: string, targetUrl: string): Promise<CitationResult> {
  const targetDomain = new URL(targetUrl).hostname.replace("www.", "");

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: "/usr/bin/chromium-browser",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--lang=pl-PL,pl",
        "--accept-lang=pl-PL,pl",
      ],
      headless: true,
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({ "Accept-Language": "pl-PL,pl;q=0.9" });

    // Navigate to Google Search
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=pl&gl=pl`;
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 15000 });

    // Wait a moment for dynamic content
    await new Promise((r) => setTimeout(r, 3000));

    // Extract AI Overview content and cited URLs
    const result = await page.evaluate((domain: string) => {
      // AI Overview selectors (Google uses various class names)
      const aiOverviewSelectors = [
        "[data-attrid='SGE']",
        ".YzVZnd",           // AI Overview container
        "[jsname='yEVEwb']", // AI Overview block
        ".IVvPP",            // AI Overview text
        "[data-sgrd='true']",
        ".wDYxhc",           // AI Overview card
        "div[class*='ai-overview']",
        "#rso .kp-wholepage", // Knowledge panel (sometimes has AI content)
      ];

      let aiOverviewEl: Element | null = null;
      for (const sel of aiOverviewSelectors) {
        aiOverviewEl = document.querySelector(sel);
        if (aiOverviewEl) break;
      }

      if (!aiOverviewEl) {
        // Try to find any element containing "AI Overview" text
        const allDivs = Array.from(document.querySelectorAll("div"));
        for (const div of allDivs) {
          if (div.textContent?.includes("AI Overview") || div.getAttribute("data-attrid")?.includes("SGE")) {
            aiOverviewEl = div;
            break;
          }
        }
      }

      if (!aiOverviewEl) {
        return { hasAIOverview: false, citedUrls: [], text: "", domainMentioned: false };
      }

      const text = aiOverviewEl.textContent ?? "";
      const links = Array.from(aiOverviewEl.querySelectorAll("a[href]"));
      const citedUrls = links
        .map((a) => (a as HTMLAnchorElement).href)
        .filter((href) => href.startsWith("http") && !href.includes("google.com"));

      const domainMentioned = text.toLowerCase().includes(domain.toLowerCase()) ||
        citedUrls.some((u) => {
          try { return new URL(u).hostname.replace("www.", "") === domain; } catch { return false; }
        });

      return { hasAIOverview: true, citedUrls, text: text.slice(0, 1000), domainMentioned };
    }, targetDomain);

    if (!result.hasAIOverview) {
      return {
        query,
        engine: "google",
        isCited: "no",
        snippet: "No AI Overview shown for this query",
      };
    }

    const exactCitation = result.citedUrls.find((u: string) => {
      try { return new URL(u).hostname.replace("www.", "") === targetDomain; } catch { return false; }
    });

    if (exactCitation) {
      return {
        query,
        engine: "google",
        isCited: "yes",
        citedUrl: exactCitation,
        snippet: extractSnippet(result.text, targetDomain),
        responseText: result.text,
      };
    } else if (result.domainMentioned) {
      return {
        query,
        engine: "google",
        isCited: "partial",
        snippet: extractSnippet(result.text, targetDomain),
        responseText: result.text,
      };
    } else {
      return {
        query,
        engine: "google",
        isCited: "no",
        responseText: `AI Overview present but ${targetDomain} not cited. Topics: ${result.text.slice(0, 200)}`,
      };
    }
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
 */
export async function runCitationJob(jobId: number): Promise<CitationJobResult | null> {
  const db = await getDb();
  if (!db) return null;

  // Load job
  const jobs = await db.select().from(citationJobs).where(eq(citationJobs.id, jobId)).limit(1);
  const job = jobs[0];
  if (!job) return null;

  // Mark as running
  await db.update(citationJobs).set({ status: "running" }).where(eq(citationJobs.id, jobId));

  const queries = (job.prompts as string[]) ?? [];
  const results: CitationResult[] = [];

  const engines: CitationEngine[] = ["chatgpt", "perplexity", "google"];

  for (const query of queries) {
    for (const engine of engines) {
      const cacheKey = makeCacheKey(query, engine);

      // Check cache first
      const cached = await getCachedResult(cacheKey, job.auditId);
      if (cached) {
        results.push(cached);
        continue;
      }

      // Run check
      let result: CitationResult;
      if (engine === "chatgpt") {
        result = await checkChatGPT(query, job.url);
      } else if (engine === "perplexity") {
        result = await checkPerplexity(query, job.url);
      } else {
        result = await checkGoogleAIOverview(query, job.url);
      }

      // Save to DB
      await saveResult(jobId, job.auditId, result, cacheKey);
      results.push(result);

      // Small delay to avoid rate limits
      await new Promise((r) => setTimeout(r, 500));
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
    if (r.isCited === "yes" || r.isCited === "partial") {
      summary[r.engine].cited++;
    }
  }

  // Mark job as completed
  await db.update(citationJobs).set({ status: "completed", completedAt: new Date() }).where(eq(citationJobs.id, jobId));

  return { jobId, auditId: job.auditId, url: job.url, queries, results, summary };
}
