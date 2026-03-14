/**
 * Competitor Content Crawler — v2
 *
 * Improvements over v1:
 *  1. BM25 chunking replaces 70% word-overlap deduplication
 *  2. Semantic triple extraction (Subject-Predicate-Object) via LLM
 *     replaces loose regex-based entity extraction
 */

import * as cheerio from "cheerio";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SemanticTriple {
  subject: string;
  predicate: string;
  object: string;
}

export interface CompetitorFragment {
  url: string;
  domain: string;
  title: string;
  /** Top BM25-ranked chunks relative to the input page content */
  keyFragments: string[];
  /** Semantic triples extracted by LLM from key fragments */
  triples: SemanticTriple[];
  /** Legacy entity list (kept for backward compat with formatCompetitorContext) */
  entities: string[];
  wordCount: number;
}

export interface CrawlResult {
  competitors: CompetitorFragment[];
  /** All semantic triples across competitors, deduplicated */
  allTriples: SemanticTriple[];
  /** Legacy flat entity list (kept for backward compat) */
  allEntities: string[];
  /** Top BM25-ranked fragments across all competitors */
  topFragments: string[];
  crawledDomains: string[];
  failedDomains: string[];
}

// ─── BM25 Implementation ───────────────────────────────────────────────────────

/**
 * Tokenise text into lowercase word tokens, removing Polish stop words.
 */
const STOP_WORDS = new Set([
  "i", "w", "z", "na", "do", "się", "że", "to", "jest", "nie", "jak",
  "ale", "po", "przez", "przy", "dla", "czy", "co", "tak", "już", "też",
  "być", "go", "jej", "jego", "ich", "je", "ten", "ta", "te", "tego",
  "tej", "tych", "tym", "temu", "który", "która", "które", "oraz", "więc",
  "a", "o", "e", "u", "by", "się", "ze", "we", "an", "the", "of", "in",
  "to", "and", "is", "for", "on", "are", "with", "as", "at", "be",
]);

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-ząćęłńóśźża-z0-9\s]/gi, " ")
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

/**
 * Split text into ~500-char chunks, preferring sentence/paragraph boundaries.
 */
function chunkText(text: string, maxChunkSize = 500): string[] {
  // First split by paragraph (double newline or heading markers)
  const paragraphs = text.split(/\n+/).map(p => p.replace(/^\[H\] /, "").trim()).filter(p => p.length > 20);

  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length + 1 <= maxChunkSize) {
      current = current ? `${current} ${para}` : para;
    } else {
      if (current) chunks.push(current);
      // If single paragraph > maxChunkSize, split by sentence
      if (para.length > maxChunkSize) {
        const sentences = para.match(/[^.!?]+[.!?]+/g) ?? [para];
        let sentBuf = "";
        for (const s of sentences) {
          if (sentBuf.length + s.length <= maxChunkSize) {
            sentBuf += s;
          } else {
            if (sentBuf) chunks.push(sentBuf.trim());
            sentBuf = s;
          }
        }
        if (sentBuf) chunks.push(sentBuf.trim());
        current = "";
      } else {
        current = para;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks.filter(c => c.length > 30);
}

/**
 * Compute BM25 scores for each competitor chunk against a query (the input page chunks).
 * Returns chunks sorted by descending BM25 score.
 *
 * BM25 formula: sum over query terms of IDF(t) * (tf * (k1+1)) / (tf + k1*(1-b+b*dl/avgdl))
 */
function bm25RankChunks(
  competitorChunks: string[],
  queryChunks: string[],
  k1 = 1.5,
  b = 0.75
): Array<{ text: string; score: number }> {
  if (competitorChunks.length === 0) return [];

  // Build query token set
  const queryTokens = queryChunks.flatMap(tokenise);
  const queryTermFreq: Map<string, number> = new Map();
  for (const t of queryTokens) queryTermFreq.set(t, (queryTermFreq.get(t) ?? 0) + 1);

  // Tokenise all competitor chunks
  const tokenisedChunks = competitorChunks.map(c => tokenise(c));
  const avgdl = tokenisedChunks.reduce((s, t) => s + t.length, 0) / tokenisedChunks.length;

  // IDF: how many competitor chunks contain each query term
  const idf: Map<string, number> = new Map();
  const N = tokenisedChunks.length;
  Array.from(queryTermFreq.keys()).forEach(term => {
    const df = tokenisedChunks.filter(tokens => tokens.includes(term)).length;
    idf.set(term, Math.log((N - df + 0.5) / (df + 0.5) + 1));
  });

  // Score each competitor chunk
  const scored = competitorChunks.map((chunk, i) => {
    const tokens = tokenisedChunks[i];
    const dl = tokens.length;
    const tfMap: Map<string, number> = new Map();
    for (const t of tokens) tfMap.set(t, (tfMap.get(t) ?? 0) + 1);

    let score = 0;
    Array.from(queryTermFreq.keys()).forEach(term => {
      const tf = tfMap.get(term) ?? 0;
      if (tf === 0) return;
      const idfVal = idf.get(term) ?? 0;
      score += idfVal * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl / avgdl));
    });
    return { text: chunk, score };
  });

  return scored.sort((a, b) => b.score - a.score);
}

