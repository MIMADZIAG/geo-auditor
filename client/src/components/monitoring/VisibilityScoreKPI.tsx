/**
 * VisibilityScoreKPI — Profound-class Visibility Score trend chart
 *
 * Shows the AI Visibility Score as a primary KPI in the monitoring section,
 * with a dual-line trend chart (Visibility Score + Sentiment Score over time).
 *
 * Data source: visibility_snapshots table via trpc.monitoring.getVisibilityHistory
 */

import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { TrendingUp, TrendingDown, Minus, Eye, Loader2 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VisibilityPoint {
  recordedAt: Date | string;
  visibilityScore: number | null;
  sentimentScore: number | null;
  citedEnginesCount: number | null;
  totalEnginesChecked: number | null;
  visibilityRate: number | null;
  shareOfVoice: number | null;
  prominenceRate: number | null;
  sentimentLabel: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
}

function getSentimentColor(label: string | null): string {
  if (!label) return "text-zinc-400";
  if (label === "positive") return "text-emerald-400";
  if (label === "negative") return "text-red-400";
  return "text-amber-400";
}

function getSentimentLabel(label: string | null): string {
  if (!label) return "–";
  if (label === "positive") return "Pozytywny";
  if (label === "negative") return "Negatywny";
  return "Neutralny";
}

// ─── Mini SVG Sparkline ───────────────────────────────────────────────────────

function MiniSparkline({
  values,
  color,
  width = 80,
  height = 28,
}: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  });
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Main Dual-Line Chart ─────────────────────────────────────────────────────

