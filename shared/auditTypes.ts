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
  score: number;
  maxScore: number;
  checks: AuditCheck[];
  summary: string;
}

export interface AuditFindings {
  technical: CategoryResult;
  structuredData: CategoryResult;
  contentStructure: CategoryResult;
  eeat: CategoryResult;
  aiCrawlers: CategoryResult;
  metaTags: CategoryResult;
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
