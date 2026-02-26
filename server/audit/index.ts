import { scrapePage } from "./scraper";
import { analyzeTechnical } from "./technical";
import { analyzeStructuredData } from "./structuredData";
import { analyzeContentStructure } from "./contentStructure";
import { analyzeEEAT } from "./eeat";
import { analyzeAICrawlers } from "./aiCrawlers";
import { analyzeMetaTags } from "./metaTags";
import { computeOverallScore, getScoreLabel, generateRecommendations } from "./scorer";
import type { AuditResult, AuditFindings } from "./types";

export async function runAudit(url: string): Promise<AuditResult> {
  const page = await scrapePage(url);

  if (page.error) {
    return {
      url: page.url,
      finalUrl: page.finalUrl,
      pageTitle: "",
      overallScore: 0,
      scoreLabel: "Poor",
      findings: createEmptyFindings(),
      recommendations: [],
      responseTimeMs: page.responseTimeMs,
      error: page.error,
    };
  }

  const technical = analyzeTechnical(page);
  const structuredDataResult = analyzeStructuredData(page);
  const contentStructure = analyzeContentStructure(page);
  const eeat = analyzeEEAT(page);
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

  return {
    url: page.url,
    finalUrl: page.finalUrl,
    pageTitle: page.title,
    overallScore,
    scoreLabel,
    findings,
    recommendations,
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

export type { AuditResult, AuditFindings };
export { type Recommendation } from "./types";
