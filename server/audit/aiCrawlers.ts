/**
 * AI Crawlers Module — v2 (iPullRank AI Search Manual aligned)
 *
 * Key upgrades based on iPullRank Chapters 7, 9, 11:
 *  - Added OAI-SearchBot (OpenAI's live search crawler, distinct from GPTBot training)
 *  - Added YouBot (You.com AI search)
 *  - Added Bytespider (ByteDance/TikTok AI)
 *  - Added PerplexityBot/PerplexityBot-User distinction
 *  - Improved robots.txt analysis: checks for path-specific blocks, not just full disallow
 *  - Added llms.txt detection (experimental — iPullRank Ch.11 notes it's not standard yet)
 *  - Added XML sitemap accessibility check
 */

import type { ScrapedPage } from "./scraper";
import type { AuditCheck, CategoryResult } from "./types";

interface CrawlerInfo {
  id: string;
  name: string;
  userAgent: string;
  engine: string;
  description: string;
  priority: "critical" | "high" | "medium";
}

const AI_CRAWLERS: CrawlerInfo[] = [
  {
    id: "gptbot",
    name: "GPTBot",
    userAgent: "GPTBot",
    engine: "ChatGPT / OpenAI (tylko trening)",
    description: "Crawler OpenAI używany wyłącznie do trenowania modeli GPT. Zablokowanie go uniemożliwia przyszłe trenowanie modeli GPT na Twojej treści, ale NIE wpływa na cytowania w ChatGPT Search — tym zajmuje się OAI-SearchBot.",
    priority: "medium",
  },
  {
    id: "oai_searchbot",
    name: "OAI-SearchBot",
    userAgent: "OAI-SearchBot",
    engine: "ChatGPT Search (na żywo)",
    description: "Crawler OpenAI do wyszukiwania w czasie rzeczywistym w ChatGPT Search. Odrębny od crawlera treningowego GPTBot.",
    priority: "critical",
  },
  {
    id: "perplexitybot",
    name: "PerplexityBot",
    userAgent: "PerplexityBot",
    engine: "Perplexity AI",
    description: "Crawler Perplexity do wyszukiwania w czasie rzeczywistym i generowania odpowiedzi AI.",
    priority: "critical",
  },
  {
    id: "claudebot",
    name: "ClaudeBot",
    userAgent: "ClaudeBot",
    engine: "Anthropic Claude",
    description: "Crawler Anthropic używany do trenowania modeli Claude AI i przeglądania stron.",
    priority: "high",
  },
  {
    id: "google_extended",
    name: "Google-Extended",
    userAgent: "Google-Extended",
    engine: "Google Gemini (trening, NIE AI Overviews)",
    description: "Token rezygnacji Google z trenowania modeli AI (Gemini, Vertex AI). Zablokowanie go uniemożliwia używanie Twojej treści do trenowania modeli Google AI, ale NIE wpływa na Google AI Overviews ani zwykłe wyniki wyszukiwania — te obsługuje Googlebot.",
    priority: "medium",
  },
  {
    id: "anthropic_ai",
    name: "anthropic-ai",
    userAgent: "anthropic-ai",
    engine: "Anthropic",
    description: "Dodatkowy identyfikator crawlera Anthropic.",
    priority: "high",
  },
  {
    id: "youbot",
    name: "YouBot",
    userAgent: "YouBot",
    engine: "You.com AI Search",
    description: "Crawler AI wyszukiwarki You.com do generatywnego wyszukiwania.",
    priority: "medium",
  },
  {
    id: "bytespider",
    name: "Bytespider",
    userAgent: "Bytespider",
    engine: "ByteDance / TikTok AI",
    description: "Crawler ByteDance używany do funkcji AI TikTok i produktów wyszukiwania.",
    priority: "medium",
  },
  {
    id: "cohere_ai",
    name: "cohere-ai",
    userAgent: "cohere-ai",
    engine: "Cohere",
    description: "Crawler AI Cohere do trenowania i wyszukiwania.",
    priority: "medium",
  },
];

/**
 * Check if a specific crawler is blocked in robots.txt.
 * Handles: full disallow (/), wildcard (*), and path-specific blocks.
 * Returns: 'full' | 'partial' | 'none'
 */
