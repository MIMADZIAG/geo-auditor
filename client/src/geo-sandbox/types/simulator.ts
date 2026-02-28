// ============================================================
// GEO-Auditor AI Sandbox Simulator — Type Definitions
// Based on reverse-engineered algorithms:
// - ChatGPT RRF (Yesilyurt, 2025, Chrome DevTools)
// - Perplexity L3 XGBoost Reranker (Yesilyurt, 2026)
// - Google AI Overviews Patents (King, 2025, SearchEngineLand)
// ============================================================

export type AIEngine = 'chatgpt' | 'perplexity' | 'google_aio';

export interface RRFScore {
  queryVariant: string;
  estimatedRank: number;
  rrfScore: number; // 1 / (60 + rank)
}

export interface RRFAnalysis {
  // ChatGPT uses rrf_alpha:1, rrf_input_threshold:0 (discovered in Chrome DevTools)
  totalRRFScore: number;
  queryVariants: RRFScore[];
  topicalCoverageScore: number; // 0-100
  consistencyScore: number; // rank consistency across variants
  recommendation: string;
}

export interface PerplexityL3Analysis {
  // Based on Perplexity's L3 XGBoost reranker parameters
  l3RerankerScore: number; // 0-100, probability of passing l3_reranker_drop_threshold
  answerFirstScore: number; // Does content open with direct answer in ≤80 tokens?
  entityDisambiguationScore: number; // Are entities clearly defined?
  numericalDensityScore: number; // Contains concrete numbers/units?
  topicMultiplierCategory: 'high' | 'medium' | 'low' | 'restricted';
  topicMultiplierValue: number; // 1.0 - 3.0
  authorityDomainProximity: number; // 0-100, links to curated authority domains
  newPostCTRPotential: number; // 0-100, estimated CTR in launch window
  timeDecayRisk: 'low' | 'medium' | 'high'; // based on content freshness signals
  passesQualityGate: boolean;
  recommendation: string;
}

export interface GoogleAIOAnalysis {
  // Based on 6 Google patents (King, 2025)
  queryFanOutCoverage: number; // 0-100, how many synthetic queries content covers
  passageVerifiabilityScore: number; // 0-100, can passages be used as verification chunks?
  chunkabilityScore: number; // 0-100, are paragraphs self-contained 200-400 word units?
  semanticTripleScore: number; // 0-100, entity-relation-entity clarity
  pairwiseRankingScore: number; // 0-100, estimated score in pairwise passage comparison
  intentClassAlignment: 'informational' | 'transactional' | 'comparative' | 'navigational' | 'unknown';
  syntheticQueryCoverage: string[]; // list of inferred synthetic queries the content covers
  recommendation: string;
}

export interface ContentChunk {
  id: string;
  text: string;
  wordCount: number;
  isSelfContained: boolean; // can it answer a question standalone?
  hasDirectAnswer: boolean; // starts with direct answer?
  hasNumbers: boolean;
  hasCitations: boolean;
  headingContext: string;
  chunkabilityScore: number; // 0-100
}

export interface ContentAnalysis {
  rawText: string;
  chunks: ContentChunk[];
  totalWordCount: number;
  avgChunkWordCount: number;
  hasAnswerFirst: boolean; // first paragraph answers the query directly
  headingStructure: HeadingNode[];
  schemaTypes: string[];
  hasStatistics: boolean;
  hasCitations: boolean;
  hasComparisonTable: boolean;
  hasFAQSection: boolean;
  hasHowToSection: boolean;
  entityMentions: string[];
  topicCategory: string;
  contentFreshness: 'fresh' | 'recent' | 'stale' | 'unknown';
  readabilityScore: number; // Flesch-Kincaid approximation
}

export interface HeadingNode {
  level: number;
  text: string;
  isQueryLike: boolean; // does it look like a search query?
}

export interface TechnicalAnalysis {
  robotsTxtStatus: 'allows_all' | 'blocks_gptbot' | 'blocks_perplexitybot' | 'blocks_all_ai' | 'unknown';
  allowedBots: string[];
  blockedBots: string[];
  hasIndexNow: boolean; // critical for Bing/Copilot
  schemaMarkup: SchemaAnalysis;
  pageSpeedScore: number; // 0-100
  mobileOptimized: boolean;
  hasCanonical: boolean;
  metaDescription: string | null;
  titleTag: string | null;
  ogTags: boolean;
}

export interface SchemaAnalysis {
  types: string[];
  hasProduct: boolean;
  hasArticle: boolean;
  hasFAQPage: boolean;
  hasHowTo: boolean;
  hasOrganization: boolean;
  hasPerson: boolean;
  hasAggregateRating: boolean;
  hasReview: boolean;
  hasBreadcrumb: boolean;
  completenessScore: number; // 0-100
  missingRecommended: string[];
}

export interface SimulationInput {
  url: string;
  targetQueries: string[]; // queries to test against
  contentOverride?: string; // for What-If editor
  mode: 'analyze' | 'simulate';
}

export interface SimulationResult {
  url: string;
  timestamp: string;
  overallScore: number; // 0-100 weighted composite
  
  // Per-engine scores
  chatgptScore: number; // 0-100
  perplexityScore: number; // 0-100
  googleAIOScore: number; // 0-100
  
  // Detailed analyses
  rrfAnalysis: RRFAnalysis;
  perplexityAnalysis: PerplexityL3Analysis;
  googleAIOAnalysis: GoogleAIOAnalysis;
  contentAnalysis: ContentAnalysis;
  technicalAnalysis: TechnicalAnalysis;
  
  // Actionable output
  issues: Issue[];
  recommendations: Recommendation[];
  citationProbability: CitationProbability;
  
  // What-If comparison (only when contentOverride is set)
  deltaFromBaseline?: ScoreDelta;
}

export interface Issue {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  engine: AIEngine | 'all';
  category: 'technical' | 'content' | 'schema' | 'authority' | 'freshness';
  title: string;
  description: string;
  impact: string; // e.g., "+15% Perplexity citation probability"
  fix: string; // copy-paste ready fix
  estimatedScoreImpact: number; // points improvement
}

export interface Recommendation {
  id: string;
  priority: number; // 1 = highest
  engine: AIEngine | 'all';
  title: string;
  rationale: string; // WHY this matters (algorithm reference)
  action: string; // WHAT to do
  template?: string; // HTML/JSON-LD template if applicable
  estimatedImpact: number; // % improvement in citation probability
}

export interface CitationProbability {
  chatgpt: number; // 0-100%
  perplexity: number; // 0-100%
  googleAIO: number; // 0-100%
  overall: number; // weighted average
  topQueries: QueryCitationEstimate[];
}

export interface QueryCitationEstimate {
  query: string;
  engine: AIEngine;
  probability: number; // 0-100%
  competingFactors: string[];
}

export interface ScoreDelta {
  overallDelta: number;
  chatgptDelta: number;
  perplexityDelta: number;
  googleAIODelta: number;
  citationProbabilityDelta: number;
  improvedIssues: string[];
  remainingIssues: string[];
}
