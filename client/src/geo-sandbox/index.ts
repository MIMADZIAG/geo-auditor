// ============================================================
// GEO-Auditor AI Sandbox Simulator
// Main Export File
//
// Usage in Lovable/React project:
//   import AISandbox from './geo-sandbox/src/components/AISandbox';
//   import { runSimulation } from './geo-sandbox/src/engine/simulator';
//
// ============================================================

// Components
export { default as AISandbox } from './components/AISandbox';
export { default as ScoreGauge } from './components/ScoreGauge';
export { default as EngineBreakdown } from './components/EngineBreakdown';
export { default as IssuesList } from './components/IssuesList';
export { default as WhatIfEditor } from './components/WhatIfEditor';
export { default as RRFVisualizer } from './components/RRFVisualizer';
export { default as CitationProbabilityChart } from './components/CitationProbabilityChart';

// Engine
export { runSimulation, getScoreLabel, getEngineName, estimateTotalImprovement } from './engine/simulator';
export { analyzeContent } from './engine/contentAnalyzer';
export { analyzeTechnical, analyzeRobotsTxt, analyzeSchema } from './engine/technicalAnalyzer';
export { scoreChatGPT, scorePerplexity, scoreGoogleAIO, computeCitationProbability } from './engine/scoringEngine';
export { generateIssues, generateRecommendations } from './engine/issueGenerator';

// Data
export { CHATGPT_RRF_PARAMS, PERPLEXITY_PARAMS, GOOGLE_AIO_PARAMS, SCORING_WEIGHTS, AI_CRAWLERS } from './data/algorithmProfiles';

// Types
export type {
  AIEngine,
  SimulationInput,
  SimulationResult,
  Issue,
  Recommendation,
  ContentAnalysis,
  TechnicalAnalysis,
  RRFAnalysis,
  PerplexityL3Analysis,
  GoogleAIOAnalysis,
  CitationProbability,
  ScoreDelta,
} from './types/simulator';