function VisibilityTrendChart({ data }: { data: VisibilityPoint[] }) {
  const W = 320;
  const H = 80;
  const PAD = { top: 8, right: 8, bottom: 20, left: 28 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const visScores = data.map((d) => d.visibilityScore ?? 0);
  const sentScores = data.map((d) => d.sentimentScore ?? 50);

  const toPath = (values: number[]) => {
    const min = 0;
    const max = 100;
    const range = max - min;
    return values
      .map((v, i) => {
        const x = PAD.left + (i / Math.max(values.length - 1, 1)) * innerW;
        const y = PAD.top + innerH - ((v - min) / range) * innerH;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  };

  const xLabels = data
    .filter((_, i) => i === 0 || i === data.length - 1 || (data.length > 4 && i === Math.floor(data.length / 2)))
    .map((d, idx) => ({
      label: formatDate(d.recordedAt),
      x: PAD.left + (data.indexOf(d) / Math.max(data.length - 1, 1)) * innerW,
    }));

  const yTicks = [0, 25, 50, 75, 100];

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      {/* Grid lines */}
      {yTicks.map((tick) => {
        const y = PAD.top + innerH - (tick / 100) * innerH;
        return (
          <g key={tick}>
            <line
              x1={PAD.left}
              y1={y}
              x2={PAD.left + innerW}
              y2={y}
              stroke="currentColor"
              strokeOpacity={0.06}
              strokeWidth={1}
            />
            <text
              x={PAD.left - 4}
              y={y + 3}
              textAnchor="end"
              fontSize={7}
              fill="currentColor"
              fillOpacity={0.35}
            >
              {tick}
            </text>
          </g>
        );
      })}
      {/* Sentiment line (amber, dashed) */}
      <path
        d={toPath(sentScores)}
        fill="none"
        stroke="#f59e0b"
        strokeWidth={1.5}
        strokeDasharray="3 2"
        strokeOpacity={0.6}
        strokeLinecap="round"
      />
      {/* Visibility line (violet, solid) */}
      <path
        d={toPath(visScores)}
        fill="none"
        stroke="#8b5cf6"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Latest point dot */}
      {data.length > 0 && (() => {
        const last = data[data.length - 1]!;
        const x = PAD.left + innerW;
        const y = PAD.top + innerH - ((last.visibilityScore ?? 0) / 100) * innerH;
        return <circle cx={x} cy={y} r={3} fill="#8b5cf6" />;
      })()}
      {/* X-axis labels */}
      {xLabels.map(({ label, x }) => (
        <text
          key={label}
          x={x}
          y={H - 2}
          textAnchor="middle"
          fontSize={7}
          fill="currentColor"
          fillOpacity={0.4}
        >
          {label}
        </text>
      ))}
    </svg>
  );
}

// ─── KPI Stat Card ────────────────────────────────────────────────────────────

function KpiStat({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className={`text-lg font-bold tabular-nums ${color ?? "text-foreground"}`}>
        {value != null ? (
          <>
            {typeof value === "number" ? value.toFixed(0) : value}
            {unit && <span className="text-xs font-normal text-muted-foreground ml-0.5">{unit}</span>}
          </>
        ) : (
          <span className="text-muted-foreground text-sm">–</span>
        )}
      </span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function VisibilityScoreKPI({ monitoredPageId }: { monitoredPageId: number }) {
  const { data, isLoading } = trpc.monitoring.getVisibilityHistory.useQuery(
    { monitoredPageId, limit: 30 },
    { staleTime: 5 * 60_000 }
  );

  const latest = data && data.length > 0 ? data[data.length - 1] : null;
  const prev = data && data.length > 1 ? data[data.length - 2] : null;

  const trend = useMemo(() => {
    if (!latest?.visibilityScore || !prev?.visibilityScore) return null;
    const delta = latest.visibilityScore - prev.visibilityScore;
    if (Math.abs(delta) < 1) return { direction: "flat" as const, delta: 0 };
    return { direction: delta > 0 ? "up" as const : "down" as const, delta };
  }, [latest, prev]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Ładowanie danych widoczności…
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 p-4 text-center">
        <Eye className="w-5 h-5 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">
          Brak danych widoczności. Wyniki pojawią się po pierwszym cyklu monitoringu.
        </p>
      </div>
    );
  }

  const currentScore = latest?.visibilityScore ?? null;
  const sentimentLabel = latest?.sentimentLabel ?? null;
  const shareOfVoice = latest?.shareOfVoice != null ? Math.round(latest.shareOfVoice * 100) : null;
  const prominenceRate = latest?.prominenceRate != null ? Math.round(latest.prominenceRate * 100) : null;

  return (
    <div className="space-y-3">
      {/* Primary KPI row */}
      <div className="flex items-start justify-between gap-4">
        {/* Visibility Score */}
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">AI Visibility Score</span>
          <div className="flex items-end gap-1.5">
            <span className={`text-3xl font-bold tabular-nums ${
              currentScore == null ? "text-muted-foreground" :
              currentScore >= 70 ? "text-emerald-400" :
              currentScore >= 40 ? "text-amber-400" :
              "text-red-400"
            }`}>
              {currentScore != null ? Math.round(currentScore) : "–"}
            </span>
            <span className="text-sm text-muted-foreground mb-1">/100</span>
            {trend && (
              <div className={`flex items-center gap-0.5 mb-1 text-xs font-semibold ${
                trend.direction === "up" ? "text-emerald-400" :
                trend.direction === "down" ? "text-red-400" :
                "text-zinc-400"
              }`}>
                {trend.direction === "up" ? <TrendingUp className="w-3 h-3" /> :
                 trend.direction === "down" ? <TrendingDown className="w-3 h-3" /> :
                 <Minus className="w-3 h-3" />}
                {trend.delta !== 0 && (
                  <span>{trend.delta > 0 ? "+" : ""}{trend.delta.toFixed(0)}</span>
                )}
              </div>
            )}
          </div>
        </div>
        {/* Secondary KPIs */}
        <div className="flex gap-4">
          <KpiStat
            label="Sentiment"
            value={getSentimentLabel(sentimentLabel)}
            color={getSentimentColor(sentimentLabel)}
          />
          {shareOfVoice != null && (
            <KpiStat
              label="Share of Voice"
              value={shareOfVoice}
              unit="%"
              color={shareOfVoice >= 30 ? "text-emerald-400" : shareOfVoice >= 10 ? "text-amber-400" : "text-red-400"}
            />
          )}
          {prominenceRate != null && (
            <KpiStat
              label="Prominence"
              value={prominenceRate}
              unit="%"
              color="text-violet-400"
            />
          )}
        </div>
      </div>

      {/* Trend chart */}
      {data.length >= 2 && (
        <div className="rounded-lg bg-muted/20 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Trend widoczności</span>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <div className="w-3 h-0.5 bg-violet-500 rounded" />
                <span className="text-[9px] text-muted-foreground">Visibility</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-0.5 bg-amber-500/60 rounded border-dashed" style={{ borderTop: "1.5px dashed #f59e0b", background: "none" }} />
                <span className="text-[9px] text-muted-foreground">Sentiment</span>
              </div>
            </div>
          </div>
          <VisibilityTrendChart data={data} />
        </div>
      )}

      {/* Engine breakdown mini row */}
      {latest?.citedEnginesCount != null && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Eye className="w-3 h-3" />
          <span>
            Cytowana przez <strong className="text-foreground">{latest.citedEnginesCount}</strong> z{" "}
            <strong className="text-foreground">{latest.totalEnginesChecked ?? 4}</strong> silników AI
          </span>
          {latest.recordedAt && (
            <span className="ml-auto">{formatDate(latest.recordedAt)}</span>
          )}
        </div>
      )}
    </div>
  );
}