// ─── Semantic Triple Extraction ────────────────────────────────────────────────

/**
 * Extract semantic triples (Subject-Predicate-Object) from text using LLM.
 * Uses gpt-4o-mini for cost efficiency (this is a lightweight extraction task).
 */
async function extractSemanticTriples(
  fragments: string[],
  domain: string
): Promise<SemanticTriple[]> {
  if (fragments.length === 0) return [];

  try {
    const { invokeLLM } = await import("../_core/llm");

    const fragmentText = fragments.slice(0, 5).map((f, i) => `[${i + 1}] ${f}`).join("\n\n");

    const result = await invokeLLM({
      model: "gpt-4.1",  // cheap auxiliary task — extraction only
      messages: [
        {
          role: "system",
          content:
            "You are a knowledge extraction system. Extract factual semantic triples from text. " +
            "Return ONLY a JSON array of objects with keys: subject, predicate, object. " +
            "Each triple must be a concrete, verifiable fact. Max 8 triples. " +
            "Use the same language as the input text (Polish if input is Polish).",
        },
        {
          role: "user",
          content:
            `Extract semantic triples from these fragments from ${domain}:\n\n${fragmentText}\n\n` +
            `Return JSON array only, no explanation. Example: [{"subject":"kredyt hipoteczny","predicate":"wymaga","object":"wkładu własnego 20%"}]`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 800,
    } as any);

    const raw = result.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));

    // Handle both {triples: [...]} and [...] formats
    const arr: unknown[] = Array.isArray(parsed) ? parsed : (parsed.triples ?? parsed.data ?? []);

    return arr
      .filter((t): t is SemanticTriple =>
        typeof t === "object" && t !== null &&
        typeof (t as any).subject === "string" &&
        typeof (t as any).predicate === "string" &&
        typeof (t as any).object === "string"
      )
      .slice(0, 8);
  } catch (e) {
    console.warn(`[CompetitorCrawler] Triple extraction failed for ${domain}:`, (e as Error).message);
    return [];
  }
}

// ─── HTML Text Extraction ──────────────────────────────────────────────────────

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return url; }
}

function extractCleanText($: cheerio.CheerioAPI): string {
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
    if (text.length < 40 && !text.includes(" ")) return;
    if (tag.startsWith("h")) parts.push(`[H] ${text}`);
    else parts.push(text);
  });

  return parts.join("\n").trim();
}

// Legacy entity extractor kept for backward compatibility
function extractEntities(text: string): string[] {
  const entities = new Set<string>();
  const numberPattern = /\b\d[\d\s]*(?:zł|PLN|%|proc\.|lat|roku?|metr[óo]w?|m²|km|kg|tys\.|mln|mld|tys)\b/gi;
  let nm: RegExpExecArray | null;
  while ((nm = numberPattern.exec(text)) !== null) entities.add(nm[0].trim());
  const yearPattern = /\b(19|20)\d{2}\b/g;
  let ym: RegExpExecArray | null;
  while ((ym = yearPattern.exec(text)) !== null) entities.add(ym[0]);
  return Array.from(entities).slice(0, 20);
}

// ─── Single URL Crawler ────────────────────────────────────────────────────────

async function crawlSingleUrl(
  url: string,
  inputPageChunks: string[],
  timeoutMs = 12000
): Promise<CompetitorFragment | null> {
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

    // ── Krok 1: BM25 chunking ──────────────────────────────────────────────────
    const competitorChunks = chunkText(fullText);
    const ranked = bm25RankChunks(competitorChunks, inputPageChunks);

    // Take top 7 BM25-ranked chunks (most relevant to the input page)
    const keyFragments = ranked.slice(0, 7).map(r => r.text);

    // ── Krok 2: Semantic triple extraction ────────────────────────────────────
    const triples = await extractSemanticTriples(keyFragments, domain);

    // Legacy entities for backward compat
    const entities = extractEntities(fullText);
    const wordCount = fullText.split(/\s+/).length;

    return { url, domain, title, keyFragments, triples, entities, wordCount };
  } catch (e) {
    console.warn(`[CompetitorCrawler] Failed to crawl ${url}:`, (e as Error).message);
    return null;
  }
}

// ─── Main Export ───────────────────────────────────────────────────────────────

/**
 * Crawl top competitor URLs from AI citation results.
 * Uses BM25 to rank competitor chunks against the input page content.
 * Extracts semantic triples for use as a Knowledge Graph in the rewrite prompt.
 */
