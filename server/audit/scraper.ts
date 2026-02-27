import * as cheerio from "cheerio";

export interface ScrapedPage {
  url: string;
  finalUrl: string;
  html: string;
  $: cheerio.CheerioAPI;
  statusCode: number;
  headers: Record<string, string>;
  robotsTxt: string | null;
  robotsTxtUrl: string;
  isHttps: boolean;
  responseTimeMs: number;
  title: string;
  error?: string;
  retryCount?: number;
}

const FETCH_TIMEOUT_MS = 15000;
const MAX_RETRIES = 3;

/**
 * Pool of realistic browser User-Agents to rotate per request.
 * This reduces the chance of bot-detection triggering transient errors (449, 403).
 */
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
];

function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * HTTP status codes that indicate a transient (retryable) error.
 * 449 — Microsoft "Retry With" (often used by CDNs and WAFs for temporary blocks)
 * 429 — Too Many Requests (rate limit, retry after backoff)
 * 500, 502, 503, 504 — Server-side transient errors
 */
const RETRYABLE_STATUS_CODES = new Set([429, 449, 500, 502, 503, 504]);

/**
 * Sleep for `ms` milliseconds, with optional random jitter.
 * Jitter prevents thundering herd when multiple audits retry simultaneously.
 */
function sleep(ms: number, jitterMs = 0): Promise<void> {
  const actual = ms + Math.floor(Math.random() * jitterMs);
  return new Promise((resolve) => setTimeout(resolve, actual));
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  userAgent: string
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": userAgent,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Upgrade-Insecure-Requests": "1",
      },
      redirect: "follow",
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a URL with automatic retry on transient errors.
 * Uses exponential backoff with jitter:
 *   Attempt 1: immediate
 *   Attempt 2: ~1s delay (500ms base + up to 500ms jitter)
 *   Attempt 3: ~2s delay (1500ms base + up to 500ms jitter)
 *
 * Each retry uses a different User-Agent to reduce bot-detection false positives.
 * Returns the last response (or throws) after all retries are exhausted.
 */
async function fetchWithRetry(
  url: string,
  timeoutMs: number
): Promise<{ response: Response; retryCount: number }> {
  let lastError: Error | null = null;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const userAgent = randomUserAgent();

    // Exponential backoff: 0ms, 500ms, 1500ms (with up to 500ms jitter each)
    if (attempt > 0) {
      const baseDelay = attempt === 1 ? 500 : 1500;
      await sleep(baseDelay, 500);
    }

    try {
      const response = await fetchWithTimeout(url, timeoutMs, userAgent);

      // If we got a retryable status code and have retries left, try again
      if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < MAX_RETRIES - 1) {
        console.warn(
          `[Scraper] Transient HTTP ${response.status} for ${url} — retrying (attempt ${attempt + 1}/${MAX_RETRIES})`
        );
        lastResponse = response;
        continue;
      }

      // Success or non-retryable status — return immediately
      return { response, retryCount: attempt };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Network errors (ECONNRESET, ETIMEDOUT, abort) are retryable
      if (attempt < MAX_RETRIES - 1) {
        console.warn(
          `[Scraper] Network error for ${url} — retrying (attempt ${attempt + 1}/${MAX_RETRIES}): ${lastError.message}`
        );
        continue;
      }
    }
  }

  // All retries exhausted
  if (lastError) throw lastError;

  // All retries got retryable status codes — return the last response
  return { response: lastResponse!, retryCount: MAX_RETRIES - 1 };
}

export async function scrapePage(inputUrl: string): Promise<ScrapedPage> {
  const start = Date.now();

  // Normalise URL
  let url = inputUrl.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }

  const parsed = new URL(url);
  const isHttps = parsed.protocol === "https:";
  const origin = parsed.origin;
  const robotsTxtUrl = `${origin}/robots.txt`;

  let html = "";
  let statusCode = 0;
  let headers: Record<string, string> = {};
  let finalUrl = url;
  let title = "";
  let retryCount = 0;

  try {
    const { response, retryCount: rc } = await fetchWithRetry(url, FETCH_TIMEOUT_MS);
    retryCount = rc;
    statusCode = response.status;
    finalUrl = response.url;
    response.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    html = await response.text();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      url,
      finalUrl: url,
      html: "",
      $: cheerio.load(""),
      statusCode: 0,
      headers: {},
      robotsTxt: null,
      robotsTxtUrl,
      isHttps,
      responseTimeMs: Date.now() - start,
      title: "",
      retryCount,
      error: `Failed to fetch page: ${msg}`,
    };
  }

  const $ = cheerio.load(html);
  title = $("title").first().text().trim();

  // Fetch robots.txt (best-effort, don't fail if unavailable)
  let robotsTxt: string | null = null;
  try {
    const robotsRes = await fetchWithTimeout(robotsTxtUrl, 5000, randomUserAgent());
    if (robotsRes.ok) {
      robotsTxt = await robotsRes.text();
    }
  } catch {
    // robots.txt not available — that's fine
  }

  return {
    url,
    finalUrl,
    html,
    $,
    statusCode,
    headers,
    robotsTxt,
    robotsTxtUrl,
    isHttps,
    responseTimeMs: Date.now() - start,
    title,
    retryCount,
  };
}
