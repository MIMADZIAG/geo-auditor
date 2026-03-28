/**
 * AI Crawlers Module — v3
 *
 * Precyzyjna interpretacja robots.txt: zamiast flagować każde częściowe
 * wykluczenie jako problem (co wprowadza użytkownika w błąd), wykonujemy
 * 3 konkretne, wartościowe sprawdzenia:
 *
 * 1. AUDYTOWANA PODSTRONA — czy konkretny URL jest zablokowany dla jakiegokolwiek
 *    bota AI search (pełny blok lub path-specific blok obejmujący ten URL)?
 *
 * 2. PEŁNY BLOK AI SEARCH — czy któryś z botów AI search (PerplexityBot,
 *    OAI-SearchBot, Googlebot) ma Disallow: / (całkowity zakaz)?
 *
 * 3. BOTY TRENINGOWE — czy boty treningowe AI (GPTBot, Google-Extended,
 *    ClaudeBot, anthropic-ai, CCBot) mają Disallow: /? To jest ŚWIADOMA
 *    decyzja właściciela — informujemy, nie alarmujemy.
 *
 * Częściowe wykluczenia (np. /admin/, /cart/, /search/) są NORMALNE i POŻĄDANE
 * — nie są pokazywane jako problemy.
 */

import type { ScrapedPage } from "./scraper";
import type { AuditCheck, CategoryResult } from "./types";

// ─── Crawler classification ───────────────────────────────────────────────────

/** Boty używane do WYSZUKIWANIA w czasie rzeczywistym (AI Search) */
const AI_SEARCH_BOTS = [
  { ua: "PerplexityBot", name: "Perplexity AI" },
  { ua: "OAI-SearchBot", name: "ChatGPT Search" },
  { ua: "Googlebot", name: "Google (AI Overviews)" },
  { ua: "Bingbot", name: "Bing / Copilot" },
  { ua: "YouBot", name: "You.com AI Search" },
];

/** Boty używane WYŁĄCZNIE do trenowania modeli AI */
const AI_TRAINING_BOTS = [
  { ua: "GPTBot", name: "OpenAI (trening GPT)" },
  { ua: "Google-Extended", name: "Google (trening Gemini)" },
  { ua: "ClaudeBot", name: "Anthropic Claude" },
  { ua: "anthropic-ai", name: "Anthropic" },
  { ua: "CCBot", name: "Common Crawl" },
  { ua: "Bytespider", name: "ByteDance / TikTok AI" },
  { ua: "cohere-ai", name: "Cohere AI" },
];

// ─── Core parsing logic ───────────────────────────────────────────────────────

/**
 * Represents a single User-agent block in robots.txt with its disallow rules.
 */
interface RobotsBlock {
  userAgents: string[];
  disallowPaths: string[];
  isFullBlock: boolean; // has Disallow: /
}

/**
 * Parse robots.txt into structured blocks.
 * Handles multiple User-agent lines per block and comment stripping.
 */
function parseRobotsTxt(robotsTxt: string): RobotsBlock[] {
  const blocks: RobotsBlock[] = [];
  let currentBlock: RobotsBlock | null = null;

  for (const rawLine of robotsTxt.split("\n")) {
    const line = rawLine.split("#")[0].trim(); // strip inline comments
    if (!line) {
      // Empty line = end of block
      if (currentBlock && currentBlock.userAgents.length > 0) {
        blocks.push(currentBlock);
        currentBlock = null;
      }
      continue;
    }

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const directive = line.substring(0, colonIdx).trim().toLowerCase();
    const value = line.substring(colonIdx + 1).trim();

    if (directive === "user-agent") {
      if (!currentBlock) {
        currentBlock = { userAgents: [], disallowPaths: [], isFullBlock: false };
      }
      currentBlock.userAgents.push(value.toLowerCase());
    } else if (directive === "disallow" && currentBlock) {
      if (value === "/" || value === "*") {
        currentBlock.isFullBlock = true;
      } else if (value.length > 0) {
        currentBlock.disallowPaths.push(value);
      }
      // Disallow: (empty) = allow all — intentionally ignored
    }
  }

  // Flush last block if file doesn't end with blank line
  if (currentBlock && currentBlock.userAgents.length > 0) {
    blocks.push(currentBlock);
  }

  return blocks;
}

/**
 * Find all blocks that apply to a given User-Agent string.
 * Matches both exact UA and wildcard (*).
 */
function getApplicableBlocks(blocks: RobotsBlock[], userAgent: string): RobotsBlock[] {
  const uaLower = userAgent.toLowerCase();
  return blocks.filter(
    (b) => b.userAgents.includes(uaLower) || b.userAgents.includes("*")
  );
}

/**
 * Check if a specific path is disallowed for a given User-Agent.
 * Uses longest-match prefix rule (standard robots.txt spec).
 */
