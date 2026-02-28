// ============================================================
// GEO-Auditor — Main Simulation Orchestrator
// Coordinates all analysis engines and produces final result
// ============================================================

import type { SimulationInput, SimulationResult, ScoreDelta } from '../types/simulator';
import { analyzeContent } from './contentAnalyzer';
import { analyzeTechnical } from './technicalAnalyzer';
import { scoreChatGPT, scorePerplexity, scoreGoogleAIO, computeCitationProbability } from './scoringEngine';
import { generateIssues, generateRecommendations } from './issueGenerator';

// Default target queries if none provided
const DEFAULT_QUERIES = [
  'how to optimize for AI search',
  'AI search visibility',
  'ChatGPT citation optimization',
  'Perplexity SEO guide',
  'Google AI Overviews optimization',
];

// Compute delta between two simulation results (for What-If mode)
function computeDelta(baseline: SimulationResult, revised: SimulationResult): ScoreDelta {
  return {
    overallDelta: revised.overallScore - baseline.overallScore,
    chatgptDelta: revised.chatgptScore - baseline.chatgptScore,
    perplexityDelta: revised.perplexityScore - baseline.perplexityScore,
    googleAIODelta: revised.googleAIOScore - baseline.googleAIOScore,
    citationProbabilityDelta: revised.citationProbability.overall - baseline.citationProbability.overall,
    improvedIssues: baseline.issues
      .filter(bi => !revised.issues.find(ri => ri.id === bi.id))
      .map(i => i.title),
    remainingIssues: revised.issues.map(i => i.title),
  };
}

// Main simulation function
export function runSimulation(
  input: SimulationInput,
  html: string,
  robotsTxt: string,
  baselineResult?: SimulationResult
): SimulationResult {
  const queries = input.targetQueries.length > 0 ? input.targetQueries : DEFAULT_QUERIES;
  
  // Use content override for What-If mode
  const contentToAnalyze = input.contentOverride 
    ? `<html><body>${input.contentOverride}</body></html>` 
    : html;
  
  // Run all analyzers
  const contentAnalysis = analyzeContent(contentToAnalyze);
  const technicalAnalysis = analyzeTechnical(html, robotsTxt, input.url);
  
  // Score each engine
  const { score: chatgptScore, analysis: rrfAnalysis } = scoreChatGPT(
    contentAnalysis, technicalAnalysis, queries
  );
  const { score: perplexityScore, analysis: perplexityAnalysis } = scorePerplexity(
    contentAnalysis, technicalAnalysis
  );
  const { score: googleAIOScore, analysis: googleAIOAnalysis } = scoreGoogleAIO(
    contentAnalysis, technicalAnalysis, queries
  );
  
  // Compute citation probability
  const citationProbability = computeCitationProbability(
    chatgptScore, perplexityScore, googleAIOScore,
    queries, contentAnalysis, technicalAnalysis
  );
  
  // Overall score (weighted: ChatGPT 40%, Perplexity 35%, Google AIO 25%)
  const overallScore = Math.round(
    chatgptScore * 0.40 + perplexityScore * 0.35 + googleAIOScore * 0.25
  );
  
  // Generate issues and recommendations
  const issues = generateIssues(
    contentAnalysis, technicalAnalysis,
    perplexityAnalysis, googleAIOAnalysis, rrfAnalysis
  );
  const recommendations = generateRecommendations(issues, contentAnalysis, technicalAnalysis);
  
  const result: SimulationResult = {
    url: input.url,
    timestamp: new Date().toISOString(),
    overallScore,
    chatgptScore,
    perplexityScore,
    googleAIOScore,
    rrfAnalysis,
    perplexityAnalysis,
    googleAIOAnalysis,
    contentAnalysis,
    technicalAnalysis,
    issues,
    recommendations,
    citationProbability,
  };
  
  // Compute delta if baseline exists (What-If mode)
  if (baselineResult && input.mode === 'simulate') {
    result.deltaFromBaseline = computeDelta(baselineResult, result);
  }
  
  return result;
}

// Utility: compute score label
export function getScoreLabel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'Excellent', color: '#22c55e' };
  if (score >= 65) return { label: 'Good', color: '#84cc16' };
  if (score >= 50) return { label: 'Fair', color: '#eab308' };
  if (score >= 35) return { label: 'Poor', color: '#f97316' };
  return { label: 'Critical', color: '#ef4444' };
}

// Utility: get engine display name
export function getEngineName(engine: string): string {
  const names: Record<string, string> = {
    chatgpt: 'ChatGPT',
    perplexity: 'Perplexity',
    google_aio: 'Google AI Overviews',
    all: 'All Engines',
  };
  return names[engine] || engine;
}

// Utility: estimate total score improvement if all issues fixed
export function estimateTotalImprovement(issues: SimulationResult['issues']): number {
  return Math.min(100, issues.reduce((acc, issue) => acc + issue.estimatedScoreImpact, 0));
}
