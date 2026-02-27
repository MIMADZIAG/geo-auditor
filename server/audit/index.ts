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
import type { AuditFindings, Recommendation } from "./types";

export interface AuditResult {
  url: string;
  finalUrl: string;
  pageTitle: string;
  pageType: PageType;
  pageTypeLabel: string;
  overallScore: number;
  scoreLabel: "Excellent" | "Good" | "Fair" | "Poor";
  findings: AuditFindings;
  recommendations: Recommendation[];
  llmResult?: LLMRecommendationsResult;
  responseTimeMs: number;
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
      scoreLabel: "Poor",
      findings: createEmptyFindings(),
      recommendations: [],
      responseTimeMs: page.responseTimeMs,
      error: page.error,
    };
  }

  // Detect page type first — used to adapt audit criteria
  const pageTypeResult = detectPageType(page);
  const pageType = pageTypeResult.type;
  const pageTypeLabel = getPageTypeLabel(pageType);

  const technical = analyzeTechnical(page);
  const structuredDataResult = analyzeStructuredData(page);
  const contentStructure = analyzeContentStructure(page, pageType);
  const eeat = analyzeEEAT(page, pageType);
  const aiCrawlers = analyzeAICrawlers(page);
  const metaTags = analyzeMetaTags(page);

  // Strip extra fields from structuredData before storing in findings
  const { schemas: _schemas, ...structuredData } = structuredDataResult;
  const { crawlerStatuses: _cs, ...aiCrawlersClean } = analyzeAICrawlers(page);

  const findings: AuditFindings = {
    technical,
    structuredData,
    contentStructure,
    eeat,
    aiCrawlers: aiCrawlersClean,
    metaTags,
  };

  const overallScore = computeOverallScore(findings);
  const scoreLabel = getScoreLabel(overallScore);
  const recommendations = generateRecommendations(findings);

  // Generate LLM-powered personalized recommendations (best-effort, non-fatal)
  let llmResult: LLMRecommendationsResult | undefined;
  try {
    // Pass detected schemas separately so LLM knows what's already present
    llmResult = await generateLLMRecommendations(page, findings, pageType, structuredDataResult.schemas);
  } catch (err) {
    console.warn(
      "[LLM] Failed to generate LLM recommendations:",
      err instanceof Error ? err.message : err
    );
    // Non-fatal: audit still succeeds without LLM recommendations
  }

  return {
    url: page.url,
    finalUrl: page.finalUrl,
    pageTitle: page.title,
    pageType,
    pageTypeLabel,
    overallScore,
    scoreLabel,
    findings,
    recommendations,
    llmResult,
    responseTimeMs: page.responseTimeMs,
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
