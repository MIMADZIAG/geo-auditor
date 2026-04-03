/**
 * SentimentDashboard — Profound-class Sentiment Analysis View
 *
 * Shows how AI engines describe the monitored page/brand:
 * - Sentiment score (0-100) with positive/neutral/negative label
 * - Per-engine sentiment breakdown
 * - Detected themes (what AI says about the page)
 * - Sample AI responses with sentiment highlighting
 * - 5-point sentiment trend
 *
 * Data source: visibility_snapshots via trpc.monitoring.getSentimentDashboard
 */

import { trpc } from "@/lib/trpc";
import { Loader2, MessageSquare, TrendingUp, TrendingDown, Minus, Bot, Smile, Meh, Frown } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type SentimentLabel = "positive" | "neutral" | "negative" | null;

interface EngineBreakdown {
  cited: boolean;
  sentimentScore?: number;
  snippet?: string;
}

interface SampleResponse {
  engine: string;
  query: string;
  responseText: string;
  sentimentScore: number | null;
  themes: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ENGINE_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  google: "Google AI",
  perplexity: "Perplexity",
  gemini: "Gemini",
};

function sentimentColor(label: SentimentLabel): string {
  if (label === "positive") return "text-emerald-400";
  if (label === "negative") return "text-red-400";
  return "text-amber-400";
}

function sentimentBg(label: SentimentLabel): string {
  if (label === "positive") return "bg-emerald-500/10 border-emerald-500/20";
  if (label === "negative") return "bg-red-500/10 border-red-500/20";
  return "bg-amber-500/10 border-amber-500/20";
}

function sentimentIcon(label: SentimentLabel) {
  if (label === "positive") return <Smile className="w-4 h-4 text-emerald-400" />;
  if (label === "negative") return <Frown className="w-4 h-4 text-red-400" />;
  return <Meh className="w-4 h-4 text-amber-400" />;
}

function sentimentPolish(label: SentimentLabel): string {
  if (label === "positive") return "Pozytywny";
  if (label === "negative") return "Negatywny";
  return "Neutralny";
}

function scoreToLabel(score: number | null): SentimentLabel {
  if (score == null) return null;
  if (score >= 65) return "positive";
  if (score <= 35) return "negative";
  return "neutral";
}

function formatDate(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" });
}

// ─── Sentiment Score Gauge ────────────────────────────────────────────────────

