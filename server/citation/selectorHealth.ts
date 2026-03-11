/**
 * Google AI Overview Selector Health Monitor
 *
 * Purpose: Google changes its DOM regularly. This module tests whether our
 * CSS selectors for detecting AI Overview blocks are still working.
 * It runs 5 fixed test queries and verifies that at least one returns
 * a valid AI Overview block with ≥2 cited links.
 *
 * Called by: cron job every 6h (server/index.ts)
 * On failure: notifyOwner() sends immediate email alert
 */

import puppeteer from "puppeteer-core";
import { notifyOwner } from "../_core/notification";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SelectorTestResult {
  query: string;
  hasAIOverview: boolean;
  citedLinksCount: number;
  selectorUsed: string | null; // which selector matched (null = fallback heading search)
  strategyUsed: "class_selector" | "heading_search" | "aria_label" | "none";
  durationMs: number;
  error?: string;
}

export interface SelectorHealthReport {
  checkedAt: Date;
  overallHealthy: boolean;
  successCount: number; // queries where AI Overview was found
  totalTested: number;
  results: SelectorTestResult[];
  /** True if selectors are broken (success rate < 20%) */
  selectorsLikelyBroken: boolean;
  /** True if Google is blocking us (all queries timed out / CAPTCHA) */
  likelyBlocked: boolean;
  alertSent: boolean;
  summary: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Fixed test queries that reliably trigger Google AI Overviews.
 * These are broad, informational queries that Google consistently answers with AI.
 * Mix of EN and PL to test both locales.
 */
const TEST_QUERIES = [
  "what is SEO and how does it work",
  "jak działa sztuczna inteligencja",
  "best practices for website speed optimization",
  "co to jest kredyt hipoteczny",
  "how to improve website visibility in AI search",
];

/** CSS selectors for AI Overview block — ordered by specificity */
const CLASS_SELECTORS = [
  ".YzCcne",
  ".M8OgIe",
  ".YzVZnd",
  ".kno-result",
  "[data-attrid='SGE']",
  "div[jsname='yEVEwb']",
  ".AIOverview",
  ".ai-overview",
];

/** Minimum cited links to consider an AI Overview "valid" */
const MIN_CITED_LINKS = 2;

/** Minimum success rate to consider selectors "healthy" (1 out of 5 = 20%) */
const MIN_SUCCESS_RATE = 0.2;

/** Timeout per query in ms */
const QUERY_TIMEOUT_MS = 35_000;

// ─── Core Test Function ───────────────────────────────────────────────────────

async function testSingleQuery(
  page: Awaited<ReturnType<typeof puppeteer.launch>> extends { newPage(): Promise<infer P> } ? P : never,
  query: string
): Promise<SelectorTestResult> {
  const start = Date.now();

  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&gl=us`;
    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: QUERY_TIMEOUT_MS });
    await new Promise((r) => setTimeout(r, 3500));

    const result = await page.evaluate((classSelectors: string[], minLinks: number) => {
      let el: Element | null = null;
      let selectorUsed: string | null = null;
      let strategyUsed: "class_selector" | "heading_search" | "aria_label" | "none" = "none";

      // Strategy 1: class/attribute selectors
      for (const sel of classSelectors) {
        try {
          const found = document.querySelector(sel);
          if (found && (found.textContent?.length ?? 0) > 100) {
            el = found;
            selectorUsed = sel;
            strategyUsed = "class_selector";
            break;
          }
        } catch {}
      }

      // Strategy 2: heading text search
      if (!el) {
        const headings = Array.from(document.querySelectorAll("h1, h2, h3, [role='heading']"));
        for (const h of headings) {
          const txt = h.textContent?.trim() ?? "";
          if (txt === "AI Overview" || txt.startsWith("AI Overview") || txt === "Przegląd od AI") {
            let parent = h.parentElement;
            for (let i = 0; i < 5 && parent; i++) {
              if (parent.querySelectorAll("a[href]").length >= minLinks) {
                el = parent;
                strategyUsed = "heading_search";
                break;
              }
              parent = parent.parentElement;
            }
            if (el) break;
          }
        }
      }

      // Strategy 3: aria-label / data-ved fallback
      if (!el) {
        const candidates = Array.from(document.querySelectorAll("[aria-label*='AI'], [data-ved]"));
        for (const c of candidates) {
          const txt = c.textContent?.trim() ?? "";
          if (
            (txt.includes("AI Overview") || txt.includes("Przegląd od AI")) &&
            c.querySelectorAll("a[href]").length >= minLinks
          ) {
            el = c;
            strategyUsed = "aria_label";
            break;
          }
        }
      }

      if (!el) {
        return { hasAIOverview: false, citedLinksCount: 0, selectorUsed: null, strategyUsed: "none" as const };
      }

      const links = Array.from(el.querySelectorAll("a[href]")).filter((a) => {
        const href = (a as HTMLAnchorElement).href;
        if (!href.startsWith("http")) return false;
        try {
          const u = new URL(href);
          return !u.hostname.includes("google.com");
        } catch { return false; }
      });

      return {
        hasAIOverview: true,
        citedLinksCount: links.length,
        selectorUsed,
        strategyUsed,
      };
    }, CLASS_SELECTORS, MIN_CITED_LINKS);

    return {
      query,
      hasAIOverview: result.hasAIOverview && result.citedLinksCount >= MIN_CITED_LINKS,
      citedLinksCount: result.citedLinksCount,
      selectorUsed: result.selectorUsed,
      strategyUsed: result.strategyUsed,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      query,
      hasAIOverview: false,
      citedLinksCount: 0,
      selectorUsed: null,
      strategyUsed: "none",
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Main Health Check ────────────────────────────────────────────────────────

export async function runSelectorHealthCheck(): Promise<SelectorHealthReport> {
  const checkedAt = new Date();
  const results: SelectorTestResult[] = [];
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

  console.log("[SelectorHealth] Starting Google AI Overview selector health check...");

  try {
    browser = await puppeteer.launch({
      executablePath: "/usr/bin/chromium-browser",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-blink-features=AutomationControlled",
        "--lang=en-US",
      ],
      headless: true,
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });

    for (const query of TEST_QUERIES) {
      console.log(`[SelectorHealth] Testing query: "${query.slice(0, 50)}"`);
      const result = await testSingleQuery(page as Parameters<typeof testSingleQuery>[0], query);
      results.push(result);
      console.log(
        `[SelectorHealth] → hasAIOverview: ${result.hasAIOverview}, strategy: ${result.strategyUsed}, links: ${result.citedLinksCount}`
      );
      // Small delay between queries to avoid rate limiting
      await new Promise((r) => setTimeout(r, 2000));
    }
  } catch (err) {
    console.error("[SelectorHealth] Browser launch failed:", err);
    // Return a report indicating browser failure
    const errorReport: SelectorHealthReport = {
      checkedAt,
      overallHealthy: false,
      successCount: 0,
      totalTested: TEST_QUERIES.length,
      results: TEST_QUERIES.map((q) => ({
        query: q,
        hasAIOverview: false,
        citedLinksCount: 0,
        selectorUsed: null,
        strategyUsed: "none",
        durationMs: 0,
        error: "Browser launch failed: " + (err instanceof Error ? err.message : String(err)),
      })),
      selectorsLikelyBroken: false,
      likelyBlocked: false,
      alertSent: false,
      summary: "CRITICAL: Puppeteer browser failed to launch. Check Chromium installation.",
    };
    return errorReport;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  // ─── Analysis ───────────────────────────────────────────────────────────────

  const successCount = results.filter((r) => r.hasAIOverview).length;
  const errorCount = results.filter((r) => r.error).length;
  const successRate = successCount / TEST_QUERIES.length;

  // Selectors are broken if we get no AI Overviews but no errors (Google responded, just DOM changed)
  const selectorsLikelyBroken = successRate < MIN_SUCCESS_RATE && errorCount < TEST_QUERIES.length;

  // Likely blocked if most queries timed out or errored
  const likelyBlocked = errorCount >= Math.ceil(TEST_QUERIES.length * 0.6);

  const overallHealthy = successRate >= MIN_SUCCESS_RATE;

  // ─── Strategy breakdown for alert ───────────────────────────────────────────
  const strategyBreakdown = results.reduce(
    (acc, r) => {
      acc[r.strategyUsed] = (acc[r.strategyUsed] ?? 0) + (r.hasAIOverview ? 1 : 0);
      return acc;
    },
    {} as Record<string, number>
  );

  let summary: string;
  if (overallHealthy) {
    summary = `✅ Healthy: ${successCount}/${TEST_QUERIES.length} queries returned AI Overview. Strategies: ${JSON.stringify(strategyBreakdown)}`;
  } else if (likelyBlocked) {
    summary = `🚫 BLOCKED: ${errorCount}/${TEST_QUERIES.length} queries failed with errors. Google may be blocking our scraper. Check IP/User-Agent.`;
  } else if (selectorsLikelyBroken) {
    summary = `❌ SELECTORS BROKEN: ${successCount}/${TEST_QUERIES.length} queries found AI Overview. Google likely changed its DOM. Update CSS selectors in worker.ts.`;
  } else {
    summary = `⚠️ DEGRADED: ${successCount}/${TEST_QUERIES.length} queries returned AI Overview. May be temporary or partial DOM change.`;
  }

  console.log(`[SelectorHealth] ${summary}`);

  // ─── Alert ──────────────────────────────────────────────────────────────────
  let alertSent = false;
  if (!overallHealthy) {
    const alertTitle = selectorsLikelyBroken
      ? "🚨 GEO-Auditor: Google AI Overview selectors BROKEN"
      : likelyBlocked
        ? "🚨 GEO-Auditor: Google scraper BLOCKED"
        : "⚠️ GEO-Auditor: Google AI Overview detection degraded";

    const alertContent = [
      summary,
      "",
      "**Test Results:**",
      ...results.map(
        (r) =>
          `• "${r.query.slice(0, 50)}" → ${r.hasAIOverview ? "✅ Found" : "❌ Not found"} | Strategy: ${r.strategyUsed} | Links: ${r.citedLinksCount}${r.error ? ` | Error: ${r.error.slice(0, 100)}` : ""}`
      ),
      "",
      "**Action Required:**",
      selectorsLikelyBroken
        ? "Update CLASS_SELECTORS in server/citation/worker.ts. Inspect Google SERP DOM for new AI Overview container class names."
        : likelyBlocked
          ? "Check server IP reputation. Consider rotating User-Agent or adding residential proxy. Review Puppeteer launch args."
          : "Monitor for next 6h. If still degraded, inspect DOM changes.",
      "",
      `Checked at: ${checkedAt.toISOString()}`,
    ].join("\n");

    try {
      await notifyOwner({ title: alertTitle, content: alertContent });
      alertSent = true;
      console.log("[SelectorHealth] Alert sent to owner.");
    } catch (err) {
      console.error("[SelectorHealth] Failed to send alert:", err);
    }
  }

  return {
    checkedAt,
    overallHealthy,
    successCount,
    totalTested: TEST_QUERIES.length,
    results,
    selectorsLikelyBroken,
    likelyBlocked,
    alertSent,
    summary,
  };
}

// ─── Last Report Cache ────────────────────────────────────────────────────────

let lastHealthReport: SelectorHealthReport | null = null;

export function getLastHealthReport(): SelectorHealthReport | null {
  return lastHealthReport;
}

export async function runAndCacheHealthCheck(): Promise<SelectorHealthReport> {
  const report = await runSelectorHealthCheck();
  lastHealthReport = report;
  return report;
}
