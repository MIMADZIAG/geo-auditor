import type { ScrapedPage } from "./scraper";
import type { AuditCheck, CategoryResult } from "./types";

interface CrawlerInfo {
  id: string;
  name: string;
  userAgent: string;
  engine: string;
  description: string;
}

const AI_CRAWLERS: CrawlerInfo[] = [
  {
    id: "gptbot",
    name: "GPTBot",
    userAgent: "GPTBot",
    engine: "ChatGPT / OpenAI",
    description: "OpenAI's crawler used to train GPT models and power ChatGPT browsing.",
  },
  {
    id: "perplexitybot",
    name: "PerplexityBot",
    userAgent: "PerplexityBot",
    engine: "Perplexity AI",
    description: "Perplexity's crawler for real-time search and AI answer generation.",
  },
  {
    id: "claudebot",
    name: "ClaudeBot",
    userAgent: "ClaudeBot",
    engine: "Anthropic Claude",
    description: "Anthropic's crawler used for Claude AI model training and browsing.",
  },
  {
    id: "google_extended",
    name: "Google-Extended",
    userAgent: "Google-Extended",
    engine: "Google Gemini / Bard",
    description: "Google's opt-out token for AI training data (Gemini, Vertex AI).",
  },
  {
    id: "anthropic_ai",
    name: "anthropic-ai",
    userAgent: "anthropic-ai",
    engine: "Anthropic",
    description: "Anthropic's secondary crawler identifier.",
  },
  {
    id: "cohere_ai",
    name: "cohere-ai",
    userAgent: "cohere-ai",
    engine: "Cohere",
    description: "Cohere's AI crawler for training and retrieval.",
  },
];

function isCrawlerBlocked(robotsTxt: string, userAgent: string): boolean {
  const lines = robotsTxt.split("\n").map((l) => l.trim());
  let inRelevantBlock = false;
  let inAllBlock = false;

  for (const line of lines) {
    if (line.toLowerCase().startsWith("user-agent:")) {
      const ua = line.substring("user-agent:".length).trim();
      inRelevantBlock = ua.toLowerCase() === userAgent.toLowerCase();
      inAllBlock = ua === "*";
    }

    if (
      (inRelevantBlock || inAllBlock) &&
      line.toLowerCase().startsWith("disallow:")
    ) {
      const path = line.substring("disallow:".length).trim();
      if (path === "/" || path === "*") {
        return true;
      }
    }
  }

  return false;
}

export function analyzeAICrawlers(page: ScrapedPage): CategoryResult & {
  crawlerStatuses: Array<{ crawler: CrawlerInfo; blocked: boolean; robotsTxtMissing: boolean }>;
} {
  const checks: AuditCheck[] = [];
  const crawlerStatuses: Array<{
    crawler: CrawlerInfo;
    blocked: boolean;
    robotsTxtMissing: boolean;
  }> = [];

  const robotsTxtMissing = page.robotsTxt === null;

  for (const crawler of AI_CRAWLERS) {
    const blocked = robotsTxtMissing
      ? false
      : isCrawlerBlocked(page.robotsTxt!, crawler.userAgent);

    crawlerStatuses.push({ crawler, blocked, robotsTxtMissing });

    checks.push({
      id: crawler.id,
      label: `${crawler.name} (${crawler.engine})`,
      status: blocked ? "fail" : "pass",
      description: blocked
        ? `${crawler.name} is blocked in robots.txt. Your content cannot be indexed by ${crawler.engine}.`
        : robotsTxtMissing
        ? `No robots.txt found — ${crawler.name} access is unrestricted by default.`
        : `${crawler.name} has access to crawl your content.`,
      impact: "high",
      value: !blocked,
    });
  }

  // Overall robots.txt check for AI crawlers
  const blockedCount = crawlerStatuses.filter((s) => s.blocked).length;
  checks.push({
    id: "all_ai_crawlers",
    label: "All Major AI Crawlers Accessible",
    status:
      blockedCount === 0
        ? "pass"
        : blockedCount <= 2
        ? "warning"
        : "fail",
    description:
      blockedCount === 0
        ? "All major AI crawlers have access to your content."
        : `${blockedCount} AI crawler${blockedCount > 1 ? "s are" : " is"} blocked. This limits your visibility in AI-powered search engines.`,
    impact: "high",
    value: blockedCount === 0,
  });

  const score = computeScore(checks, blockedCount);

  return {
    score,
    maxScore: 100,
    checks,
    crawlerStatuses,
    summary: buildSummary(score, blockedCount, robotsTxtMissing),
  };
}

function computeScore(
  checks: AuditCheck[],
  blockedCount: number
): number {
  // Each blocked crawler is a significant penalty
  const baseScore = 100;
  const penaltyPerBlocked = 20;
  return Math.max(0, Math.min(100, baseScore - blockedCount * penaltyPerBlocked));
}

function buildSummary(
  score: number,
  blockedCount: number,
  robotsTxtMissing: boolean
): string {
  if (robotsTxtMissing)
    return "No robots.txt found — AI crawlers have unrestricted access by default.";
  if (blockedCount === 0)
    return "All major AI crawlers (GPTBot, PerplexityBot, ClaudeBot, Google-Extended) have access.";
  return `${blockedCount} AI crawler${blockedCount > 1 ? "s are" : " is"} blocked in robots.txt — your content is invisible to those AI engines.`;
}
