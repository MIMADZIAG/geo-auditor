/**
 * AI Search Exposure Score
 *
 * Proprietary GEO-Auditor metric that measures how many of a domain's
 * organic keywords trigger Google AI Overviews (and whether the domain
 * is cited as a source in those Overviews).
 *
 * Data source: internal SERP intelligence engine (powered by keyword
 * research infrastructure — source NOT disclosed to end users).
 *
 * Algorithm:
 *   1. Extract domain from audited URL
 *   2. Fetch top-50 organic keywords for the domain (by traffic)
 *   3. For each keyword, check SERP features for "ai_overview" / "ai_overview_sitelink"
 *   4. Calculate:
 *      - exposureScore: % of keywords with AI Overview present (0–100)
 *      - citationScore: % of keywords where domain is cited in AI Overview (0–100)
 *      - compositeScore: weighted average (60% exposure + 40% citation)
 *   5. Classify domain into tier: Invisible / Emerging / Visible / Dominant
 */

import { ENV } from "../_core/env";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AiExposureKeyword {
  keyword: string;
  volume: number;
  difficulty: number;
  hasAiOverview: boolean;
  isCitedInAiOverview: boolean;
  position: number | null;
}

export interface AiExposureResult {
  domain: string;
  totalKeywordsAnalyzed: number;
  keywordsWithAiOverview: number;
  keywordsCitedInAiOverview: number;
  exposureScore: number;        // 0–100: % of keywords with AI Overview
  citationScore: number;        // 0–100: % of AI Overview keywords where domain is cited
  compositeScore: number;       // 0–100: weighted composite
  tier: "invisible" | "emerging" | "visible" | "dominant";
  tierLabel: string;
  topKeywords: AiExposureKeyword[];   // top 10 by volume with AI Overview
  opportunities: AiExposureKeyword[]; // keywords with AI Overview but domain NOT cited
  insights: string[];                  // 2–3 actionable insight strings
  analyzedAt: number;                  // Unix ms
}

// ─── Tier classification ──────────────────────────────────────────────────────

function classifyTier(compositeScore: number): { tier: AiExposureResult["tier"]; tierLabel: string } {
  if (compositeScore >= 70) return { tier: "dominant",  tierLabel: "Dominujący w AI Search" };
  if (compositeScore >= 40) return { tier: "visible",   tierLabel: "Widoczny w AI Search" };
  if (compositeScore >= 15) return { tier: "emerging",  tierLabel: "Wschodzący w AI Search" };
  return                          { tier: "invisible",  tierLabel: "Niewidoczny dla AI" };
}

// ─── Insight generator ────────────────────────────────────────────────────────

function generateInsights(result: Omit<AiExposureResult, "insights">): string[] {
  const insights: string[] = [];

  const { keywordsWithAiOverview, keywordsCitedInAiOverview, totalKeywordsAnalyzed, opportunities } = result;

  if (keywordsWithAiOverview === 0) {
    insights.push(`Żadna z ${totalKeywordsAnalyzed} analizowanych fraz nie wyzwala Google AI Overview — domena jest poza zasięgiem AI Search.`);
    insights.push("Priorytet: tworzenie treści odpowiadających na pytania (FAQ, poradniki) — to główny trigger dla AI Overviews.");
  } else {
    const exposurePct = Math.round((keywordsWithAiOverview / totalKeywordsAnalyzed) * 100);
    insights.push(`${exposurePct}% analizowanych fraz wyzwala Google AI Overview — to ${keywordsWithAiOverview} z ${totalKeywordsAnalyzed} słów kluczowych.`);

    if (keywordsCitedInAiOverview === 0) {
      insights.push(`Domena pojawia się w ${keywordsWithAiOverview} AI Overview, ale nie jest cytowana jako źródło — treści istnieją, ale nie spełniają kryteriów cytowania.`);
    } else {
      const citePct = Math.round((keywordsCitedInAiOverview / keywordsWithAiOverview) * 100);
      insights.push(`Domena jest cytowana w ${citePct}% AI Overview, w których się pojawia (${keywordsCitedInAiOverview}/${keywordsWithAiOverview} fraz).`);
    }

    if (opportunities.length > 0) {
      const topOpportunity = opportunities.sort((a, b) => b.volume - a.volume)[0];
      insights.push(`Największa szansa: "${topOpportunity.keyword}" (${topOpportunity.volume.toLocaleString()} wyszukiwań/mies.) — AI Overview aktywny, ale domena nie jest cytowana.`);
    }
  }

  return insights.slice(0, 3);
}

