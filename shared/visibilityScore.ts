/**
 * AI Visibility Score — shared formula used by server (DB helpers, monitoring worker)
 * and client (MonitoredPageCard, Dashboard Hub, AICitationPanel).
 *
 * Design principle: ONE number (0–100) replaces the "2/4 AI" fraction everywhere.
 * The score is intentionally simple so a marketing director understands it immediately.
 *
 * Formula:
 *   base  = (citedEngines / totalEngines) * 100          — which engines cite the page
 *   bonus = citedQueriesRatio * 20                        — breadth: how many queries triggered a citation
 *   score = clamp(base + bonus, 0, 100)
 *
 * When citedQueriesRatio is unknown (monitoring-only context), bonus = 0.
 */

export type VisibilityTier =
  | "dominant"    // 80–100: "Dominująca"
  | "visible"     // 50–79:  "Widoczna"
  | "growing"     // 20–49:  "Rozwijająca się"
  | "invisible";  // 0–19:   "Niewidoczna"

export interface VisibilityScoreResult {
  score: number;          // 0–100 integer
  tier: VisibilityTier;
  label: string;          // Polish label for display
  colorClass: string;     // Tailwind text color class
  bgClass: string;        // Tailwind bg+border class for badge
  description: string;    // One-line context sentence
}

/**
 * Compute AI Visibility Score from raw citation data.
 * @param citedEngines   Number of engines that cited the page (0–totalEngines)
 * @param totalEngines   Total engines checked (typically 4)
 * @param citedQueriesRatio  Fraction of queries that produced a citation (0–1). Pass null if unknown.
 */
export function computeAIVisibilityScore(
  citedEngines: number,
  totalEngines: number,
  citedQueriesRatio: number | null = null
): number {
  if (totalEngines <= 0) return 0;
  const base = (citedEngines / totalEngines) * 100;
  const bonus = citedQueriesRatio != null ? citedQueriesRatio * 20 : 0;
  return Math.round(Math.min(100, Math.max(0, base + bonus)));
}

export function getVisibilityTier(score: number): VisibilityTier {
  if (score >= 80) return "dominant";
  if (score >= 50) return "visible";
  if (score >= 20) return "growing";
  return "invisible";
}

export function getVisibilityScoreResult(
  citedEngines: number | null | undefined,
  totalEngines: number | null | undefined,
  citedQueriesRatio: number | null = null
): VisibilityScoreResult {
  // No data yet
  if (citedEngines == null || totalEngines == null || totalEngines === 0) {
    return {
      score: 0,
      tier: "invisible",
      label: "Brak danych",
      colorClass: "text-zinc-500",
      bgClass: "bg-zinc-500/10 border-zinc-500/20",
      description: "Uruchom monitoring, aby sprawdzić widoczność w AI Search.",
    };
  }

  const score = computeAIVisibilityScore(citedEngines, totalEngines, citedQueriesRatio);
  const tier = getVisibilityTier(score);

  const TIER_META: Record<VisibilityTier, { label: string; colorClass: string; bgClass: string; description: string }> = {
    dominant: {
      label: "Dominująca",
      colorClass: "text-emerald-400",
      bgClass: "bg-emerald-500/10 border-emerald-500/25",
      description: `Cytowana przez ${citedEngines} z ${totalEngines} silników AI. Utrzymuj jakość treści.`,
    },
    visible: {
      label: "Widoczna",
      colorClass: "text-blue-400",
      bgClass: "bg-blue-500/10 border-blue-500/25",
      description: `Cytowana przez ${citedEngines} z ${totalEngines} silników AI. Rozwijaj treść, aby osiągnąć pełną widoczność.`,
    },
    growing: {
      label: "Rozwijająca się",
      colorClass: "text-amber-400",
      bgClass: "bg-amber-500/10 border-amber-500/25",
      description: `Cytowana przez ${citedEngines} z ${totalEngines} silników AI. Wdróż rekomendacje audytu, aby przyspieszyć wzrost.`,
    },
    invisible: {
      label: "Niewidoczna",
      colorClass: "text-red-400",
      bgClass: "bg-red-500/10 border-red-500/25",
      description: `Nie wykryto cytowań w ${totalEngines} silnikach AI. Zacznij od rekomendacji audytu.`,
    },
  };

  return { score, tier, ...TIER_META[tier] };
}

// ─── Engine config ────────────────────────────────────────────────────────────

export type CitationEngine = "chatgpt" | "google" | "perplexity" | "gemini";

export const ENGINE_CONFIG: Record<CitationEngine, { label: string; shortLabel: string; color: string }> = {
  chatgpt: {
    label: "ChatGPT",
    shortLabel: "GPT",
    color: "#10b981", // emerald-500
  },
  google: {
    label: "Google AI",
    shortLabel: "Google",
    color: "#3b82f6", // blue-500
  },
  perplexity: {
    label: "Perplexity",
    shortLabel: "Pplx",
    color: "#8b5cf6", // violet-500
  },
  gemini: {
    label: "Gemini",
    shortLabel: "Gem",
    color: "#f59e0b", // amber-500
  },
};

export const ALL_ENGINES: CitationEngine[] = ["chatgpt", "google", "perplexity", "gemini"];
