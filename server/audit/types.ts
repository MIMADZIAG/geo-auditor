export type CheckStatus = "pass" | "fail" | "warning" | "info";

export interface AuditCheck {
  id: string;
  label: string;
  status: CheckStatus;
  /** Continuous score 0–100 for this check (optional, backward-compatible).
   * When present, the scorer uses this value directly instead of deriving
   * from status (pass=100, warning=20, fail=0, info=10).
   * Allows nuanced partial credit: e.g. entity_richness with 8 entities = 53/100.
   */
  score?: number;
  description: string;
  impact: "high" | "medium" | "low";
  value?: string | number | boolean | null;
}

export interface CategoryResult {
  score: number; // 0–100
  maxScore: number;
  checks: AuditCheck[];
  summary: string;
}

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

export interface AuditFindings {
  technical: CategoryResult;
  structuredData: CategoryResult;
  contentStructure: CategoryResult;
  eeat: CategoryResult;
  aiCrawlers: CategoryResult;
  metaTags: CategoryResult;
  contentIntelligence?: ContentIntelligenceResult;
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

export interface AuditResult {
  url: string;
  finalUrl: string;
  pageTitle: string;
  overallScore: number;
  scoreLabel: "Dominujący" | "Widoczny" | "Rozwijający się" | "Startujący" | "Niewidoczny";
  findings: AuditFindings;
  recommendations: Recommendation[];
  responseTimeMs: number;
  error?: string;
}