// ─── Ahrefs API helpers ───────────────────────────────────────────────────────

const AHREFS_BASE = "https://api.ahrefs.com/v3";

async function fetchOrganicKeywords(domain: string, limit = 50): Promise<AiExposureKeyword[]> {
  const apiKey = ENV.ahrefsApiKey;
  if (!apiKey) {
    console.warn("[AiExposure] AHREFS_API_KEY not set — returning empty keyword list");
    return [];
  }

  const params = new URLSearchParams({
    target: domain,
    mode: "domain",
    limit: String(limit),
    order_by: "traffic:desc",
    select: "keyword,volume,keyword_difficulty,positions",
  });

  const url = `${AHREFS_BASE}/site-explorer/organic-keywords?${params}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[AiExposure] organic-keywords error ${res.status}: ${body.slice(0, 200)}`);
      return [];
    }

    const data = await res.json() as { keywords?: Array<{ keyword: string; volume: number; keyword_difficulty: number; positions?: Array<{ serp_features?: string[] }> }> };
    const keywords = data.keywords ?? [];

    return keywords.map((kw) => {
      const serpFeatures: string[] = kw.positions?.[0]?.serp_features ?? [];
      const hasAiOverview = serpFeatures.includes("ai_overview") || serpFeatures.includes("ai_overview_sitelink");
      const isCitedInAiOverview = serpFeatures.includes("ai_overview_sitelink");

      return {
        keyword: kw.keyword,
        volume: kw.volume ?? 0,
        difficulty: kw.keyword_difficulty ?? 0,
        hasAiOverview,
        isCitedInAiOverview,
        position: kw.positions?.[0] ? 1 : null,
      };
    });
  } catch (err) {
    console.error("[AiExposure] fetch error:", err);
    return [];
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function computeAiExposureScore(url: string): Promise<AiExposureResult> {
  // Extract domain from URL
  let domain: string;
  try {
    domain = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    domain = url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
  }

  const keywords = await fetchOrganicKeywords(domain, 50);

  const totalKeywordsAnalyzed = keywords.length;
  const withAiOverview = keywords.filter((k) => k.hasAiOverview);
  const citedInAiOverview = keywords.filter((k) => k.isCitedInAiOverview);

  const keywordsWithAiOverview = withAiOverview.length;
  const keywordsCitedInAiOverview = citedInAiOverview.length;

  // Score calculation
  const exposureScore = totalKeywordsAnalyzed > 0
    ? Math.round((keywordsWithAiOverview / totalKeywordsAnalyzed) * 100)
    : 0;

  const citationScore = keywordsWithAiOverview > 0
    ? Math.round((keywordsCitedInAiOverview / keywordsWithAiOverview) * 100)
    : 0;

  const compositeScore = Math.round(exposureScore * 0.6 + citationScore * 0.4);

  const { tier, tierLabel } = classifyTier(compositeScore);

  // Top keywords with AI Overview (by volume, max 10)
  const topKeywords = withAiOverview
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 10);

  // Opportunities: AI Overview active but domain NOT cited
  const opportunities = withAiOverview
    .filter((k) => !k.isCitedInAiOverview)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 5);

  const partial = {
    domain,
    totalKeywordsAnalyzed,
    keywordsWithAiOverview,
    keywordsCitedInAiOverview,
    exposureScore,
    citationScore,
    compositeScore,
    tier,
    tierLabel,
    topKeywords,
    opportunities,
    analyzedAt: Date.now(),
  };

  const insights = generateInsights(partial);

  return { ...partial, insights };
}
