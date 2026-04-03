/**
 * CompetitorBenchmark — Profound-class Competitive Benchmarking View
 *
 * Shows Share of Voice vs competitors in AI search results:
 * - SoV % with trend chart
 * - Top competitor domains with citation counts
 * - Per-engine competitive breakdown
 * - SoV trend over last 10 monitoring runs
 *
 * Data source: visibility_snapshots via trpc.monitoring.getCompetitorBenchmark
 * NOTE: Reuses existing competitor citation data from citation_checks —
 * no duplicate data collection, just better visualization.
 */

import { trpc } from "@/lib/trpc";
import { Loader2, BarChart3, Globe, TrendingUp, TrendingDown, Minus, Bot } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompetitorDomain {
  domain: string;
  count: number;
  sentimentScore?: number;
}

interface EngineBreakdown {
  cited: boolean;
  sentimentScore?: number;
}

interface SovPoint {
  recordedAt: Date | string;
  shareOfVoice: number | null;
  visibilityScore: number | null;
  competitorCitationCount: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ENGINE_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  google: "Google AI",
  perplexity: "Perplexity",
  gemini: "Gemini",
};

function formatDate(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
}

// ─── SoV Bar Chart ────────────────────────────────────────────────────────────

function SovTrendChart({ data }: { data: SovPoint[] }) {
  if (data.length < 2) return null;
  const W = 300;
  const H = 60;
  const PAD = { top: 6, right: 6, bottom: 16, left: 24 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const sovValues = data.map((d) => (d.shareOfVoice ?? 0) * 100);
  const max = Math.max(...sovValues, 10);

  const toPath = (values: number[]) =>
    values
      .map((v, i) => {
        const x = PAD.left + (i / Math.max(values.length - 1, 1)) * innerW;
        const y = PAD.top + innerH - (v / max) * innerH;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  const xLabels = [data[0]!, data[data.length - 1]!].map((d) => ({
    label: formatDate(d.recordedAt),
    x: d === data[0] ? PAD.left : PAD.left + innerW,
  }));

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible text-border/30">
      {/* Y-axis ticks */}
      {[0, 25, 50, 75, 100].filter((t) => t <= max + 10).map((tick) => {
        const y = PAD.top + innerH - (tick / max) * innerH;
        return (
          <g key={tick}>
            <line x1={PAD.left} y1={y} x2={PAD.left + innerW} y2={y} stroke="currentColor" strokeOpacity={0.06} strokeWidth={1} />
            <text x={PAD.left - 3} y={y + 3} textAnchor="end" fontSize={7} fill="currentColor" fillOpacity={0.4}>{tick}%</text>
          </g>
        );
      })}
      {/* SoV area fill */}
      <path
        d={`${toPath(sovValues)} L${PAD.left + innerW},${PAD.top + innerH} L${PAD.left},${PAD.top + innerH} Z`}
        fill="#8b5cf6"
        fillOpacity={0.08}
      />
      {/* SoV line */}
      <path
        d={toPath(sovValues)}
        fill="none"
        stroke="#8b5cf6"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Latest dot */}
      {(() => {
        const last = data[data.length - 1]!;
        const x = PAD.left + innerW;
        const y = PAD.top + innerH - ((last.shareOfVoice ?? 0) * 100 / max) * innerH;
        return <circle cx={x} cy={y} r={3} fill="#8b5cf6" />;
      })()}
      {/* X labels */}
      {xLabels.map(({ label, x }) => (
        <text key={label} x={x} y={H - 1} textAnchor="middle" fontSize={7} fill="currentColor" fillOpacity={0.4}>
          {label}
        </text>
      ))}
    </svg>
  );
}

// ─── Competitor Domain Row ────────────────────────────────────────────────────

function CompetitorRow({
  competitor,
  maxCount,
  rank,
}: {
  competitor: CompetitorDomain;
  maxCount: number;
  rank: number;
}) {
  const pct = maxCount > 0 ? (competitor.count / maxCount) * 100 : 0;
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-border/30 last:border-0">
      <span className="text-[10px] text-muted-foreground/50 w-4 text-right shrink-0">#{rank}</span>
      <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
      <span className="text-xs font-medium flex-1 truncate">{competitor.domain}</span>
      <div className="w-20 h-1.5 rounded-full bg-muted/40 overflow-hidden shrink-0">
        <div
          className="h-full rounded-full bg-red-500/70"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums w-6 text-right shrink-0">
        {competitor.count}×
      </span>
    </div>
  );
}

// ─── Per-Engine Competitive Row ───────────────────────────────────────────────

