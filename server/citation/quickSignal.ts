/**
 * Quick Signal — Instant First Signal (Layer 4)
 *
 * Fires a single Google AI Overview check against the most salient query
 * derived from the page title and H1. Designed to return in 2–4 seconds,
 * delivering the first emotional pain point before the full citation job
 * has even started.
 *
 * Design principles:
 *  - Stateless: no DB writes, no job creation — pure read + external API call.
 *  - Timeout-safe: hard 10-second wall clock limit; returns a "no-signal" result
 *    on timeout rather than blocking the caller.
 *  - Cache-aware: checks the citation cache before hitting SerpApi.
 *  - Non-blocking: caller fires this concurrently with startCheck; it does NOT
 *    replace the full job, only provides an early signal.
 *
 * @module quickSignal
 */

import * as cheerio from "cheerio";
import { getQueriesForUrl } from "./db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuickSignalResult {
  /** Whether the target URL (exact or domain) was found in Google AI Overview */
  isCited: boolean;
  /** "yes" = exact URL cited, "domain" = same domain cited, "no" = not cited */
  citationLevel: "yes" | "domain" | "no";
  /** The query that was used for the check */
  queryUsed: string;
  /** Top competitor domain that appeared instead of the target (null if none) */
  topCompetitor: string | null;
  /** All competitor domains found in the AI Overview (max 5) */
  competitorDomains: string[];
  /** Whether Google returned an AI Overview at all for this query */
  hasAIOverview: boolean;
  /** Snippet of the AI Overview text (first 300 chars) */
  snippet: string | null;
  /** Whether this result came from the query cache (no API call made) */
  fromCache: boolean;
  /** Time taken in milliseconds */
  durationMs: number;
  /** Error message if the check failed gracefully */
  error?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Hard wall-clock timeout for the entire quick signal check */
const QUICK_SIGNAL_TIMEOUT_MS = 10_000;

/** Maximum length of the query sent to Google (prevents overly specific queries) */
const MAX_QUERY_LENGTH = 80;

/** Locale map — mirrors worker.ts LOCALE_MAP for consistency */
const LOCALE_MAP: Record<string, { hl: string; gl: string; location: string }> = {
  pl: { hl: "pl", gl: "pl", location: "Warsaw, Poland" },
  en: { hl: "en", gl: "us", location: "United States" },
  de: { hl: "de", gl: "de", location: "Berlin, Germany" },
  fr: { hl: "fr", gl: "fr", location: "Paris, France" },
  es: { hl: "es", gl: "es", location: "Madrid, Spain" },
  it: { hl: "it", gl: "it", location: "Rome, Italy" },
  nl: { hl: "nl", gl: "nl", location: "Amsterdam, Netherlands" },
  pt: { hl: "pt", gl: "pt", location: "Lisbon, Portugal" },
  cs: { hl: "cs", gl: "cz", location: "Prague, Czech Republic" },
  sk: { hl: "sk", gl: "sk", location: "Bratislava, Slovakia" },
  hu: { hl: "hu", gl: "hu", location: "Budapest, Hungary" },
  ro: { hl: "ro", gl: "ro", location: "Bucharest, Romania" },
  sv: { hl: "sv", gl: "se", location: "Stockholm, Sweden" },
  no: { hl: "no", gl: "no", location: "Oslo, Norway" },
  da: { hl: "da", gl: "dk", location: "Copenhagen, Denmark" },
  fi: { hl: "fi", gl: "fi", location: "Helsinki, Finland" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the best query candidate from the page.
 * Priority: H1 (most specific) → title tag (reliable) → URL-derived fallback.
 * Strips site name suffixes (e.g. "| Brand Name") and cleans whitespace.
 */
export function extractBestQuery(
  title: string,
  h1: string,
  url: string
): string {
  // H1 is the most semantically specific signal — use it if present and short enough
  const cleanH1 = h1.trim().replace(/\s+/g, " ");
  if (cleanH1.length >= 5 && cleanH1.length <= MAX_QUERY_LENGTH) {
    return cleanH1;
  }

  // Title tag — strip common suffix patterns: " | Brand", " - Brand", " :: Brand"
  const cleanTitle = title
    .trim()
    .replace(/\s*[\|–\-:]{1,2}\s*[^|–\-:]{1,40}$/, "")  // strip trailing "| Brand"
    .replace(/\s+/g, " ")
    .trim();

  if (cleanTitle.length >= 5 && cleanTitle.length <= MAX_QUERY_LENGTH) {
    return cleanTitle;
  }

  // URL-derived fallback: take the last non-empty path segment and humanize it
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      const lastSegment = segments[segments.length - 1];
      const humanized = lastSegment
        .replace(/[-_]/g, " ")
        .replace(/\.[a-z]{2,4}$/, "")  // strip file extension
        .trim();
      if (humanized.length >= 3) return humanized.slice(0, MAX_QUERY_LENGTH);
    }
  } catch { /* invalid URL — fall through */ }

  // Last resort: truncated title
  return (title || url).slice(0, MAX_QUERY_LENGTH);
}

