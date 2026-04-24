export type EntitySentimentLabel =
  | "positive"
  | "neutral"
  | "negative"
  | "modelled";

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

export type EntityPortfolioResponse = {
  entities: EntityPortfolioItem[];
  summary: EntityPortfolioSummary;
};

export type EntityGroup = EntityPortfolioItem;
export type CommandCenterPayload = EntityPortfolioResponse;
export type EntityOverview = EntityPortfolioItem;

export function getEntityHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] ?? url;
  }
}

export function getEntityRootDomain(hostname: string) {
  const clean = hostname.replace(/^www\./, "");
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
