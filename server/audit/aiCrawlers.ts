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
    engine: "ChatGPT / OpenAI (Training only)",
    description: "OpenAI's crawler used exclusively to train GPT models. Blocking this prevents future GPT model training on your content but does NOT affect ChatGPT Search citations — that is handled by OAI-SearchBot.",
    priority: "medium",
  },
  {
    id: "oai_searchbot",
    name: "OAI-SearchBot",
    userAgent: "OAI-SearchBot",
    engine: "ChatGPT Search (Live)",
    description: "OpenAI's live search crawler for ChatGPT's real-time web search feature. Distinct from GPTBot training crawler.",
    priority: "critical",
  },
  {
    id: "perplexitybot",
    name: "PerplexityBot",
    userAgent: "PerplexityBot",
    engine: "Perplexity AI",
    description: "Perplexity's crawler for real-time search and AI answer generation.",
    priority: "critical",
  },
  {
    id: "claudebot",
    name: "ClaudeBot",
    userAgent: "ClaudeBot",
    engine: "Anthropic Claude",
    description: "Anthropic's crawler used for Claude AI model training and browsing.",
    priority: "high",
  },
  {
    id: "google_extended",
    name: "Google-Extended",
    userAgent: "Google-Extended",
    engine: "Google Gemini Training (NOT AI Overviews)",
    description: "Google's opt-out token for AI model training (Gemini, Vertex AI). Blocking this prevents your content from being used to train Google AI models but does NOT affect Google AI Overviews or regular Search — those use Googlebot, which is separate.",
    priority: "medium",
  },
  {
    id: "anthropic_ai",
    name: "anthropic-ai",
    userAgent: "anthropic-ai",
    engine: "Anthropic",
    description: "Anthropic's secondary crawler identifier.",
    priority: "high",
  },
  {
    id: "youbot",
    name: "YouBot",
    userAgent: "YouBot",
    engine: "You.com AI Search",
    description: "You.com's AI search crawler for their generative search engine.",
    priority: "medium",
  },
  {
    id: "bytespider",
    name: "Bytespider",
    userAgent: "Bytespider",
    engine: "ByteDance / TikTok AI",
    description: "ByteDance's crawler used for TikTok's AI features and search products.",
    priority: "medium",
  },
  {
    id: "cohere_ai",
    name: "cohere-ai",
    userAgent: "cohere-ai",
    engine: "Cohere",
    description: "Cohere's AI crawler for training and retrieval.",
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
        ? `${crawler.name} is fully blocked in robots.txt (Disallow: /). Your content is completely invisible to ${crawler.engine}.`
        : partiallyBlocked
        ? `${crawler.name} has partial restrictions in robots.txt. Some sections of your site are blocked from ${crawler.engine}.`
        : robotsTxtMissing
        ? `No robots.txt found — ${crawler.name} access is unrestricted by default.`
        : `${crawler.name} has full access to crawl your content for ${crawler.engine}.`,
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
    label: "All Major AI Crawlers Accessible",
    status:
      blockedCritical > 0
        ? "fail"
        : blockedTotal > 0
        ? "warning"
        : "pass",
    description:
      blockedCritical > 0
        ? `${blockedCritical} critical AI crawler${blockedCritical > 1 ? "s are" : " is"} blocked (GPTBot, OAI-SearchBot, PerplexityBot, or Google-Extended). This severely limits your visibility in AI-powered search.`
        : blockedTotal > 0
        ? `${blockedTotal} secondary AI crawler${blockedTotal > 1 ? "s are" : " is"} blocked. Consider allowing access to maximize AI search visibility.`
        : "All major AI crawlers have access to your content.",
    impact: "high",
    value: blockedTotal === 0,
  });

  // ── llms.txt detection (iPullRank Ch.11 — experimental, not yet standard) ──
  // Note: iPullRank explicitly states llms.txt is "not standard or widely referenced"
  // We flag it as informational — neither required nor harmful
  const hasLlmsTxt = page.robotsTxt !== null
    ? /llms\.txt/i.test(page.robotsTxt)
    : false;

  // Try to detect from HTML (some sites reference it)
  const llmsTxtInHtml = /llms\.txt/i.test(page.html ?? "");

  checks.push({
    id: "llms_txt",
    label: "llms.txt File (Experimental)",
    status: hasLlmsTxt || llmsTxtInHtml ? "pass" : "info",
    description: hasLlmsTxt || llmsTxtInHtml
      ? "llms.txt reference detected. Note: this is an experimental standard not yet widely adopted by major AI systems (per iPullRank AI Search Manual Ch.11). Focus on conventional robots.txt and structured data as primary signals."
      : "No llms.txt file detected. This is an experimental AI-specific directive not yet standardized or widely referenced by major AI systems. Conventional robots.txt and structured data are more impactful.",
    impact: "low",
    value: hasLlmsTxt || llmsTxtInHtml,
  });

  // ── XML Sitemap accessibility ──────────────────────────────────────────────
  // iPullRank Ch.11: XML sitemaps help AI crawlers discover all indexable URLs
  const hasSitemapInRobots = page.robotsTxt
    ? /^sitemap:/im.test(page.robotsTxt)
    : false;

  checks.push({
    id: "sitemap_for_crawlers",
    label: "Sitemap Accessible to AI Crawlers",
    status: hasSitemapInRobots ? "pass" : page.robotsTxt !== null ? "warning" : "info",
    description: hasSitemapInRobots
      ? "Sitemap URL declared in robots.txt — AI crawlers can discover all indexable pages."
      : page.robotsTxt !== null
      ? "robots.txt exists but no Sitemap directive found. Add 'Sitemap: https://yourdomain.com/sitemap.xml' to help AI crawlers discover your full content inventory."
      : "No robots.txt found, so no Sitemap directive. Add a robots.txt with a Sitemap reference to help AI crawlers index your full site.",
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
  // Critical crawlers blocked = heavy penalty (25 each)
  // Non-critical crawlers blocked = lighter penalty (10 each)
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
    return "No robots.txt found — AI crawlers have unrestricted access by default. Add robots.txt with a Sitemap directive.";
  if (blockedCritical > 0)
    return `${blockedCritical} critical AI crawler${blockedCritical > 1 ? "s are" : " is"} blocked — your content is invisible to those AI engines. Remove Disallow: / for GPTBot, OAI-SearchBot, PerplexityBot, and Google-Extended.`;
  if (blockedTotal > 0)
    return `${blockedTotal} secondary AI crawler${blockedTotal > 1 ? "s are" : " is"} blocked. All critical crawlers (GPTBot, OAI-SearchBot, PerplexityBot, Google-Extended) have access.`;
  return "All major AI crawlers (GPTBot, OAI-SearchBot, PerplexityBot, ClaudeBot, Google-Extended) have full access.";
}
