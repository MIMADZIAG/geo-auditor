export type CheckStatus = "pass" | "fail" | "warning" | "info";

export interface AuditCheck {
  id: string;
  label: string;
  status: CheckStatus;
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
  scoreLabel: "Excellent" | "Good" | "Fair" | "Poor";
  findings: AuditFindings;
  recommendations: Recommendation[];
  responseTimeMs: number;
  error?: string;
}
