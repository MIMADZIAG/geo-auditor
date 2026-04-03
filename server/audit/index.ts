import { scrapePage } from "./scraper";
import { analyzeTechnical } from "./technical";
import { analyzeStructuredData } from "./structuredData";
import { analyzeContentStructure } from "./contentStructure";
import { analyzeEEAT } from "./eeat";
import { analyzeAICrawlers } from "./aiCrawlers";
import { analyzeMetaTags } from "./metaTags";
import { computeOverallScore, getScoreLabel, generateRecommendations } from "./scorer";
import { generateLLMRecommendations, type LLMRecommendationsResult } from "./llmRecommendations";
import { detectPageType, getPageTypeLabel, type PageType } from "./pageTypeDetector";
import { analyzeContentIntelligence, type ContentIntelligenceResult } from "./contentIntelligence";
import { analyzeBrandAuthority } from "./brandAuthority";
import type { AuditFindings, Recommendation } from "./types";

export interface AuditResult {
  url: string;
  finalUrl: string;
  pageTitle: string;
  pageType: PageType;
  pageTypeLabel: string;
  overallScore: number;
  scoreLabel: "Dominujący" | "Widoczny" | "Rozwijający się" | "Startujący" | "Niewidoczny";
  findings: AuditFindings;
  recommendations: Recommendation[];
  llmResult?: LLMRecommendationsResult;
  contentIntelligence?: ContentIntelligenceResult;
  responseTimeMs: number;
  wafBlocked?: boolean;
  error?: string;
}

export async function runAudit(url: string): Promise<AuditResult> {
  const page = await scrapePage(url);

  if (page.error) {
    return {
      url: page.url,
      finalUrl: page.finalUrl,
      pageTitle: "",
      pageType: "generic" as PageType,
      pageTypeLabel: "Web Page",
      overallScore: 0,
      scoreLabel: "Niewidoczny",
      findings: createEmptyFindings(),
      recommendations: [],
      responseTimeMs: page.responseTimeMs,
      error: page.error,
    };
  }

  // Block audit when non-success HTTP status persists after all retries.
  // 449 (Retry With / WAF block), 429 (rate limit), 4xx/5xx should not produce results.
  const NON_AUDITABLE_CODES = new Set([449, 429, 403, 401, 404, 410, 500, 502, 503, 504]);
  if (page.statusCode !== 0 && page.statusCode !== 200 && NON_AUDITABLE_CODES.has(page.statusCode)) {
    const statusMessages: Record<number, string> = {
      449: "The page returned HTTP 449 (Retry With) after multiple attempts. The server is temporarily blocking automated requests. Please try again in a few minutes.",
      429: "The page returned HTTP 429 (Too Many Requests). The server is rate-limiting requests. Please try again later.",
      403: "The page returned HTTP 403 (Forbidden). The server is blocking access to this URL.",
      401: "The page returned HTTP 401 (Unauthorized). This page requires authentication to access.",
      404: "The page returned HTTP 404 (Not Found). This URL does not exist.",
      410: "The page returned HTTP 410 (Gone). This page has been permanently removed.",
      500: "The page returned HTTP 500 (Internal Server Error). The server encountered an error processing the request.",
      502: "The page returned HTTP 502 (Bad Gateway). The server is temporarily unavailable.",
      503: "The page returned HTTP 503 (Service Unavailable). The server is temporarily unavailable.",
      504: "The page returned HTTP 504 (Gateway Timeout). The server timed out responding.",
    };
    return {
      url: page.url,
      finalUrl: page.finalUrl,
      pageTitle: "",
      pageType: "generic" as PageType,
      pageTypeLabel: "Web Page",
      overallScore: 0,
      scoreLabel: "Niewidoczny",
      findings: createEmptyFindings(),
      recommendations: [],
      responseTimeMs: page.responseTimeMs,
      error: statusMessages[page.statusCode] ?? `HTTP ${page.statusCode}: Unable to audit this page. Please check the URL and try again.`,
    };
  }

  // Detect page type first — used to adapt audit criteria
  const pageTypeResult = detectPageType(page);
  const pageType = pageTypeResult.type;
  const pageTypeLabel = getPageTypeLabel(pageType);

  const technical = analyzeTechnical(page);
  const structuredDataResult = analyzeStructuredData(page);
  const contentStructure = await analyzeContentStructure(page, pageType);
  const eeat = analyzeEEAT(page, pageType);
  const metaTags = analyzeMetaTags(page);

  // Strip extra fields from structuredData before storing in findings
  const { schemas: _schemas, ...structuredData } = structuredDataResult;
  const { crawlerStatuses: _cs, ...aiCrawlersClean } = analyzeAICrawlers(page);

  // Brand Authority — synchronous, no LLM needed
  const brandAuthority = analyzeBrandAuthority(page, pageType);
  // Strip extra fields (brandPresenceScore, brandName, authorityTier, signals) before storing
  const { brandPresenceScore: _bps, brandName: _bn, authorityTier: _at, signals: _sig, ...brandAuthorityBase } = brandAuthority;

  const findings: AuditFindings = {
    technical,
    structuredData,
    contentStructure,
    eeat,
    aiCrawlers: aiCrawlersClean,
    metaTags,
    brandAuthority: brandAuthorityBase,
  };

  const overallScore = computeOverallScore(findings);
  const scoreLabel = getScoreLabel(overallScore);
  const recommendations = generateRecommendations(findings);

  // Helper: retry an async fn up to `attempts` times with exponential backoff
  async function withRetry<T>(fn: () => Promise<T>, attempts: number, label: string): Promise<T | undefined> {
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err) {
        const isLast = i === attempts - 1;
        console.warn(
          `[${label}] Attempt ${i + 1}/${attempts} failed:`,
          err instanceof Error ? err.message : err
        );
        if (!isLast) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
    return undefined;
  }

  // Generate LLM-powered personalized recommendations (best-effort, non-fatal, 2 retries)
  const llmResult = await withRetry(
    () => generateLLMRecommendations(page, findings, pageType, structuredDataResult.schemas),
    2,
    "LLM"
  );

  // Generate Content Intelligence analysis (best-effort, non-fatal, 2 retries)
  let contentIntelligence = await withRetry(
    () => analyzeContentIntelligence(page, pageType),
    2,
    "ContentIntelligence"
  );
  if (contentIntelligence) {
    // Also store in findings for scoring
    findings.contentIntelligence = contentIntelligence;
  }

  // Recompute overall score if Content Intelligence is available
  const finalScore = computeOverallScore(findings);
  const finalLabel = getScoreLabel(finalScore);

  return {
    url: page.url,
    finalUrl: page.finalUrl,
    pageTitle: page.title,
    pageType,
    pageTypeLabel,
    overallScore: finalScore,
    scoreLabel: finalLabel,
    findings,
    recommendations,
    llmResult,
    contentIntelligence,
    responseTimeMs: page.responseTimeMs,
    wafBlocked: page.wafBlocked,
  };
}

function createEmptyFindings(): AuditFindings {
  const empty = {
    score: 0,
    maxScore: 100,
    checks: [],
    summary: "Audit could not be completed.",
  };
  return {
    technical: empty,
    structuredData: empty,
    contentStructure: empty,
    eeat: empty,
    aiCrawlers: empty,
    metaTags: empty,
  };
}

export type { AuditFindings };
export { type Recommendation } from "./types";
