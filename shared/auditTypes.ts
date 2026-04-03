export type CheckStatus = "pass" | "fail" | "warning" | "info";

export interface AuditCheck {
  id: string;
  label: string;
  status: CheckStatus;
  description: string;
  impact: "high" | "medium" | "low";
  value?: string | number | boolean | null;
  /** Continuous score 0–100 (optional, backward-compatible) */
  score?: number;
  /**
   * Optional structured metadata for rich UI rendering.
   * Used by checks that produce LLM-generated or structured outputs.
   * Example — first_paragraph_answer: { currentOpening, suggestedRewrite, answerFirstScore }
   */
  metadata?: Record<string, unknown>;
}

/** WikiData entity with QID mapping — used in KnowledgeGraphReadinessPanel */
export interface WikiDataEntity {
  surfaceForm: string;
  qid: string | null;
  label: string | null;
  description: string | null;
  entityType: "person" | "organization" | "product" | "place" | "concept" | "unknown";
  wikidataUrl: string | null;
  confirmed: boolean;
}

/** Entity recognition result — returned by entityRecognizer.ts */
export interface EntityRecognitionResult {
  confirmedEntities: WikiDataEntity[];
  unconfirmedEntities: WikiDataEntity[];
  totalEntitySignals: number;
  knowledgeGraphAnchors: number;
  numericFactsCount: number;
  wikidataAvailable: boolean;
}

export interface CategoryResult {
  score: number;
  maxScore: number;
  checks: AuditCheck[];
  summary: string;
}

/** Extended CategoryResult for contentStructure — carries entity data for KG panel */
export interface ContentStructureResult extends CategoryResult {
  entityData?: EntityRecognitionResult;
}

export interface AuditFindings {
  technical: CategoryResult;
  structuredData: CategoryResult;
  contentStructure: ContentStructureResult;
  eeat: CategoryResult;
  aiCrawlers: CategoryResult;
  metaTags: CategoryResult;
  brandAuthority?: CategoryResult;
}

export interface Recommendation {
  id: string;
  category: string;
  priority: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  howToFix: string;
  impact: string;
}

export interface LLMCodeSnippet {
  language: "json" | "html" | "markdown" | "text";
  label: string;
  code: string;
}

export interface LLMRecommendation {
  id: string;
  category: string;
  priority: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  howToFix: string;
  impact: string;
  codeSnippet?: LLMCodeSnippet;
  isPersonalized: true;
}

export interface LLMRecommendationsResult {
  recommendations: LLMRecommendation[];
  aiInsight: string;
  topPriority: string;
  scoreGain: number; // Estimated score increase (1–15 pts)
  difficulty: "easy" | "medium" | "hard"; // Implementation difficulty
}

export type PageType = "article" | "product" | "product-listing" | "homepage" | "landing" | "service" | "generic";

export interface ContentIntelligenceCheck {
  id: string;
  label: string;
  score: number;
  status: CheckStatus;
  description: string;
  recommendation: string;
  impact: "high" | "medium" | "low";
  examples?: string[];
}

export interface ContentIntelligenceResult {
  overallScore: number;
  citeabilityScore: number;
  checks: ContentIntelligenceCheck[];
  summary: string;
  topOpportunity: string;
  pageTopics: string[];
  isLLMPowered: true;
}

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
  error?: string;
}
