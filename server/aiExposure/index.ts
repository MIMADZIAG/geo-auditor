/**
 * AI Search Exposure Score
 *
 * Proprietary GEO-Auditor metric that measures how many of a domain's
 * organic keywords trigger Google AI Overviews (and whether the domain
 * is likely cited as a source in those Overviews).
 *
 * Data source: internal SERP intelligence engine (powered by keyword
 * research infrastructure — source NOT disclosed to end users).
 *
 * Algorithm:
 *   1. Extract domain from audited URL
 *   2. Fetch top-100 organic keywords for the domain (by traffic)
 *   3. For each keyword, check SERP features for "ai_overview"
 *   4. Citation heuristic: domain is considered cited when:
 *      - AI Overview is present (ai_overview in serp_features), AND
 *      - Domain ranks in top 5 organically (best_position <= 5)
 *      Rationale: Google AI Overviews predominantly cite top-5 organic results.
 *      Note: Ahrefs does not provide direct citation data; this is a best-effort estimate.
 *   5. Calculate:
 *      - exposureScore: % of keywords with AI Overview present (0–100)
 *      - citationScore: % of AI Overview keywords where domain is likely cited (0–100)
 *      - compositeScore: weighted average (60% exposure + 40% citation)
 *   6. Classify domain into tier: Invisible / Emerging / Visible / Dominant
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

  if (totalKeywordsAnalyzed === 0) {
    insights.push("Brak danych organicznych dla tej domeny — możliwe, że jest zbyt nowa lub ma bardzo małą widoczność w Google.");
    insights.push("Priorytet: budowanie widoczności organicznej przez treści odpowiadające na pytania użytkowników.");
    return insights;
  }

  if (keywordsWithAiOverview === 0) {
    insights.push(`Żadna z ${totalKeywordsAnalyzed} analizowanych fraz nie wyzwala Google AI Overview — domena jest poza zasięgiem AI Search.`);
    insights.push("Priorytet: tworzenie treści odpowiadających na pytania (FAQ, poradniki) — to główny trigger dla AI Overviews.");
  } else {
    const exposurePct = Math.round((keywordsWithAiOverview / totalKeywordsAnalyzed) * 100);
    insights.push(`${exposurePct}% analizowanych fraz wyzwala Google AI Overview — to ${keywordsWithAiOverview} z ${totalKeywordsAnalyzed} słów kluczowych.`);

    if (keywordsCitedInAiOverview === 0) {
      insights.push(`Domena pojawia się w ${keywordsWithAiOverview} AI Overview, ale nie rankuje w top 5 dla żadnej z tych fraz — zwiększ pozycje organiczne, aby być cytowanym.`);
    } else {
      const citePct = Math.round((keywordsCitedInAiOverview / keywordsWithAiOverview) * 100);
      insights.push(`Domena prawdopodobnie jest cytowana w ${citePct}% AI Overview, w których się pojawia (${keywordsCitedInAiOverview}/${keywordsWithAiOverview} fraz) — rankuje w top 5 dla tych zapytań.`);
    }

    if (opportunities.length > 0) {
      const topOpportunity = opportunities.sort((a, b) => b.volume - a.volume)[0];
      const posInfo = topOpportunity.position ? ` (pozycja ${topOpportunity.position})` : '';
      insights.push(`Szansa na cytowanie: "${topOpportunity.keyword}" (${topOpportunity.volume.toLocaleString()} wyszukiwań/mies.) — AI Overview aktywny, ale domena rankuje poza top 5${posInfo}.`);
    }
  }

  return insights.slice(0, 3);
}

// ─── Ahrefs API helpers ───────────────────────────────────────────────────────

const AHREFS_BASE = "https://api.ahrefs.com/v3";

/**
 * Returns the most recent full month date in YYYY-MM-DD format.
 * Ahrefs requires a date parameter for organic-keywords endpoint.
 */
function getAhrefsDate(): string {
  const now = new Date();
  // Use first day of current month; if before 5th, use previous month
  const day = now.getUTCDate();
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth() + 1; // 1-12
  if (day < 5) {
    month -= 1;
    if (month === 0) { month = 12; year -= 1; }
  }
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

async function fetchOrganicKeywords(domain: string, limit = 100): Promise<AiExposureKeyword[]> {
  const apiKey = ENV.ahrefsApiKey;
  if (!apiKey) {
    console.warn("[AiExposure] AHREFS_API_KEY not set — returning empty keyword list");
    return [];
  }

  const date = getAhrefsDate();

  const params = new URLSearchParams({
    target: domain,
    mode: "subdomains",           // FIX: was "domain" — subdomains returns more results
    limit: String(limit),
    order_by: "sum_traffic:desc", // FIX: was "traffic:desc" — correct column is sum_traffic
    select: "keyword,volume,keyword_difficulty,serp_features,best_position", // FIX: was "positions" which doesn't exist
    date,                         // FIX: date is required by Ahrefs API v3
  });

  const url = `${AHREFS_BASE}/site-explorer/organic-keywords?${params}`;

  console.log(`[AiExposure] Fetching keywords for ${domain} (date: ${date})`);

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[AiExposure] organic-keywords error ${res.status}: ${body.slice(0, 300)}`);
      return [];
    }

    const data = await res.json() as {
      keywords?: Array<{
        keyword: string;
        volume: number;
        keyword_difficulty: number;
        serp_features?: string[];  // FIX: direct array, not nested in positions
        best_position?: number;
      }>
    };

    const keywords = data.keywords ?? [];
    console.log(`[AiExposure] Got ${keywords.length} keywords for ${domain}`);

    return keywords.map((kw) => {
      const serpFeatures: string[] = kw.serp_features ?? [];
      const position = kw.best_position ?? null;

      // ai_overview = AI Overview is present in SERP for this keyword
      // ai_overview_sitelink = AI Overview has sitelinks (NOT a citation indicator — rarely returned by Ahrefs)
      const hasAiOverview = serpFeatures.includes("ai_overview") || serpFeatures.includes("ai_overview_sitelink");

      // Citation heuristic: Ahrefs does not expose direct citation data.
      // Google AI Overviews predominantly cite top-5 organic results.
      // We consider the domain "cited" when it has AI Overview AND ranks in top 5.
      const isCitedInAiOverview = hasAiOverview && position !== null && position <= 5;

      return {
        keyword: kw.keyword,
        volume: kw.volume ?? 0,
        difficulty: kw.keyword_difficulty ?? 0,
        hasAiOverview,
        isCitedInAiOverview,
        position,
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

  const keywords = await fetchOrganicKeywords(domain, 100);

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