export async function crawlCompetitors(
  citedUrls: string[],
  targetDomain: string,
  maxUrls = 6,
  inputPageContent = ""
): Promise<CrawlResult> {
  const BLOCKED_DOMAINS = [
    "google.com", "youtube.com", "wikipedia.org", "facebook.com",
    "twitter.com", "instagram.com", "linkedin.com", "reddit.com",
    "translate.google.com", "maps.google.com",
  ];

  const seenDomains = new Set<string>();
  const urlsToCheck: string[] = [];

  for (const url of citedUrls) {
    try {
      const domain = extractDomain(url);
      if (domain === targetDomain) continue;
      if (BLOCKED_DOMAINS.some(b => domain.includes(b))) continue;
      if (seenDomains.has(domain)) continue;
      seenDomains.add(domain);
      urlsToCheck.push(url);
      if (urlsToCheck.length >= maxUrls) break;
    } catch { continue; }
  }

  if (urlsToCheck.length === 0) {
    return { competitors: [], allTriples: [], allEntities: [], topFragments: [], crawledDomains: [], failedDomains: [] };
  }

  // Pre-chunk the input page content for BM25 comparison
  const inputPageChunks = inputPageContent ? chunkText(inputPageContent) : [];

  console.log(`[CompetitorCrawler] Crawling ${urlsToCheck.length} competitor URLs with BM25 ranking...`);

  const results: (CompetitorFragment | null)[] = [];
  const failedDomains: string[] = [];

  for (let i = 0; i < urlsToCheck.length; i += 3) {
    const batch = urlsToCheck.slice(i, i + 3);
    const batchResults = await Promise.all(
      batch.map(url => crawlSingleUrl(url, inputPageChunks))
    );
    for (let j = 0; j < batch.length; j++) {
      if (batchResults[j]) results.push(batchResults[j]);
      else failedDomains.push(extractDomain(batch[j]));
    }
    if (i + 3 < urlsToCheck.length) await new Promise(r => setTimeout(r, 500));
  }

  const competitors = results.filter((r): r is CompetitorFragment => r !== null);
  const crawledDomains = competitors.map(c => c.domain);

  // Aggregate all triples (deduplicated by subject+predicate)
  const triplesSeen = new Set<string>();
  const allTriples: SemanticTriple[] = [];
  for (const c of competitors) {
    for (const t of c.triples) {
      const key = `${t.subject}|${t.predicate}`;
      if (!triplesSeen.has(key)) {
        triplesSeen.add(key);
        allTriples.push(t);
      }
    }
  }

  // Legacy entities
  const allEntitiesSet = new Set<string>();
  for (const c of competitors) {
    for (const e of c.entities) allEntitiesSet.add(e);
  }
  const allEntities = Array.from(allEntitiesSet).slice(0, 40);

  // Global BM25 re-ranking across all competitor fragments
  const allChunks = competitors.flatMap(c => c.keyFragments);
  const globalRanked = bm25RankChunks(allChunks, inputPageChunks);

  // Deduplicate by exact text match, keep top 10
  const seenTexts = new Set<string>();
  const topFragments: string[] = [];
  for (const { text } of globalRanked) {
    if (topFragments.length >= 10) break;
    if (!seenTexts.has(text)) {
      seenTexts.add(text);
      topFragments.push(text);
    }
  }

  console.log(
    `[CompetitorCrawler] Done: ${competitors.length}/${urlsToCheck.length} crawled, ` +
    `${allTriples.length} triples, ${topFragments.length} BM25 top fragments`
  );

  return { competitors, allTriples, allEntities, topFragments, crawledDomains, failedDomains };
}

/**
 * Format competitor data for inclusion in LLM prompt.
 * Now includes semantic triples as a Knowledge Graph section.
 */
export function formatCompetitorContext(crawlResult: CrawlResult): string {
  if (crawlResult.competitors.length === 0) return "";

  const lines: string[] = [
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "ANALIZA KONKURENCJI (treści cytowane przez Google AI Overviews i ChatGPT):",
    "Poniższe dane pochodzą ze stron, które FAKTYCZNIE pojawiają się w AI Overviews.",
    "Sparafrazuj kluczowe fakty i struktury. NIE kopiuj dosłownie.",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "",
  ];

  // Knowledge Graph section (semantic triples)
  if (crawlResult.allTriples.length > 0) {
    lines.push("KNOWLEDGE GRAPH KONKURENCJI (zweryfikowane fakty do wykorzystania):");
    for (const t of crawlResult.allTriples.slice(0, 15)) {
      lines.push(`  [${t.subject}] → ${t.predicate} → [${t.object}]`);
    }
    lines.push("");
  }

  // BM25-ranked fragments per competitor
  lines.push("KLUCZOWE FRAGMENTY (posortowane wg trafności BM25 do Twojej strony):");
  for (const comp of crawlResult.competitors.slice(0, 5)) {
    lines.push(`Zrodlo: ${comp.domain} — ${comp.title.slice(0, 80)}`);
    for (const frag of comp.keyFragments.slice(0, 3)) {
      lines.push(`  • ${frag.slice(0, 300)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