function SentimentGauge({ score, label }: { score: number | null; label: SentimentLabel }) {
  const pct = score ?? 50;
  // Arc from -150deg to +150deg (300deg total)
  const R = 36;
  const cx = 44;
  const cy = 44;
  const startAngle = -210;
  const endAngle = 30;
  const totalDeg = endAngle - startAngle;
  const fillDeg = (pct / 100) * totalDeg;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const arcPath = (from: number, to: number, r: number) => {
    const x1 = cx + r * Math.cos(toRad(from));
    const y1 = cy + r * Math.sin(toRad(from));
    const x2 = cx + r * Math.cos(toRad(to));
    const y2 = cy + r * Math.sin(toRad(to));
    const large = to - from > 180 ? 1 : 0;
    return `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
  };

  const trackColor = "currentColor";
  const fillColor = label === "positive" ? "#34d399" : label === "negative" ? "#f87171" : "#fbbf24";

  return (
    <svg width={88} height={72} viewBox="0 0 88 72" className="text-border/30">
      {/* Track */}
      <path
        d={arcPath(startAngle, endAngle, R)}
        fill="none"
        stroke={trackColor}
        strokeWidth={6}
        strokeLinecap="round"
      />
      {/* Fill */}
      {score != null && (
        <path
          d={arcPath(startAngle, startAngle + fillDeg, R)}
          fill="none"
          stroke={fillColor}
          strokeWidth={6}
          strokeLinecap="round"
        />
      )}
      {/* Score text */}
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={14} fontWeight="700" fill={fillColor}>
        {score != null ? Math.round(score) : "–"}
      </text>
      <text x={cx} y={cy + 16} textAnchor="middle" fontSize={7} fill="currentColor" fillOpacity={0.5}>
        /100
      </text>
    </svg>
  );
}

// ─── Per-Engine Sentiment Row ─────────────────────────────────────────────────

function EngineRow({
  engine,
  data,
}: {
  engine: string;
  data: EngineBreakdown;
}) {
  const label = scoreToLabel(data.sentimentScore ?? null);
  const score = data.sentimentScore;
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-border/30 last:border-0">
      <Bot className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <span className="text-xs font-medium w-20 shrink-0">{ENGINE_LABELS[engine] ?? engine}</span>
      {data.cited ? (
        <>
          <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                label === "positive" ? "bg-emerald-500" :
                label === "negative" ? "bg-red-500" :
                "bg-amber-500"
              }`}
              style={{ width: `${score ?? 50}%` }}
            />
          </div>
          <span className={`text-xs font-semibold tabular-nums w-8 text-right ${sentimentColor(label)}`}>
            {score != null ? Math.round(score) : "–"}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${sentimentBg(label)} ${sentimentColor(label)}`}>
            {sentimentPolish(label)}
          </span>
        </>
      ) : (
        <span className="text-xs text-muted-foreground/50 italic">Nie cytuje</span>
      )}
    </div>
  );
}

// ─── Theme Pills ──────────────────────────────────────────────────────────────

function ThemePills({ themes }: { themes: string[] }) {
  if (themes.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {themes.map((t) => (
        <span
          key={t}
          className="text-[10px] px-2 py-0.5 rounded-full bg-primary/8 border border-primary/15 text-primary/70 font-medium"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

// ─── Sample Response Card ─────────────────────────────────────────────────────

function SampleCard({ sample }: { sample: SampleResponse }) {
  const label = scoreToLabel(sample.sentimentScore);
  return (
    <div className={`rounded-lg border p-3 ${sentimentBg(label)}`}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5">
          <Bot className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            {ENGINE_LABELS[sample.engine] ?? sample.engine}
          </span>
        </div>
        <div className={`flex items-center gap-1 text-[10px] font-semibold ${sentimentColor(label)}`}>
          {sentimentIcon(label)}
          {sentimentPolish(label)}
          {sample.sentimentScore != null && (
            <span className="text-muted-foreground font-normal">({Math.round(sample.sentimentScore)})</span>
          )}
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground italic mb-1.5">„{sample.query}"</p>
      <p className="text-xs text-foreground/80 leading-relaxed line-clamp-3">
        {sample.responseText}
      </p>
      {sample.themes.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {sample.themes.map((t) => (
            <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full bg-background/40 border border-border/40 text-muted-foreground">
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sentiment Mini Trend ─────────────────────────────────────────────────────

function SentimentTrend({
  trend,
}: {
  trend: Array<{
    recordedAt: Date | string;
    sentimentScore: number | null;
    sentimentLabel: string | null;
    visibilityScore: number | null;
  }>;
}) {
  if (trend.length < 2) return null;
  const latest = trend[trend.length - 1]!;
  const prev = trend[trend.length - 2]!;
  const delta = (latest.sentimentScore ?? 50) - (prev.sentimentScore ?? 50);

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Trend sentymentu</span>
      <div className={`flex items-center gap-0.5 text-xs font-semibold ${
        delta > 2 ? "text-emerald-400" :
        delta < -2 ? "text-red-400" :
        "text-zinc-400"
      }`}>
        {delta > 2 ? <TrendingUp className="w-3 h-3" /> :
         delta < -2 ? <TrendingDown className="w-3 h-3" /> :
         <Minus className="w-3 h-3" />}
        <span>{delta > 0 ? "+" : ""}{delta.toFixed(0)} pkt</span>
      </div>
      <span className="text-[10px] text-muted-foreground ml-auto">
        {trend.length} pomiarów
      </span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SentimentDashboard({ monitoredPageId }: { monitoredPageId: number }) {
  const { data, isLoading } = trpc.monitoring.getSentimentDashboard.useQuery(
    { monitoredPageId },
    { staleTime: 5 * 60_000 }
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Analizowanie tonu wzmianek…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 p-4 text-center">
        <MessageSquare className="w-5 h-5 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">
          Brak danych sentymentu. Analiza tonu pojawi się po pierwszym cyklu monitoringu z cytatami.
        </p>
      </div>
    );
  }

  const label = data.sentimentLabel as SentimentLabel;
  const engines = data.engineBreakdown ? Object.entries(data.engineBreakdown) : [];

  return (
    <div className="space-y-4">
      {/* Header: Gauge + summary */}
      <div className="flex items-start gap-4">
        <SentimentGauge score={data.sentimentScore} label={label} />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            {sentimentIcon(label)}
            <span className={`text-sm font-bold ${sentimentColor(label)}`}>
              {sentimentPolish(label)}
            </span>
            <span className="text-xs text-muted-foreground">
              — tak AI opisuje Twoją stronę
            </span>
          </div>
          {data.sentimentTrend && data.sentimentTrend.length >= 2 && (
            <SentimentTrend trend={data.sentimentTrend} />
          )}
          {data.recordedAt && (
            <p className="text-[10px] text-muted-foreground">
              Ostatnia analiza: {formatDate(data.recordedAt)}
            </p>
          )}
        </div>
      </div>

      {/* Themes */}
      {data.themes && data.themes.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">
            Tematy wykryte przez AI
          </p>
          <ThemePills themes={data.themes} />
        </div>
      )}

      {/* Per-engine breakdown */}
      {engines.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">
            Sentyment per silnik AI
          </p>
          <div className="rounded-lg border border-border/40 bg-muted/10 px-3 py-1">
            {engines.map(([engine, breakdown]) => (
              <EngineRow
                key={engine}
                engine={engine}
                data={breakdown as EngineBreakdown}
              />
            ))}
          </div>
        </div>
      )}

      {/* Sample responses */}
      {data.sampleResponses && data.sampleResponses.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">
            Przykładowe odpowiedzi AI
          </p>
          <div className="space-y-2">
            {data.sampleResponses.slice(0, 3).map((sample, i) => (
              <SampleCard key={i} sample={sample as SampleResponse} />
            ))}
          </div>
        </div>
      )}

      {/* Prominence */}
      {data.prominenceRate != null && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-border/30 pt-3">
          <span>Prominence Rate:</span>
          <span className="font-semibold text-violet-400">
            {Math.round(data.prominenceRate * 100)}%
          </span>
          <span className="text-[10px]">(jak wysoko w odpowiedzi AI pojawia się wzmianka)</span>
        </div>
      )}
    </div>
  );
}
