/**
 * Competitor Content Crawler
 * Crawls top-cited competitor URLs from AI Citations results,
 * extracts key fragments and entities for use in Full Rewrite AI prompts.
 */

import * as cheerio from "cheerio";

export interface CompetitorFragment {
  url: string;
  domain: string;
  title: string;
  /** Key paragraphs / sentences that carry factual value */
  keyFragments: string[];
  /** Named entities: numbers, dates, brand names, product names, technical terms */
  entities: string[];
  /** Word count of extracted content */
  wordCount: number;
}

export interface CrawlResult {
  competitors: CompetitorFragment[];
  /** Deduplicated entities across all competitors */
  allEntities: string[];
  /** Top factual fragments (best 8-12 across all competitors) */
  topFragments: string[];
  /** Domains successfully crawled */
  crawledDomains: string[];
  /** Domains that failed (timeout / blocked) */
  failedDomains: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return url; }
}

/**
 * Extract clean, meaningful text from HTML.
 * Removes scripts, nav, footer, ads, cookie banners, JSON-LD, inline styles.
 * Returns plain text paragraphs in reading order.
 */
function extractCleanText($: cheerio.CheerioAPI): string {
  // Remove noise
  $(
    "script, style, noscript, nav, footer, header, aside, " +
    "[role='navigation'], [role='banner'], [role='complementary'], " +
    ".cookie-banner, .popup, .modal, .ad, .advertisement, " +
    ".sidebar, .widget, .breadcrumb, .pagination, .social-share, " +
    "[class*='cookie'], [class*='gdpr'], [class*='banner'], [id*='cookie']"
  ).remove();

  const mainContent =
    $("main, article, [role='main'], .content, .post-content, .entry-content, #content, #main").first();
  const root = mainContent.length > 0 ? mainContent : $("body");

  const parts: string[] = [];
  root.find("h1, h2, h3, h4, p, li, blockquote, figcaption").each((_, el) => {
    const tag = (el as any).tagName?.toLowerCase() ?? "";
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!text || text.length < 20) return;
    // Skip navigation-like items (very short, no sentence structure)
    if (text.length < 40 && !text.includes(" ")) return;
    if (tag.startsWith("h")) parts.push(`[H] ${text}`);
    else parts.push(text);
  });

  return parts.join("\n").trim();
}

/**
 * Extract named entities and key data points from text.
 * Focuses on: numbers with units, years, percentages, quoted terms, capitalized multi-word phrases.
 */
function extractEntities(text: string): string[] {
  const entities = new Set<string>();

  // Numbers with units (e.g. "200 000 zł", "30%", "5 lat", "2025 rok")
  const numberPattern = /\b\d[\d\s]*(?:zł|PLN|%|proc\.|lat|roku?|metr[óo]w?|m²|km|kg|tys\.|mln|mld|tys)\b/gi;
  let nm: RegExpExecArray | null;
  while ((nm = numberPattern.exec(text)) !== null) entities.add(nm[0].trim());

  // Years
  const yearPattern = /\b(19|20)\d{2}\b/g;
  let ym: RegExpExecArray | null;
  while ((ym = yearPattern.exec(text)) !== null) entities.add(ym[0]);

  // Capitalized multi-word phrases (likely proper nouns / product names)
  const properNounPattern = /\b[A-ZŁŚŻŹĆŃÓĄĘ][a-złśżźćńóąę]+(?:\s+[A-ZŁŚŻŹĆŃÓĄĘ][a-złśżźćńóąę]+){1,3}\b/g;
  let pm: RegExpExecArray | null;
  while ((pm = properNounPattern.exec(text)) !== null) {
    if (pm[0].length > 6 && pm[0].length < 60) entities.add(pm[0]);
  }

  // Quoted terms (often technical or key concepts)
  const quotedPattern = /[\u201e\u201c\u201d]([^\u201e\u201c\u201d]{5,60})[\u201c\u201d]/g;
  let qm: RegExpExecArray | null;
  while ((qm = quotedPattern.exec(text)) !== null) entities.add(qm[1].trim());

  return Array.from(entities).slice(0, 30);
}