function getCrawlerBlockStatus(robotsTxt: string, userAgent: string): "full" | "partial" | "none" {
  const lines = robotsTxt.split("\n").map((l) => l.trim());
  let inRelevantBlock = false;
  let inAllBlock = false;
  let fullBlock = false;
  let partialBlock = false;

  for (const line of lines) {
    if (line.toLowerCase().startsWith("user-agent:")) {
      const ua = line.substring("user-agent:".length).trim();
      inRelevantBlock = ua.toLowerCase() === userAgent.toLowerCase();
      inAllBlock = ua === "*";
    }

    if ((inRelevantBlock || inAllBlock) && line.toLowerCase().startsWith("disallow:")) {
      const path = line.substring("disallow:".length).trim();
      if (path === "/" || path === "*") {
        fullBlock = true;
      } else if (path.length > 0) {
        partialBlock = true;
      }
    }
  }

  if (fullBlock) return "full";
  if (partialBlock) return "partial";
  return "none";
}

export function analyzeAICrawlers(page: ScrapedPage): CategoryResult & {
  crawlerStatuses: Array<{
    crawler: CrawlerInfo;
    blocked: boolean;
    partiallyBlocked: boolean;
    robotsTxtMissing: boolean;
  }>;
} {
  const checks: AuditCheck[] = [];
  const crawlerStatuses: Array<{
    crawler: CrawlerInfo;
    blocked: boolean;
    partiallyBlocked: boolean;
    robotsTxtMissing: boolean;
  }> = [];

  const robotsTxtMissing = page.robotsTxt === null;

  for (const crawler of AI_CRAWLERS) {
    const blockStatus = robotsTxtMissing
      ? "none"
      : getCrawlerBlockStatus(page.robotsTxt!, crawler.userAgent);

    const blocked = blockStatus === "full";
    const partiallyBlocked = blockStatus === "partial";

    crawlerStatuses.push({ crawler, blocked, partiallyBlocked, robotsTxtMissing });

    checks.push({
      id: crawler.id,
      label: `${crawler.name} (${crawler.engine})`,
      status: blocked ? "fail" : partiallyBlocked ? "warning" : "pass",
      description: blocked
        ? `${crawler.name} jest całkowicie zablokowany w robots.txt (Disallow: /). Twoja treść jest całkowicie niewidoczna dla ${crawler.engine}.`
        : partiallyBlocked
        ? `${crawler.name} ma częściowe ograniczenia w robots.txt. Niektóre sekcje Twojej strony są zablokowane dla ${crawler.engine}.`
        : robotsTxtMissing
        ? `Nie znaleziono robots.txt — dostęp ${crawler.name} jest domyślnie nieograniczony.`
        : `${crawler.name} ma pełny dostęp do indeksowania Twojej treści dla ${crawler.engine}.`,
      impact: crawler.priority === "critical" ? "high" : crawler.priority === "high" ? "medium" : "low",
      value: !blocked,
    });
  }

  // ── Overall AI crawler accessibility ──────────────────────────────────────
  const criticalCrawlers = crawlerStatuses.filter(s => s.crawler.priority === "critical");
  const blockedCritical = criticalCrawlers.filter((s) => s.blocked).length;
  const blockedTotal = crawlerStatuses.filter((s) => s.blocked).length;

  checks.push({
    id: "all_ai_crawlers",
    label: "Dostęp wszystkich głównych crawlerów AI",
    status:
      blockedCritical > 0
        ? "fail"
        : blockedTotal > 0
        ? "warning"
        : "pass",
    description:
      blockedCritical > 0
        ? `${blockedCritical} krytycz${blockedCritical > 1 ? "ne crawlery AI są zablokowane" : "ny crawler AI jest zablokowany"} (GPTBot, OAI-SearchBot, PerplexityBot lub Google-Extended). Poważnie ogranicza to widoczność w wyszukiwarkach AI.`
        : blockedTotal > 0
        ? `${blockedTotal} drugorzędn${blockedTotal > 1 ? "e crawlery AI są zablokowane" : "y crawler AI jest zablokowany"}. Rozważ zezwolenie na dostęp, aby zmaksymalizować widoczność w AI Search.`
        : "Wszystkie główne crawlery AI mają dostęp do Twojej treści.",
    impact: "high",
    value: blockedTotal === 0,
  });

  // ── llms.txt detection (iPullRank Ch.11 — experimental, not yet standard) ──
  const hasLlmsTxt = page.robotsTxt !== null
    ? /llms\.txt/i.test(page.robotsTxt)
    : false;

  const llmsTxtInHtml = /llms\.txt/i.test(page.html ?? "");

  checks.push({
    id: "llms_txt",
    label: "Plik llms.txt (eksperymentalny)",
    status: hasLlmsTxt || llmsTxtInHtml ? "pass" : "info",
    description: hasLlmsTxt || llmsTxtInHtml
      ? "Wykryto odwołanie do llms.txt. Uwaga: to eksperymentalny standard, jeszcze nie powszechnie stosowany przez główne systemy AI (wg iPullRank AI Search Manual rozdz. 11). Skup się na robots.txt i danych strukturalnych jako głównych sygnałach."
      : "Nie wykryto pliku llms.txt. To eksperymentalna dyrektywa AI, jeszcze niestandardowa ani szeroko stosowana przez główne systemy AI. Robots.txt i dane strukturalne mają większy wpływ.",
    impact: "low",
    value: hasLlmsTxt || llmsTxtInHtml,
  });

  // ── XML Sitemap accessibility ──────────────────────────────────────────────
  const hasSitemapInRobots = page.robotsTxt
    ? /^sitemap:/im.test(page.robotsTxt)
    : false;

  checks.push({
    id: "sitemap_for_crawlers",
    label: "Mapa strony dostępna dla crawlerów AI",
    status: hasSitemapInRobots ? "pass" : page.robotsTxt !== null ? "warning" : "info",
    description: hasSitemapInRobots
      ? "URL mapy strony zadeklarowany w robots.txt — crawlery AI mogą odkryć wszystkie indeksowalne podstrony."
      : page.robotsTxt !== null
      ? "Plik robots.txt istnieje, ale nie znaleziono dyrektywy Sitemap. Dodaj 'Sitemap: https://twojadomena.pl/sitemap.xml', aby pomóc crawlerom AI odkryć całą zawartość."
      : "Brak robots.txt, więc brak dyrektywy Sitemap. Dodaj robots.txt z odwołaniem do mapy strony, aby crawlery AI mogły indeksować całą witrynę.",
    impact: "medium",
    value: hasSitemapInRobots,
  });

  const score = computeScore(crawlerStatuses, blockedCritical, blockedTotal);

  return {
    score,
    maxScore: 100,
    checks,
    crawlerStatuses,
    summary: buildSummary(score, blockedCritical, blockedTotal, robotsTxtMissing),
  };
}

