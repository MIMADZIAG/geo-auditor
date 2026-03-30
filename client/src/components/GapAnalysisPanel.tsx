/**
 * GapAnalysisPanel
 *
 * Displays a prioritised list of checks where competitors outperform the
 * target page. Data comes from competitor.getGapAnalysis tRPC endpoint.
 *
 * Layout:
 *  - Header with summary stats
 *  - Category filter pills
 *  - Gap items grouped by priority (critical → high → medium → low)
 *  - Each item: check label, category badge, competitor pass bar, recommendation
 *  - Pro paywall: Free sees top-3 critical gaps only
 */

import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

// ─── Types (mirror server/competitor/gapAnalysis.ts) ─────────────────────────

type GapPriority = "critical" | "high" | "medium" | "low";
type GapCategory =
  | "technical"
  | "structuredData"
  | "contentStructure"
  | "eeat"
  | "aiCrawlers"
  | "metaTags"
  | "brandAuthority";

interface GapItem {
  checkId: string;
  label: string;
  category: GapCategory;
  categoryLabel: string;
  competitorPassCount: number;
  competitorTotal: number;
  targetValue: number | null;
  priority: GapPriority;
  recommendation: string;
  impact: string;
}

interface GapAnalysisResult {
  gaps: GapItem[];
  categorySummary: Record<GapCategory, { gaps: number; total: number; score: number }>;
  totalChecks: number;
  totalGaps: number;
  analysedAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<GapPriority, { label: string; color: string; bg: string; border: string; dot: string }> = {
  critical: {
    label: "Krytyczny",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    dot: "bg-red-500",
  },
  high: {
    label: "Wysoki",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    dot: "bg-amber-500",
  },
  medium: {
    label: "Średni",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    dot: "bg-blue-500",
  },
  low: {
    label: "Niski",
    color: "text-zinc-400",
    bg: "bg-zinc-500/10",
    border: "border-zinc-500/30",
    dot: "bg-zinc-500",
  },
};

const CATEGORY_ICONS: Record<GapCategory, string> = {
  technical:        "⚙️",
  structuredData:   "🏷️",
  contentStructure: "📝",
  eeat:             "🎓",
  aiCrawlers:       "🤖",
  metaTags:         "🔖",
  brandAuthority:   "🏆",
};

const ALL_CATEGORIES: GapCategory[] = [
  "technical", "structuredData", "contentStructure", "eeat",
  "aiCrawlers", "metaTags", "brandAuthority",
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function CompetitorPassBar({
  passCount,
  total,
}: {
  passCount: number;
  total: number;
}) {
  const ratio = total > 0 ? passCount / total : 0;
  const pct = Math.round(ratio * 100);
  const color =
    ratio >= 0.8 ? "bg-red-500" : ratio >= 0.5 ? "bg-amber-500" : "bg-blue-500";
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden min-w-[48px]">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-zinc-500 tabular-nums whitespace-nowrap">
        {passCount}/{total}
      </span>
    </div>
  );
}

function GapCard({ gap, index, isLocked }: { gap: GapItem; index: number; isLocked: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const pc = PRIORITY_CONFIG[gap.priority];

  return (
    <div
      className={`relative border rounded-xl overflow-hidden transition-all ${pc.border} ${pc.bg} ${
        isLocked ? "select-none" : ""
      }`}
    >
      {isLocked && (
        <div className="absolute inset-0 backdrop-blur-sm bg-zinc-950/70 flex items-center justify-center z-10 rounded-xl">
          <Link href="/pricing">
            <span className="text-[11px] text-violet-400 font-semibold hover:text-violet-300 cursor-pointer">
              🔒 Odblokuj pełną analizę → Pro
            </span>
          </Link>
        </div>
      )}

      <button
        className="w-full text-left px-4 py-3 flex items-start gap-3"
        onClick={() => !isLocked && setExpanded((e) => !e)}
        disabled={isLocked}
      >
        {/* Priority dot */}
        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${pc.dot}`} />

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-white">{gap.label}</span>
            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${pc.color} ${pc.bg} ${pc.border}`}>
              {pc.label}
            </span>
            <span className="text-[9px] text-zinc-600 bg-zinc-800/60 px-1.5 py-0.5 rounded-full">
              {CATEGORY_ICONS[gap.category]} {gap.categoryLabel}
            </span>
          </div>

          {/* Competitor pass bar */}
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 whitespace-nowrap">Rywale spełniają:</span>
            <div className="flex-1 max-w-[120px]">
              <CompetitorPassBar passCount={gap.competitorPassCount} total={gap.competitorTotal} />
            </div>
          </div>
        </div>

        {/* Expand chevron */}
        {!isLocked && (
          <svg
            className={`w-4 h-4 text-zinc-600 flex-shrink-0 mt-0.5 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {/* Expanded details */}
      {expanded && !isLocked && (
        <div className="px-4 pb-4 pt-0 border-t border-white/5">
          <div className="mt-3 space-y-2.5">
            {/* Impact */}
            <div className="bg-zinc-900/60 border border-white/5 rounded-lg p-3">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">Dlaczego to ważne</p>
              <p className="text-xs text-zinc-300 leading-relaxed">{gap.impact}</p>
            </div>
            {/* Recommendation */}
            <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-lg p-3">
              <p className="text-[10px] text-emerald-400 uppercase tracking-wider font-semibold mb-1">Co zrobić</p>
              <p className="text-xs text-zinc-300 leading-relaxed">{gap.recommendation}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Category Summary Bar ─────────────────────────────────────────────────────

function CategorySummaryRow({
  category,
  data,
}: {
  category: GapCategory;
  data: { gaps: number; total: number; score: number };
}) {
  const gapRatio = data.total > 0 ? data.gaps / data.total : 0;
  const scoreColor =
    data.score >= 75 ? "text-emerald-400" : data.score >= 50 ? "text-amber-400" : "text-red-400";
  const barColor =
    gapRatio >= 0.5 ? "bg-red-500" : gapRatio >= 0.25 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-sm w-5 flex-shrink-0">{CATEGORY_ICONS[category]}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-zinc-400 truncate">
            {category === "technical" ? "Techniczne" :
             category === "structuredData" ? "Dane strukturalne" :
             category === "contentStructure" ? "Struktura treści" :
             category === "eeat" ? "E-E-A-T" :
             category === "aiCrawlers" ? "Dostęp AI" :
             category === "metaTags" ? "Meta tagi" : "Autorytet marki"}
          </span>
          <div className="flex items-center gap-2 flex-shrink-0">
            {data.gaps > 0 && (
              <span className="text-[10px] text-red-400 font-semibold">{data.gaps} luk</span>
            )}
            <span className={`text-[10px] font-bold tabular-nums ${scoreColor}`}>{Math.round(data.score)}</span>
          </div>
        </div>
        <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${Math.round(gapRatio * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface GapAnalysisPanelProps {
  auditId: number;
  isPro: boolean;
  citationJobStatus?: string | null;
}

export function GapAnalysisPanel({ auditId, isPro, citationJobStatus }: GapAnalysisPanelProps) {
  const [pollCount, setPollCount] = useState(0);
  const MAX_POLLS = 36;

  const { data: gapData, isLoading, refetch } = trpc.competitor.getGapAnalysis.useQuery(
    { auditId },
    { retry: 1, staleTime: 5 * 60 * 1000 }
  );

  // Poll for gap analysis data when citation job is done but competitor audit is still running
  useEffect(() => {
    if (gapData && gapData.totalGaps > 0) return; // data arrived
    if (pollCount >= MAX_POLLS) return;
    if (citationJobStatus !== "completed") return;
    const timer = setTimeout(() => {
      refetch();
      setPollCount(p => p + 1);
    }, 5000);
    return () => clearTimeout(timer);
  }, [gapData, pollCount, citationJobStatus]);

  const [activeCategory, setActiveCategory] = useState<GapCategory | "all">("all");
  const [showAll, setShowAll] = useState(false);

  const filteredGaps = useMemo(() => {
    if (!gapData) return [];
    return activeCategory === "all"
      ? gapData.gaps
      : gapData.gaps.filter((g) => g.category === activeCategory);
  }, [gapData, activeCategory]);

  // Free users see only top-3 critical gaps
  const FREE_LIMIT = 3;
  const visibleGaps = isPro || showAll ? filteredGaps : filteredGaps.slice(0, FREE_LIMIT);
  const hiddenCount = filteredGaps.length - visibleGaps.length;

  if (isLoading) {
    return (
      <div className="bg-zinc-900/40 border border-white/8 rounded-2xl p-6 flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-violet-500/40 border-t-violet-500 rounded-full animate-spin flex-shrink-0" />
        <span className="text-sm text-zinc-400">Analizuję luki względem konkurentów…</span>
      </div>
    );
  }

  if (!gapData || gapData.totalGaps === 0) {
    return null; // Don't render if no competitor data or no gaps
  }

  const criticalCount = gapData.gaps.filter((g) => g.priority === "critical").length;
  const highCount = gapData.gaps.filter((g) => g.priority === "high").length;

  // Active categories that have gaps
  const categoriesWithGaps = ALL_CATEGORIES.filter(
    (cat) => (gapData.categorySummary[cat]?.gaps ?? 0) > 0
  );

  return (
    <div className="bg-zinc-900/40 border border-white/8 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center flex-shrink-0">
          <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-white">Analiza luk vs. konkurenci</h3>
          <p className="text-[10px] text-zinc-500">Co mają rywale, czego Twoja strona nie ma</p>
        </div>
        {/* Summary badges */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {criticalCount > 0 && (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
              {criticalCount} kryt.
            </span>
          )}
          {highCount > 0 && (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
              {highCount} wysoki
            </span>
          )}
          <span className="text-[9px] text-zinc-500">{gapData.totalGaps} łącznie</span>
        </div>
      </div>

      {/* Category summary */}
      <div className="px-4 py-3 border-b border-white/5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          {ALL_CATEGORIES.map((cat) => (
            <CategorySummaryRow
              key={cat}
              category={cat}
              data={gapData.categorySummary[cat] ?? { gaps: 0, total: 0, score: 0 }}
            />
          ))}
        </div>
      </div>

      {/* Category filter pills */}
      {categoriesWithGaps.length > 1 && (
        <div className="px-4 py-2.5 border-b border-white/5 flex gap-1.5 flex-wrap">
          <button
            onClick={() => setActiveCategory("all")}
            className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
              activeCategory === "all"
                ? "bg-violet-500/20 text-violet-300 border-violet-500/40"
                : "bg-zinc-800/60 text-zinc-500 border-white/5 hover:text-zinc-300"
            }`}
          >
            Wszystkie ({gapData.totalGaps})
          </button>
          {categoriesWithGaps.map((cat) => {
            const count = gapData.categorySummary[cat]?.gaps ?? 0;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                  activeCategory === cat
                    ? "bg-violet-500/20 text-violet-300 border-violet-500/40"
                    : "bg-zinc-800/60 text-zinc-500 border-white/5 hover:text-zinc-300"
                }`}
              >
                {CATEGORY_ICONS[cat]} {count}
              </button>
            );
          })}
        </div>
      )}

      {/* Gap items */}
      <div className="p-3 space-y-2">
        {visibleGaps.map((gap, idx) => (
          <GapCard
            key={gap.checkId}
            gap={gap}
            index={idx}
            isLocked={!isPro && idx >= FREE_LIMIT}
          />
        ))}

        {/* Pro upsell for hidden gaps */}
        {!isPro && hiddenCount > 0 && (
          <div className="border border-violet-500/20 rounded-xl bg-violet-500/5 px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-white">
                +{hiddenCount} ukrytych luk
              </p>
              <p className="text-[10px] text-zinc-500 mt-0.5">
                Odblokuj pełną analizę z planem Pro
              </p>
            </div>
            <Link href="/pricing">
              <Button
                size="sm"
                className="bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold flex-shrink-0"
              >
                Upgrade →
              </Button>
            </Link>
          </div>
        )}

        {filteredGaps.length === 0 && (
          <div className="py-6 text-center">
            <p className="text-sm text-zinc-500">Brak luk w tej kategorii 🎉</p>
            <p className="text-[11px] text-zinc-600 mt-1">Twoja strona spełnia te wymagania lepiej niż konkurenci</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-white/5 flex items-center justify-between">
        <p className="text-[10px] text-zinc-600">
          Analiza oparta na {gapData.totalChecks} parametrach AI-Readiness
        </p>
        <p className="text-[10px] text-zinc-700">
          {new Date(gapData.analysedAt).toLocaleDateString("pl-PL")}
        </p>
      </div>
    </div>
  );
}