/**
 * Score a paragraph for factual value (higher = more useful for rewrite).
 * Criteria: contains numbers, specific terms, is not too short/long.
 */
function scoreParagraph(text: string): number {
  let score = 0;
  if (text.length > 80 && text.length < 600) score += 2;
  if (/\d/.test(text)) score += 3; // contains numbers
  if (/%|zł|PLN|proc\.|tys\.|mln/.test(text)) score += 2; // financial/quantitative
  if (/jak|dlaczego|kiedy|gdzie|co to|czym jest|polega|wymaga|warto/.test(text.toLowerCase())) score += 2; // informational
  if (text.includes("?")) score += 1; // question = good for FAQ
  if (text.split(" ").length > 15) score += 1; // substantial sentence
  return score;
}

/**
 * Crawl a single URL and extract competitor content.
 */
async function crawlSingleUrl(url: string, timeoutMs = 12000): Promise<CompetitorFragment | null> {
  const { default: axios } = await import("axios");

  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GEO-Auditor/1.0; +https://geoauditor.com/bot)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
      },
      timeout: timeoutMs,
      maxContentLength: 1.5 * 1024 * 1024,
      validateStatus: (s) => s < 400,
    });

    const html = typeof response.data === "string" ? response.data : String(response.data);
    const $ = cheerio.load(html);

    const title = $("title").text().trim() || $("h1").first().text().trim() || url;
    const domain = extractDomain(url);
    const fullText = extractCleanText($);

    if (!fullText || fullText.length < 100) return null;

    // Split into paragraphs and score them
    const paragraphs = fullText
      .split("\n")
      .map(p => p.replace(/^\[H\] /, "").trim())
      .filter(p => p.length > 40);

    const scored = paragraphs
      .map(p => ({ text: p, score: scoreParagraph(p) }))
      .sort((a, b) => b.score - a.score);

    // Take top 6 fragments (mix of high-scoring + first few for context)
    const topByScore = scored.slice(0, 4).map(s => s.text);
    const topByOrder = paragraphs.slice(0, 3);
    const keyFragments = Array.from(new Set([...topByOrder, ...topByScore])).slice(0, 7);

    const entities = extractEntities(fullText);
    const wordCount = fullText.split(/\s+/).length;

    return { url, domain, title, keyFragments, entities, wordCount };
  } catch (e) {
    console.warn(`[CompetitorCrawler] Failed to crawl ${url}:`, (e as Error).message);
    return null;
  }
}

/**
 * Crawl top competitor URLs from AI citation results.
 * Selects 3–10 URLs, skipping the target domain and known noise domains.
 * Returns structured competitor data for use in Full Rewrite prompts.
 */
