export type EntitySentimentLabel =
  | "positive"
  | "neutral"
  | "negative"
  | "modelled";

export type EntityAssetType =
  | "homepage"
  | "product"
  | "category"
  | "blog"
  | "docs"
  | "about"
  | "trust"
  | "comparison"
  | "faq"
  | "support"
  | "landing"
  | "other";

export type EntityStrategicRole =
  | "brand"
  | "comparison"
  | "transactional"
  | "trust"
  | "problem-solving"
  | "entity-reinforcement"
  | "support";

export type PromptCluster =
  | "brand"
  | "category"
  | "comparison"
  | "transactional"
  | "how-to"
  | "local"
  | "trust"
  | "problem-solving";

export type ExplainabilityConfidence = "high" | "medium" | "low";
export type ActionPriority = "critical" | "high" | "medium" | "low";
export type ActionBlockFormat = "markdown" | "html" | "jsonld";
export type ActionType =
  | "jsonld"
  | "faq-block"
  | "comparison-table"
  | "answer-first-intro"
  | "trust-section"
  | "author-section"
  | "entity-reinforcement"
  | "new-asset";

export type EntityPageSummary = {
  id: number;
  url: string;
  label: string | null;
  lastScore: number | null;
  lastAuditAt: Date | null;
  lastCitationAt: Date | null;
  lastCitedEngines: number | null;
  lastTotalEngines: number | null;
  scheduleFrequency: number;
};

export type EntityWorkspaceConfig = {
  id: number | null;
  name: string;
  primaryDomain: string;
  description: string | null;
  market: string | null;
  language: string;
  onboardingCompleted: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type EntityWorkspacePrompt = {
  id: number;
  prompt: string;
  intentType: string | null;
  category: string | null;
  source: "onboarding" | "user_added" | "suggested";
  isActive: boolean;
  syncedAssets: number;
  lastCitedEngines?: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type EntityWorkspaceCompetitor = {
  id: number;
  domain: string;
  label: string | null;
  createdAt: Date;
};

export type EntityPortfolioItem = {
  entityKey: string;
  domain: string;
  brandName: string;
  representative: EntityPageSummary;
  representativePageId: number | null;
  pages: EntityPageSummary[];
  avgScore: number | null;
  avgReadinessScore: number | null;
  avgVisibilityScore: number | null;
  shareOfVoice: number | null;
  promptEstimate: number;
  promptCount: number;
  citedPromptCount: number;
  coverageRate: number | null;
  topCompetitors: string[];
  topThemes: string[];
  sentimentLabel: EntitySentimentLabel;
  sentimentScore: number | null;
  lastUpdatedAt: Date | null;
  activeAlerts: number;
  priorityAction: string;
  dataSource: "monitoring" | "fallback";
};

export type EntityPortfolioSummary = {
  totalEntities: number;
  totalPages: number;
  totalPrompts: number;
  totalCitedPrompts: number;
  avgReadinessScore: number | null;
  avgShareOfVoice: number | null;
  avgCoverageRate: number | null;
  activeAlertEntities: number;
  lastUpdatedAt: Date | null;
};

export type EntityWorkspaceAsset = {
  id: number;
  url: string;
  title: string;
  assetType: EntityAssetType;
  strategicRole: EntityStrategicRole;
  supportsPromptClusters: PromptCluster[];
  source: "mapped_from_monitoring" | "user_added" | "suggested";
  monitoredPageId: number | null;
  isPrimary: boolean;
  notes: string | null;
  readinessScore: number | null;
  citationCoverage: number | null;
};

export type EntityMissingAsset = {
  id: string;
  assetType: EntityAssetType;
  strategicRole: EntityStrategicRole;
  promptCluster: PromptCluster;
  priority: ActionPriority;
  reason: string;
  targetDescription: string;
};

export type EntityExplainabilityReason = {
  label: string;
  summary: string;
  confidence: ExplainabilityConfidence;
  evidence: string[];
};

export type EntityPromptDiff = {
  prompt: string;
  promptCluster: PromptCluster;
  topCompetitor: string | null;
  whyCompetitorWon: string;
  missingStructures: string[];
  missingFacts: string[];
  missingSchema: string[];
  recommendedAssetId: number | null;
  recommendedAssetLabel: string;
  confidenceScore: number;
  confidence: ExplainabilityConfidence;
  engines: string[];
};

export type EntityExplainabilitySummary = {
  topReasons: EntityExplainabilityReason[];
  promptDiffs: EntityPromptDiff[];
  blockerSummary: string[];
};

export type EntityActionBlock = {
  format: ActionBlockFormat;
  title: string;
  content: string;
};

export type EntityActionRecommendation = {
  id: string;
  type: ActionType;
  priority: ActionPriority;
  title: string;
  summary: string;
  promptCluster: PromptCluster | null;
  targetAssetId: number | null;
  targetAssetLabel: string;
  suggestedSchemas: string[];
  sourceReasons: string[];
  blocks: EntityActionBlock[];
};

export type EntityWorkspaceResponse = {
  workspace: EntityWorkspaceConfig;
  portfolio: EntityPortfolioItem | null;
  prompts: EntityWorkspacePrompt[];
  competitors: EntityWorkspaceCompetitor[];
  linkedPages: EntityPageSummary[];
  assets: EntityWorkspaceAsset[];
  missingAssets: EntityMissingAsset[];
  explainability: EntityExplainabilitySummary;
  actionPlan: EntityActionRecommendation[];
  summary: EntityPortfolioSummary;
  isConfigured: boolean;
};

export type EntityPortfolioResponse = {
  entities: EntityPortfolioItem[];
  summary: EntityPortfolioSummary;
};

export type EntityGroup = EntityPortfolioItem;
export type CommandCenterPayload = EntityPortfolioResponse;
export type EntityOverview = EntityPortfolioItem;

export function normalizeEntityDomain(input: string) {
  const trimmed = input.trim().toLowerCase();
  const withoutProtocol = trimmed.replace(/^https?:\/\//, "");
  const hostname = withoutProtocol.split("/")[0] ?? trimmed;
  return hostname.replace(/^www\./, "");
}

export function getEntityHostname(url: string) {
  try {
    return normalizeEntityDomain(new URL(url).hostname);
  } catch {
    return normalizeEntityDomain(url);
  }
}

export function getEntityRootDomain(hostname: string) {
  const clean = normalizeEntityDomain(hostname);
  const parts = clean.split(".");
  if (parts.length <= 2) return clean;
  return parts.slice(-2).join(".");
}

export function domainToBrandName(domain: string) {
  const base = domain.split(".")[0] ?? domain;
  return base
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