/**
 * Detect language from minimal page signals.
 * Mirrors the logic in worker.ts extractPageContent for consistency.
 */
function detectLanguage(html: string, url: string): string {
  const TLD_LANG_MAP: Record<string, string> = {
    pl: "pl", de: "de", fr: "fr", es: "es", it: "it",
    nl: "nl", ru: "ru", pt: "pt", cs: "cs", sk: "sk",
    hu: "hu", ro: "ro", sv: "sv", no: "no", da: "da", fi: "fi",
  };
  const tldMatch = url.match(/\.([a-z]{2,3})(?:\/|\?|#|$)/i);
  const tldLang = tldMatch ? TLD_LANG_MAP[tldMatch[1].toLowerCase()] : undefined;
  const hasPolish = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(html.slice(0, 10_000));
  return tldLang ?? (hasPolish ? "pl" : "en");
}

/**
 * Fetch the page title and H1 with a short timeout.
 * Returns empty strings on failure — caller falls back to URL-derived query.
 */
async function fetchPageSignals(url: string): Promise<{ title: string; h1: string; language: string }> {
  try {
    const { default: axios } = await import("axios");
    const response = await axios.get<string>(url, {
      timeout: 6_000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GEOAuditor/4.0; +https://geoauditor.com)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "pl,en;q=0.9",
      },
      maxContentLength: 512 * 1024,  // 512 KB — enough for title/H1, avoids large downloads
      responseType: "text",
    });

    const html = typeof response.data === "string" ? response.data : String(response.data);
    const $ = cheerio.load(html);

    const title = $("title").first().text().trim();
    const h1 = $("h1").first().text().trim();
    const language = detectLanguage(html, url);

    return { title, h1, language };
  } catch (e) {
    console.warn("[QuickSignal] fetchPageSignals failed (non-fatal):", (e as Error).message);
    return { title: "", h1: "", language: "en" };
  }
}

/**
 * Check if a cached result exists for this URL + query combination.
 * Uses the same cache table as the full citation worker to avoid duplicate API calls.
 */
async function checkCache(
  url: string,
  query: string
): Promise<{ isCited: "yes" | "domain" | "no"; competitorDomains: string[] } | null> {
  try {
    const cached = await getQueriesForUrl(url);
    if (!cached) return null;

    // Look for an exact match on the query text in the cached results
    for (const [, results] of Object.entries(cached)) {
      if (!Array.isArray(results)) continue;
      for (const r of results as any[]) {
        if (
          r.query === query &&
          r.engine === "google" &&
          (r.isCited === "yes" || r.isCited === "domain" || r.isCited === "no")
        ) {
          return {
            isCited: r.isCited,
            competitorDomains: r.competitorDomains ?? [],
          };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Run a single Google AI Overview check via SerpApi.
 * Mirrors the logic in worker.ts checkGoogleAIOverview but is self-contained
 * to avoid coupling quickSignal to the full worker module.
 */
async function runGoogleCheck(
  query: string,
  targetUrl: string,
  language: string
): Promise<{
  isCited: "yes" | "domain" | "no";
  competitorDomains: string[];
  hasAIOverview: boolean;
  snippet: string | null;
}> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    console.warn("[QuickSignal] SERPAPI_API_KEY not configured — skipping Google check");
    return { isCited: "no", competitorDomains: [], hasAIOverview: false, snippet: null };
  }

  const { default: axios } = await import("axios");
  const locale = LOCALE_MAP[language] ?? LOCALE_MAP.en;
  const targetDomain = new URL(targetUrl).hostname.replace("www.", "");
  const targetPath = new URL(targetUrl).pathname.replace(/\/$/, "");

  const params = new URLSearchParams({
    q: query,
    engine: "google",
    api_key: apiKey,
    hl: locale.hl,
    gl: locale.gl,
    location: locale.location,
    device: "mobile",
    num: "10",
  });

  const response = await axios.get<any>(
    `https://serpapi.com/search.json?${params.toString()}`,
    { timeout: 25_000 }
  );

  const data = response.data;
  if (data.error) {
    console.warn(`[QuickSignal] SerpApi error: ${data.error}`);
    return { isCited: "no", competitorDomains: [], hasAIOverview: false, snippet: null };
  }

  let aiOverview = data.ai_overview;
  if (!aiOverview) {
    return { isCited: "no", competitorDomains: [], hasAIOverview: false, snippet: null };
  }

  // Handle deferred AI Overview (page_token)
  if (aiOverview.page_token && aiOverview.serpapi_link) {
    try {
      const deferredUrl = `${aiOverview.serpapi_link}&api_key=${apiKey}`;
      const deferredRes = await axios.get<any>(deferredUrl, { timeout: 20_000 });
      const deferredAO = deferredRes.data?.ai_overview;
      if (deferredAO?.text_blocks) {
        aiOverview = deferredAO;
      } else {
        return { isCited: "no", competitorDomains: [], hasAIOverview: true, snippet: null };
      }
    } catch {
      return { isCited: "no", competitorDomains: [], hasAIOverview: true, snippet: null };
    }
  }

  if (aiOverview.error && !aiOverview.text_blocks) {
    return { isCited: "no", competitorDomains: [], hasAIOverview: true, snippet: null };
  }

  // Extract cited URLs
  const allCitedUrls: string[] = [];
  for (const ref of aiOverview.references ?? []) {
    const rawLink = ref.link;
    if (!rawLink?.startsWith("http")) continue;
    let cleanUrl = rawLink.split("#:~:text=")[0].split("#")[0].replace(/\/$/, "");
    try {
      const h = new URL(cleanUrl).hostname;
      if (!h.includes("google.com") && !h.includes("translate.") && cleanUrl.length > 10) {
        if (!allCitedUrls.includes(cleanUrl)) allCitedUrls.push(cleanUrl);
      }
    } catch { /* skip invalid */ }
  }

  // Build snippet
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
  const overviewText = textParts.filter(Boolean).join(" ").slice(0, 300);

  // Competitor domains (exclude target)
  const competitorDomains = Array.from(
    new Set(
      allCitedUrls
        .map(u => { try { return new URL(u).hostname.replace("www.", ""); } catch { return ""; } })
        .filter(d => d && d !== targetDomain)
    )
  ).slice(0, 5);

  // Citation detection
  const exactCitation = allCitedUrls.find(u => {
    try {
      const cu = new URL(u);
      return cu.hostname.replace("www.", "") === targetDomain &&
             cu.pathname.replace(/\/$/, "") === targetPath;
    } catch { return false; }
  });
  if (exactCitation) {
    return { isCited: "yes", competitorDomains, hasAIOverview: true, snippet: overviewText || null };
  }

  const domainCitation = allCitedUrls.find(u => {
    try { return new URL(u).hostname.replace("www.", "") === targetDomain; }
    catch { return false; }
  });
  if (domainCitation) {
    return { isCited: "domain", competitorDomains, hasAIOverview: true, snippet: overviewText || null };
  }

  return { isCited: "no", competitorDomains, hasAIOverview: true, snippet: overviewText || null };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the Instant First Signal for a URL.
 *
 * Fires a single Google AI Overview check against the most salient query
 * derived from the page title/H1. Returns in 2–4 seconds under normal conditions.
 *
 * This function NEVER throws — it always returns a QuickSignalResult.
 * On timeout or error, it returns a result with error set and isCited=false.
 */
export async function getQuickSignal(url: string): Promise<QuickSignalResult> {
  const startTime = Date.now();

  const timeoutPromise = new Promise<QuickSignalResult>((resolve) =>
    setTimeout(() => {
      resolve({
        isCited: false,
        citationLevel: "no",
        queryUsed: url,
        topCompetitor: null,
        competitorDomains: [],
        hasAIOverview: false,
        snippet: null,
        fromCache: false,
        durationMs: Date.now() - startTime,
        error: "timeout",
      });
    }, QUICK_SIGNAL_TIMEOUT_MS)
  );

  const workPromise = (async (): Promise<QuickSignalResult> => {
    try {
      // Step 1: Fetch page signals (title, H1, language) — fast HEAD + minimal parse
      const { title, h1, language } = await fetchPageSignals(url);
      const query = extractBestQuery(title, h1, url);

      console.log(`[QuickSignal] URL: ${url} | query: "${query}" | lang: ${language}`);

      // Step 2: Check cache first — avoids SerpApi call if we already have data
      const cached = await checkCache(url, query);
      if (cached) {
        const topCompetitor = cached.competitorDomains[0] ?? null;
        console.log(`[QuickSignal] Cache hit for "${query}" — isCited: ${cached.isCited}`);
        return {
          isCited: cached.isCited !== "no",
          citationLevel: cached.isCited,
          queryUsed: query,
          topCompetitor,
          competitorDomains: cached.competitorDomains,
          hasAIOverview: true,
          snippet: null,
          fromCache: true,
          durationMs: Date.now() - startTime,
        };
      }

      // Step 3: Run the Google AI Overview check
      const result = await runGoogleCheck(query, url, language);
      const topCompetitor = result.competitorDomains[0] ?? null;

      console.log(
        `[QuickSignal] Done in ${Date.now() - startTime}ms — ` +
        `isCited: ${result.isCited} | hasAIOverview: ${result.hasAIOverview} | ` +
        `topCompetitor: ${topCompetitor ?? "none"}`
      );

      return {
        isCited: result.isCited !== "no",
        citationLevel: result.isCited,
        queryUsed: query,
        topCompetitor,
        competitorDomains: result.competitorDomains,
        hasAIOverview: result.hasAIOverview,
        snippet: result.snippet,
        fromCache: false,
        durationMs: Date.now() - startTime,
      };
    } catch (e) {
      const err = e as Error;
      console.warn("[QuickSignal] Unexpected error:", err.message);
      return {
        isCited: false,
        citationLevel: "no",
        queryUsed: url,
        topCompetitor: null,
        competitorDomains: [],
        hasAIOverview: false,
        snippet: null,
        fromCache: false,
        durationMs: Date.now() - startTime,
        error: err.message,
      };
    }
  })();

  return Promise.race([workPromise, timeoutPromise]);
}