export async function crawlCompetitors(
  citedUrls: string[],
  targetDomain: string,
  maxUrls = 6
): Promise<CrawlResult> {
  const BLOCKED_DOMAINS = [
    "google.com", "youtube.com", "wikipedia.org", "facebook.com",
    "twitter.com", "instagram.com", "linkedin.com", "reddit.com",
    "translate.google.com", "maps.google.com",
  ];

  // Filter: exclude target domain and blocked domains, deduplicate by domain
  const seenDomains = new Set<string>();
  const urlsToCheck: string[] = [];

  for (const url of citedUrls) {
    try {
      const domain = extractDomain(url);
      if (domain === targetDomain) continue;
      if (BLOCKED_DOMAINS.some(b => domain.includes(b))) continue;
      if (seenDomains.has(domain)) continue; // one URL per domain
      seenDomains.add(domain);
      urlsToCheck.push(url);
      if (urlsToCheck.length >= maxUrls) break;
    } catch { continue; }
  }

  if (urlsToCheck.length === 0) {
    return { competitors: [], allEntities: [], topFragments: [], crawledDomains: [], failedDomains: [] };
  }

  console.log(`[CompetitorCrawler] Crawling ${urlsToCheck.length} competitor URLs...`);

  // Crawl in parallel with concurrency limit of 3
  const results: (CompetitorFragment | null)[] = [];
  const failedDomains: string[] = [];

  for (let i = 0; i < urlsToCheck.length; i += 3) {
    const batch = urlsToCheck.slice(i, i + 3);
    const batchResults = await Promise.all(batch.map(url => crawlSingleUrl(url)));
    for (let j = 0; j < batch.length; j++) {
      if (batchResults[j]) {
        results.push(batchResults[j]);
      } else {
        failedDomains.push(extractDomain(batch[j]));
      }
    }
    // Small delay between batches
    if (i + 3 < urlsToCheck.length) await new Promise(r => setTimeout(r, 500));
  }

  const competitors = results.filter((r): r is CompetitorFragment => r !== null);
  const crawledDomains = competitors.map(c => c.domain);

  // Aggregate entities across all competitors (deduplicated)
  const allEntitiesSet = new Set<string>();
  for (const c of competitors) {
    for (const e of c.entities) allEntitiesSet.add(e);
  }
  const allEntities = Array.from(allEntitiesSet).slice(0, 40);

  // Select top fragments across all competitors (best 10 by score)
  const allFragmentsScored = competitors
    .flatMap(c => c.keyFragments.map(f => ({ text: f, score: scoreParagraph(f), domain: c.domain })))
    .sort((a, b) => b.score - a.score);

  // Deduplicate by similarity (simple: skip if >80% words overlap with already selected)
  const topFragments: string[] = [];
  for (const { text } of allFragmentsScored) {
    if (topFragments.length >= 10) break;
      const words = new Set(text.toLowerCase().split(/\s+/));
    const isDuplicate = topFragments.some(existing => {
      const existingWords = new Set(existing.toLowerCase().split(/\s+/));
      const intersection = Array.from(words).filter(w => existingWords.has(w)).length;
      return intersection / Math.max(words.size, existingWords.size) > 0.7;
    });
    if (!isDuplicate) topFragments.push(text);
  }

  console.log(`[CompetitorCrawler] Crawled ${competitors.length}/${urlsToCheck.length} URLs, ${allEntities.length} entities, ${topFragments.length} top fragments`);

  return { competitors, allEntities, topFragments, crawledDomains, failedDomains };
}

/**
 * Format competitor data for inclusion in LLM prompt.
 * Returns a concise, structured string that fits within token limits.
 */
export function formatCompetitorContext(crawlResult: CrawlResult): string {
  if (crawlResult.competitors.length === 0) return "";

  const lines: string[] = [
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "📊 ANALIZA KONKURENCJI (treści cytowane przez Google AI Overviews i ChatGPT):",
    "Poniższe fragmenty i dane pochodzą ze stron, które FAKTYCZNIE pojawiają się w AI Overviews.",
    "Użyj ich jako inspiracji — sparafrazuj kluczowe fakty, encje i struktury. NIE kopiuj dosłownie.",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "",
  ];

  for (const comp of crawlResult.competitors.slice(0, 5)) {
    lines.push(`🔗 Źródło: ${comp.domain} (${comp.title.slice(0, 80)})`);
    lines.push(`   Kluczowe fragmenty:`);
    for (const frag of comp.keyFragments.slice(0, 4)) {
      lines.push(`   • ${frag.slice(0, 300)}`);
    }
    lines.push("");
  }

  if (crawlResult.allEntities.length > 0) {
    lines.push(`📌 Kluczowe encje i dane z treści konkurencji (użyj jeśli pasują do tematu):`);
    lines.push(`   ${crawlResult.allEntities.slice(0, 20).join(" | ")}`);
    lines.push("");
  }

  return lines.join("\n");
}