function EngineCompetitiveRow({
  engine,
  data,
}: {
  engine: string;
  data: EngineBreakdown;
}) {
  return (
    <div className="flex items-center gap-2 py-1 border-b border-border/20 last:border-0">
      <Bot className="w-3 h-3 text-muted-foreground shrink-0" />
      <span className="text-xs w-20 shrink-0">{ENGINE_LABELS[engine] ?? engine}</span>
      <div className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${
        data.cited
          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
          : "bg-red-500/10 border-red-500/20 text-red-400"
      }`}>
        {data.cited ? "Cytowana" : "Nie cytowana"}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CompetitorBenchmark({ monitoredPageId }: { monitoredPageId: number }) {
  const { data, isLoading } = trpc.monitoring.getCompetitorBenchmark.useQuery(
    { monitoredPageId },
    { staleTime: 5 * 60_000 }
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Ładowanie danych konkurencji…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 p-4 text-center">
        <BarChart3 className="w-5 h-5 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">
          Brak danych konkurencji. Dane pojawią się po pierwszym cyklu monitoringu z cytatami.
        </p>
      </div>
    );
  }

  const sovPct = data.shareOfVoice != null ? Math.round(data.shareOfVoice * 100) : null;
  const competitors = (data.topCompetitorDomains ?? []) as CompetitorDomain[];
  const maxCount = competitors.length > 0 ? Math.max(...competitors.map((c) => c.count)) : 1;
  const engines = data.engineBreakdown ? Object.entries(data.engineBreakdown) : [];

  // SoV trend delta
  const sovTrend = (data.sovTrend ?? []) as SovPoint[];
  const sovDelta =
    sovTrend.length >= 2
      ? ((sovTrend[sovTrend.length - 1]?.shareOfVoice ?? 0) -
          (sovTrend[sovTrend.length - 2]?.shareOfVoice ?? 0)) *
        100
      : null;

  return (
    <div className="space-y-4">
      {/* Share of Voice KPI */}
      <div className="flex items-start gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Share of Voice</span>
          <div className="flex items-end gap-1.5">
            <span className={`text-3xl font-bold tabular-nums ${
              sovPct == null ? "text-muted-foreground" :
              sovPct >= 30 ? "text-emerald-400" :
              sovPct >= 10 ? "text-amber-400" :
              "text-red-400"
            }`}>
              {sovPct != null ? sovPct : "–"}
            </span>
            {sovPct != null && <span className="text-sm text-muted-foreground mb-1">%</span>}
            {sovDelta != null && (
              <div className={`flex items-center gap-0.5 mb-1 text-xs font-semibold ${
                sovDelta > 0 ? "text-emerald-400" :
                sovDelta < 0 ? "text-red-400" :
                "text-zinc-400"
              }`}>
                {sovDelta > 0 ? <TrendingUp className="w-3 h-3" /> :
                 sovDelta < 0 ? <TrendingDown className="w-3 h-3" /> :
                 <Minus className="w-3 h-3" />}
                {Math.abs(sovDelta) > 0.5 && (
                  <span>{sovDelta > 0 ? "+" : ""}{sovDelta.toFixed(0)}pp</span>
                )}
              </div>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Twój udział w cytowaniach AI vs konkurencja
          </p>
        </div>
        {data.competitorCitationCount != null && (
          <div className="flex flex-col gap-0.5 ml-auto text-right">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Cytowania konkurencji</span>
            <span className="text-2xl font-bold tabular-nums text-red-400">
              {data.competitorCitationCount}
            </span>
          </div>
        )}
      </div>

      {/* SoV trend chart */}
      {sovTrend.length >= 2 && (
        <div className="rounded-lg bg-muted/20 p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">
            Trend Share of Voice
          </p>
          <SovTrendChart data={sovTrend} />
        </div>
      )}

      {/* Top competitors */}
      {competitors.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">
            Najczęściej cytowani konkurenci
          </p>
          <div className="rounded-lg border border-border/40 bg-muted/10 px-3 py-1">
            {competitors.slice(0, 5).map((c, i) => (
              <CompetitorRow
                key={c.domain}
                competitor={c}
                maxCount={maxCount}
                rank={i + 1}
              />
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Liczba cytowań w odpowiedziach AI podczas ostatniego cyklu monitoringu.
          </p>
        </div>
      )}

      {/* Per-engine breakdown */}
      {engines.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">
            Status cytowania per silnik AI
          </p>
          <div className="rounded-lg border border-border/40 bg-muted/10 px-3 py-1">
            {engines.map(([engine, breakdown]) => (
              <EngineCompetitiveRow
                key={engine}
                engine={engine}
                data={breakdown as EngineBreakdown}
              />
            ))}
          </div>
        </div>
      )}

      {data.recordedAt && (
        <p className="text-[10px] text-muted-foreground border-t border-border/30 pt-2">
          Ostatnia aktualizacja: {formatDate(data.recordedAt)}
        </p>
      )}
    </div>
  );
}