function isPathDisallowed(blocks: RobotsBlock[], userAgent: string, urlPath: string): boolean {
  const applicable = getApplicableBlocks(blocks, userAgent);
  for (const block of applicable) {
    if (block.isFullBlock) return true;
    for (const disallowedPath of block.disallowPaths) {
      if (urlPath.startsWith(disallowedPath)) return true;
    }
  }
  return false;
}

/**
 * Check if a bot has a FULL block (Disallow: /) — not just partial exclusions.
 */
function hasTotalBlock(blocks: RobotsBlock[], userAgent: string): boolean {
  const applicable = getApplicableBlocks(blocks, userAgent);
  return applicable.some((b) => b.isFullBlock);
}

/**
 * Extract the path component from a URL string.
 * Returns "/" for invalid URLs.
 */
function extractPath(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return "/";
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function analyzeAICrawlers(page: ScrapedPage): CategoryResult & {
  crawlerStatuses: Array<{
    crawler: { id: string; name: string; userAgent: string; engine: string; priority: string };
    blocked: boolean;
    partiallyBlocked: boolean;
    robotsTxtMissing: boolean;
  }>;
} {
  const checks: AuditCheck[] = [];
  const robotsTxtMissing = page.robotsTxt === null;

  // Parse once, reuse
  const blocks = robotsTxtMissing ? [] : parseRobotsTxt(page.robotsTxt!);
  const auditedPath = page.url ? extractPath(page.url) : "/";

  // ── Check 1: Is the audited URL blocked for AI search bots? ─────────────────
  const blockedSearchBots = robotsTxtMissing
    ? []
    : AI_SEARCH_BOTS.filter((bot) => isPathDisallowed(blocks, bot.ua, auditedPath));

  const auditedUrlBlocked = blockedSearchBots.length > 0;

  checks.push({
    id: "audited_url_access",
    label: "Dostęp do audytowanej podstrony",
    status: auditedUrlBlocked ? "fail" : "pass",
    description: auditedUrlBlocked
      ? `Audytowana podstrona (${auditedPath}) jest zablokowana dla: ${blockedSearchBots.map((b) => b.name).join(", ")}. Crawlery AI nie mogą jej indeksować — to bezpośrednio blokuje cytowania.`
      : robotsTxtMissing
      ? "Brak robots.txt — dostęp do podstrony jest domyślnie nieograniczony dla wszystkich crawlerów."
      : `Audytowana podstrona (${auditedPath}) jest dostępna dla wszystkich głównych crawlerów AI Search.`,
    impact: "high",
    value: !auditedUrlBlocked,
  });

  // ── Check 2: Full block on AI search bots (Disallow: /) ─────────────────────
  const fullyBlockedSearchBots = robotsTxtMissing
    ? []
    : AI_SEARCH_BOTS.filter((bot) => hasTotalBlock(blocks, bot.ua));

  const hasFullSearchBlock = fullyBlockedSearchBots.length > 0;

  checks.push({
    id: "ai_search_full_block",
    label: "Dostęp crawlerów AI Search",
    status: hasFullSearchBlock ? "fail" : "pass",
    description: hasFullSearchBlock
      ? `Całkowity zakaz dostępu (Disallow: /) dla: ${fullyBlockedSearchBots.map((b) => b.name).join(", ")}. Te silniki AI nie mogą indeksować żadnej strony w Twojej domenie.`
      : robotsTxtMissing
      ? "Brak robots.txt — crawlery AI Search mają domyślnie pełny dostęp."
      : "Żaden crawler AI Search nie ma całkowitego zakazu dostępu. Częściowe wykluczenia (np. /admin/, /cart/) są normalne i nie wpływają na widoczność treści.",
    impact: "high",
    value: !hasFullSearchBlock,
  });

  // ── Check 3: Training bots — informational only ──────────────────────────────
  const fullyBlockedTrainingBots = robotsTxtMissing
    ? []
    : AI_TRAINING_BOTS.filter((bot) => hasTotalBlock(blocks, bot.ua));

  const hasTrainingBlock = fullyBlockedTrainingBots.length > 0;

  // Training bot blocks are a CONSCIOUS decision — show as info, not warning/fail
  checks.push({
    id: "ai_training_bots",
    label: "Boty treningowe AI",
    status: "info",
    description: hasTrainingBlock
      ? `Zablokowane boty treningowe: ${fullyBlockedTrainingBots.map((b) => b.name).join(", ")}. To świadoma decyzja — blokowanie botów treningowych NIE wpływa na cytowania w AI Search (wyszukiwanie w czasie rzeczywistym). Dotyczy tylko przyszłego trenowania modeli AI na Twojej treści.`
      : robotsTxtMissing
      ? "Brak robots.txt — boty treningowe AI mają domyślnie dostęp do treści. Możesz je zablokować dyrektywą Disallow: / dla GPTBot, Google-Extended, ClaudeBot, jeśli nie chcesz, aby Twoja treść była używana do trenowania modeli AI."
      : "Boty treningowe AI mają dostęp do Twojej treści. Jeśli nie chcesz, aby była używana do trenowania modeli AI, możesz je zablokować — nie wpłynie to na cytowania w AI Search.",
    impact: "low",
    value: true, // always neutral — not a problem either way
  });

  // ── Check 4: Sitemap declaration ─────────────────────────────────────────────
  const hasSitemapInRobots = page.robotsTxt
    ? /^sitemap:/im.test(page.robotsTxt)
    : false;

  checks.push({
    id: "sitemap_for_crawlers",
    label: "Mapa strony w robots.txt",
    status: hasSitemapInRobots ? "pass" : page.robotsTxt !== null ? "warning" : "info",
    description: hasSitemapInRobots
      ? "URL mapy strony zadeklarowany w robots.txt — crawlery AI mogą odkryć wszystkie indeksowalne podstrony."
      : page.robotsTxt !== null
      ? "Plik robots.txt istnieje, ale nie zawiera dyrektywy Sitemap. Dodaj 'Sitemap: https://twojadomena.pl/sitemap.xml', aby pomóc crawlerom AI odkryć całą zawartość."
      : "Brak robots.txt — dodaj go z odwołaniem do mapy strony, aby crawlery AI mogły efektywnie indeksować witrynę.",
    impact: "medium",
    value: hasSitemapInRobots,
  });

  // ── Check 5: llms.txt (experimental) ─────────────────────────────────────────
  const hasLlmsTxt =
    (page.robotsTxt !== null && /llms\.txt/i.test(page.robotsTxt)) ||
    /llms\.txt/i.test(page.html ?? "");

  checks.push({
    id: "llms_txt",
    label: "Plik llms.txt (eksperymentalny)",
    status: hasLlmsTxt ? "pass" : "info",
    description: hasLlmsTxt
      ? "Wykryto odwołanie do llms.txt — eksperymentalny standard opisujący treść strony dla modeli językowych."
      : "Brak pliku llms.txt. To eksperymentalny standard, jeszcze nie stosowany przez główne systemy AI. Robots.txt i dane strukturalne mają znacznie większy wpływ na widoczność.",
    impact: "low",
    value: hasLlmsTxt,
  });

  // ── Score computation ─────────────────────────────────────────────────────────
  let score = 100;
  if (auditedUrlBlocked) score -= 40; // direct block on audited URL — critical
  if (hasFullSearchBlock) score -= 35; // full domain block for AI search — critical
  if (!hasSitemapInRobots && page.robotsTxt !== null) score -= 10;
  score = Math.max(0, Math.min(100, score));

  // ── crawlerStatuses (legacy shape — used by AICitationPanel engine badges) ───
  const crawlerStatuses = [
    ...AI_SEARCH_BOTS.map((bot) => ({
      crawler: { id: bot.ua.toLowerCase(), name: bot.ua, userAgent: bot.ua, engine: bot.name, priority: "critical" },
      blocked: robotsTxtMissing ? false : hasTotalBlock(blocks, bot.ua),
      partiallyBlocked: false, // no longer used for display
      robotsTxtMissing,
    })),
    ...AI_TRAINING_BOTS.map((bot) => ({
      crawler: { id: bot.ua.toLowerCase(), name: bot.ua, userAgent: bot.ua, engine: bot.name, priority: "medium" },
      blocked: robotsTxtMissing ? false : hasTotalBlock(blocks, bot.ua),
      partiallyBlocked: false,
      robotsTxtMissing,
    })),
  ];

  return {
    score,
    maxScore: 100,
    checks,
    crawlerStatuses,
    summary: buildSummary(score, auditedUrlBlocked, hasFullSearchBlock, robotsTxtMissing),
  };
}

function buildSummary(
  score: number,
  auditedUrlBlocked: boolean,
  hasFullSearchBlock: boolean,
  robotsTxtMissing: boolean
): string {
  if (robotsTxtMissing)
    return "Nie znaleziono robots.txt — crawlery AI mają domyślnie pełny dostęp. Rozważ dodanie robots.txt z dyrektywą Sitemap.";
  if (auditedUrlBlocked)
    return "Audytowana podstrona jest zablokowana dla crawlerów AI Search — bezpośrednio blokuje cytowania. Usuń Disallow dla tej ścieżki.";
  if (hasFullSearchBlock)
    return "Jeden lub więcej crawlerów AI Search ma całkowity zakaz dostępu (Disallow: /). Usuń blokadę, aby umożliwić indeksowanie.";
  return "Konfiguracja robots.txt jest prawidłowa. Crawlery AI Search mają dostęp do treści. Częściowe wykluczenia (admin, koszyk itp.) są normalne.";
}
