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
}

const FETCH_TIMEOUT_MS = 15000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; GEO-Auditor/1.0; +https://geo-auditor.manus.space)";

async function fetchWithTimeout(
  url: string,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      redirect: "follow",
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
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

  try {
    const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
    statusCode = res.status;
    finalUrl = res.url;
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    html = await res.text();
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
      error: `Failed to fetch page: ${msg}`,
    };
  }

  const $ = cheerio.load(html);
  title = $("title").first().text().trim();

  // Fetch robots.txt (best-effort, don't fail if unavailable)
  let robotsTxt: string | null = null;
  try {
    const robotsRes = await fetchWithTimeout(robotsTxtUrl, 5000);
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
  };
}
