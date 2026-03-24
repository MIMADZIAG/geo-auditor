import * as cheerio from "cheerio";
import puppeteer from "puppeteer-core";
import * as nodeHttps from "https";
import * as nodeHttp from "http";
import * as zlib from "zlib";

const CHROMIUM_PATH = process.env.CHROMIUM_PATH ?? "/usr/bin/chromium-browser";
const JS_FALLBACK_THRESHOLD = 500; // chars of visible text below which we try JS rendering

/**
 * Detect if a page is likely JS-rendered (SPA/React/Next.js) by checking
 * how much visible text is in the static HTML. If very little text is found,
 * the page probably relies on client-side JavaScript to render its content.
 */
function isLikelyJSRendered(html: string): boolean {
  const $ = cheerio.load(html);
  $("script, style, noscript, head").remove();
  const visibleText = $.text().replace(/\s+/g, " ").trim();
  return visibleText.length < JS_FALLBACK_THRESHOLD;
}

/**
 * Fetch a page using headless Chromium (Puppeteer) to handle JS-rendered content.
 * Used as a fallback when static HTML scraping yields insufficient content.
 * Waits for network to be idle (networkidle2) to ensure JS has executed.
 */
async function fetchWithPuppeteer(url: string): Promise<{ html: string; statusCode: number; finalUrl: string }> {
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROMIUM_PATH,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-sync",
        "--no-first-run",
        "--mute-audio",
      ],
      headless: true,
      timeout: 20000,
    });
    const page = await browser.newPage();
    // Set realistic browser headers
    await page.setExtraHTTPHeaders({
      "Accept-Language": "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7",
    });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );
    // Block images/fonts/media to speed up loading
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const type = req.resourceType();
      if (["image", "media", "font", "stylesheet"].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });
    let statusCode = 200;
    page.on("response", (response) => {
      if (response.url() === url || response.url() === url + "/") {
        statusCode = response.status();
      }
    });
    const response = await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 20000,
    });
    if (response) statusCode = response.status();
    // Wait a bit more for any lazy-loaded content
    await new Promise((r) => setTimeout(r, 1000));
    const html = await page.content();
    const finalUrl = page.url();
    return { html, statusCode, finalUrl };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

/**
 * Represents a fully scraped page ready for audit analysis.
 *
 * ⚠️  IMMUTABILITY CONTRACT for `page.$`:
 * The `$` property is a shared Cheerio instance used by ALL audit modules.
 * You MUST NOT call destructive operations (e.g. `.remove()`, `.empty()`, `.replaceWith()`)
 * directly on `page.$` — doing so will corrupt the DOM for every module that runs after yours.
 *
 * ✅ Safe pattern — create a fresh local copy:
 *   const $local = cheerio.load(page.html);
 *   $local("script, style, nav, footer, header").remove();
 *   // ... use $local safely
 *
 * ✅ Also safe — clone a subtree:
 *   const $body = page.$("body").clone();
 *   $body.find("script, style").remove();
 *   // ... use $body safely
 *
 * ❌ Never do this:
 *   const $ = page.$;
 *   $("header").remove(); // ← destroys header for ALL subsequent modules!
 */
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

/**
 * Fetch robots.txt using Node.js native https/http module instead of the built-in
 * fetch() API (undici). This is necessary because undici automatically injects
 * `sec-fetch-mode: cors` and uses a distinct TLS fingerprint that causes some
 * WAF-protected servers (e.g. nginx on totalmoney.pl) to return HTTP 449
 * ("Retry With"), which would incorrectly mark robots.txt as absent.
 *
 * The native https module sends a clean, minimal HTTP/1.1 request that passes
 * WAF checks and correctly retrieves robots.txt on all tested servers.
 * Handles gzip/deflate decompression transparently.
 */
async function fetchRobotsTxtNative(url: string, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (val: string | null) => {
      if (!settled) { settled = true; resolve(val); }
    };

    const parsed = new URL(url);
    const mod = parsed.protocol === "https:" ? nodeHttps : nodeHttp;
    const req = (mod as typeof nodeHttps).request(
      {
        hostname: parsed.hostname,
        port: parsed.port
          ? parseInt(parsed.port, 10)
          : parsed.protocol === "https:"
          ? 443
          : 80,
        path: parsed.pathname + (parsed.search ?? ""),
        method: "GET",
        headers: {
          "User-Agent": "GEO-Auditor/1.0 (+https://geo-auditor.app)",
          Accept: "text/plain, */*",
          "Accept-Encoding": "gzip, deflate",
        },
        timeout: timeoutMs,
      },
      (res) => {
        // Treat any non-2xx as "not found" (best-effort)
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          done(null);
          return;
        }
        const enc = (res.headers["content-encoding"] ?? "").toLowerCase();
        let stream: NodeJS.ReadableStream = res;
        if (enc === "gzip") stream = res.pipe(zlib.createGunzip());
        else if (enc === "deflate") stream = res.pipe(zlib.createInflate());
        else if (enc === "br") stream = res.pipe(zlib.createBrotliDecompress());

        const chunks: Buffer[] = [];
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", () => done(Buffer.concat(chunks).toString("utf-8")));
        stream.on("error", () => done(null));
      }
    );
    req.on("timeout", () => { req.destroy(); done(null); });
    req.on("error", () => done(null));
    req.end();
  });
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

  // JS-rendered fallback: if static HTML has very little visible text, try Puppeteer.
  // This handles SPA/React/Next.js pages where content is rendered client-side.
  let jsRendered = false;
  if (isLikelyJSRendered(html)) {
    try {
      console.log(`[Scraper] JS-rendered page detected for ${url} — using Puppeteer fallback`);
      const puppeteerResult = await fetchWithPuppeteer(url);
      if (puppeteerResult.html && !isLikelyJSRendered(puppeteerResult.html)) {
        html = puppeteerResult.html;
        statusCode = puppeteerResult.statusCode || statusCode;
        finalUrl = puppeteerResult.finalUrl || finalUrl;
        jsRendered = true;
        console.log(`[Scraper] Puppeteer fallback succeeded for ${url}`);
      }
    } catch (puppeteerErr) {
      console.warn(
        `[Scraper] Puppeteer fallback failed for ${url}:`,
        puppeteerErr instanceof Error ? puppeteerErr.message : puppeteerErr
      );
      // Non-fatal: continue with static HTML
    }
  }

  const $ = cheerio.load(html);
  title = $("title").first().text().trim();
  if (jsRendered) {
    console.log(`[Scraper] Using JS-rendered HTML for ${url} (title: ${title})`);
  }

  // Fetch robots.txt using native Node.js https module.
  // Reason: Node.js built-in fetch (undici) sends `sec-fetch-mode: cors` and has a
  // different TLS fingerprint that causes some WAFs (e.g. nginx on totalmoney.pl) to
  // respond with HTTP 449 (Retry With), making robots.txt appear absent even when it
  // exists. Using the native https module avoids this fingerprinting issue entirely.
  let robotsTxt: string | null = null;
  try {
    robotsTxt = await fetchRobotsTxtNative(robotsTxtUrl, 5000);
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