function computeScore(
  crawlerStatuses: Array<{ crawler: CrawlerInfo; blocked: boolean; partiallyBlocked: boolean }>,
  blockedCritical: number,
  blockedTotal: number
): number {
  const criticalPenalty = blockedCritical * 25;
  const nonCriticalBlocked = blockedTotal - blockedCritical;
  const nonCriticalPenalty = nonCriticalBlocked * 10;
  return Math.max(0, Math.min(100, 100 - criticalPenalty - nonCriticalPenalty));
}

function buildSummary(
  score: number,
  blockedCritical: number,
  blockedTotal: number,
  robotsTxtMissing: boolean
): string {
  if (robotsTxtMissing)
    return "Nie znaleziono robots.txt — crawlery AI mają domyślnie nieograniczony dostęp. Dodaj robots.txt z dyrektywą Sitemap.";
  if (blockedCritical > 0)
    return `${blockedCritical} krytycz${blockedCritical > 1 ? "ne crawlery AI są zablokowane" : "ny crawler AI jest zablokowany"} — Twoja treść jest niewidoczna dla tych silników AI. Usuń Disallow: / dla GPTBot, OAI-SearchBot, PerplexityBot i Google-Extended.`;
  if (blockedTotal > 0)
    return `${blockedTotal} drugorzędn${blockedTotal > 1 ? "e crawlery AI są zablokowane" : "y crawler AI jest zablokowany"}. Wszystkie krytyczne crawlery (GPTBot, OAI-SearchBot, PerplexityBot, Google-Extended) mają dostęp.`;
  return "Wszystkie główne crawlery AI (GPTBot, OAI-SearchBot, PerplexityBot, ClaudeBot, Google-Extended) mają pełny dostęp.";
}
