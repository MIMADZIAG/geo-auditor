import { useState, useCallback, useMemo, useEffect } from "react";
import { PhraseManager } from "@/components/PhraseManager";
import { VisibilityScoreKPI } from "@/components/monitoring/VisibilityScoreKPI";
import { SentimentDashboard } from "@/components/monitoring/SentimentDashboard";
import { CompetitorBenchmark } from "@/components/monitoring/CompetitorBenchmark";
import { getVisibilityScoreResult, ENGINE_CONFIG, ALL_ENGINES } from "../../../shared/visibilityScore";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  Zap, Eye, Clock, BarChart2, Plus, AlertTriangle, CheckCircle, CheckCircle2, XCircle,
  Lock, ChevronRight, RefreshCw, Star, Target, Sparkles, Shield,
  Globe, ArrowUpRight, Activity, FileText, Search, Bot, Trophy,
  Flame, Info, Brain, LogIn, History, TrendingUp, TrendingDown, Minus,
  ChevronDown, ChevronUp, LayoutDashboard, PenLine,
} from "lucide-react";
// Note: CheckCircle2 and XCircle are imported above for workflow status pills

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreColor(score: number | null | undefined): string {
  if (score == null) return "text-muted-foreground";
  if (score >= 75) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

function scoreBorderColor(score: number | null | undefined): string {
  if (score == null) return "border-muted";
  if (score >= 75) return "border-emerald-500";
  if (score >= 50) return "border-amber-500";
  return "border-red-500";
}

function scoreLabel(score: number | null | undefined): string {
  if (score == null) return "Brak danych";
  if (score >= 80) return "Świetny";
  if (score >= 65) return "Dobry";
  if (score >= 45) return "Wymaga pracy";
  return "Krytyczny";
}

function planLabel(plan: string): string {
  const map: Record<string, string> = { free: "Free", starter: "Starter", pro: "Pro", business: "Business" };
  return map[plan] ?? plan;
}

function planColorClass(plan: string): string {
  const map: Record<string, string> = {
    free: "bg-zinc-700/50 text-zinc-300 border border-zinc-600",
    starter: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
    pro: "bg-violet-500/20 text-violet-300 border border-violet-500/30",
    business: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
  };
  return map[plan] ?? "bg-zinc-700/50 text-zinc-300";
}

// ─── Usage Meter ─────────────────────────────────────────────────────────────

function UsageMeter({ used, limit, plan }: { used: number; limit: number; plan: string }) {
  const isUnlimited = limit > 9999;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const isWarning = pct >= 70;
  const isCritical = pct >= 90;

  return (
    <div className={`rounded-xl border p-4 transition-colors ${
      isCritical ? "border-red-500/30 bg-red-500/5" :
      isWarning ? "border-amber-500/30 bg-amber-500/5" :
      "border-border bg-card"
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Activity className={`w-4 h-4 ${isCritical ? "text-red-400" : isWarning ? "text-amber-400" : "text-muted-foreground"}`} />
          <span className="text-sm font-medium">Audyty w tym miesiącu</span>
        </div>
        <span className={`text-sm font-bold tabular-nums ${isCritical ? "text-red-400" : isWarning ? "text-amber-400" : "text-foreground"}`}>
          {used} / {isUnlimited ? "∞" : limit}
        </span>
      </div>
      {!isUnlimited && (
        <Progress
          value={pct}
          className={`h-1.5 ${isCritical ? "[&>div]:bg-red-500" : isWarning ? "[&>div]:bg-amber-500" : "[&>div]:bg-violet-500"}`}
        />
      )}
      {isCritical && plan !== "business" && (
        <p className="text-xs text-red-400 mt-2 flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          Prawie wyczerpany limit —{" "}
          <Link href="/pricing" className="underline font-medium hover:text-red-300">rozszerz plan</Link>
        </p>
      )}
      {isWarning && !isCritical && plan !== "business" && (
        <p className="text-xs text-amber-400 mt-2 flex items-center gap-1.5">
          <Info className="w-3 h-3 shrink-0" />
          Zostało {limit - used} audytów —{" "}
          <Link href="/pricing" className="underline font-medium hover:text-amber-300">rozważ upgrade</Link>
        </p>
      )}
      {!isWarning && !isUnlimited && plan === "free" && (
        <p className="text-xs text-muted-foreground mt-2">
          Plan Free: {limit - used} audytów do końca miesiąca.{" "}
          <Link href="/pricing" className="text-violet-400 hover:text-violet-300 underline">Upgrade</Link>
        </p>
      )}
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon, label, value, sub, colorClass, iconColor,
}: {
  icon: React.ElementType; label: string; value: string | number;
  sub?: string; colorClass?: string; iconColor?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        <Icon className={`w-4 h-4 ${iconColor ?? ""}`} />
        <span className="text-xs">{label}</span>
      </div>
      <span className={`text-2xl font-bold tabular-nums ${colorClass ?? "text-foreground"}`}>{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

// ─── Locked Feature Card ──────────────────────────────────────────────────────

function LockedFeatureCard({
  icon: Icon, title, description, requiredPlan,
}: {
  icon: React.ElementType; title: string; description: string; requiredPlan: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-4 relative overflow-hidden group cursor-default">
      <div className="absolute inset-0 bg-background/70 backdrop-blur-[2px] flex flex-col items-center justify-center z-10 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl">
        <Lock className="w-5 h-5 text-violet-400 mb-2" />
        <span className="text-xs text-center text-muted-foreground px-4">
          Dostępne w planie <span className="text-violet-400 font-semibold">{requiredPlan}</span>
        </span>
        <Link href="/pricing">
          <Button size="sm" className="mt-3 bg-violet-600 hover:bg-violet-700 text-white text-xs h-7 gap-1">
            <Zap className="w-3 h-3" /> Odblokuj
          </Button>
        </Link>
      </div>
      <div className="flex items-start gap-3 opacity-60">
        <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-violet-400" />
        </div>
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <div className="absolute top-2 right-2">
        <Lock className="w-3.5 h-3.5 text-muted-foreground/40" />
      </div>
    </div>
  );
}

// ─── Audit Row ────────────────────────────────────────────────────────────────

type AuditItem = {
  id: number;
  url: string;
  overallScore: number | null;
  status: string;
  createdAt: Date | string;
  llmTopPriority?: string | null;
  llmDifficulty?: string | null;
  llmScoreGain?: number | null;
  pageTitle?: string | null;
};

type CitationStatusSummary = { status: string; citedCount: number; totalEngines: number } | undefined;

function CitationBadge({ cs }: { cs: CitationStatusSummary }) {
  if (!cs) return null;
  if (cs.status === "completed") {
    const isCited = cs.citedCount > 0;
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold border"
        style={{
          color: isCited ? "oklch(0.72 0.18 145)" : "oklch(0.65 0.22 25)",
          background: isCited ? "oklch(0.72 0.18 145 / 0.12)" : "oklch(0.65 0.22 25 / 0.10)",
          borderColor: isCited ? "oklch(0.72 0.18 145 / 0.3)" : "oklch(0.65 0.22 25 / 0.3)",
        }}
      >
        <Eye className="w-2.5 h-2.5" />
        {isCited ? `${cs.citedCount}/${cs.totalEngines} AI` : "0 AI"}
      </span>
    );
  }
  if (cs.status === "running" || cs.status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold border border-primary/25 bg-primary/8 text-primary">
        <div className="w-2 h-2 border border-primary border-t-transparent rounded-full animate-spin" />
        AI…
      </span>
    );
  }
  return null;
}

function AuditRow({ audit, citationStatus }: { audit: AuditItem; citationStatus?: CitationStatusSummary }) {
  const score = audit.overallScore;
  const domain = (() => { try { return new URL(audit.url).hostname; } catch { return audit.url; } })();
  const path = (() => { try { const u = new URL(audit.url); return u.pathname === "/" ? "" : u.pathname; } catch { return ""; } })();
  const date = new Date(audit.createdAt).toLocaleDateString("pl-PL", { day: "numeric", month: "short" });

  return (
    <Link href={`/results/${audit.id}`}>
      <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors group cursor-pointer">
        <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center shrink-0 font-bold text-sm ${scoreBorderColor(score)} ${scoreColor(score)}`}>
          {score != null ? Math.round(score) : "–"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{audit.pageTitle || domain}</p>
          <p className="text-xs text-muted-foreground truncate">{domain}{path}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-muted-foreground">{date}</span>
            <CitationBadge cs={citationStatus} />
            {audit.llmScoreGain != null && audit.llmScoreGain > 0 && (
              <span className="text-xs text-violet-400 font-medium">+{audit.llmScoreGain} pkt potencjału</span>
            )}
            {audit.llmDifficulty === "easy" && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-medium">Łatwa naprawa</span>
            )}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
      </div>
    </Link>
  );
}

// ─── Sparkline ───────────────────────────────────────────────────────────────

// Citation Sparkline: renders 0-4 values as step-line with color gradient
function CitationSparkline({ values, total = 4, width = 120, height = 32 }: { values: number[]; total?: number; width?: number; height?: number }) {
  const pts = useMemo(() => {
    if (values.length < 2) return null;
    const step = width / (values.length - 1);
    return values.map((v, i) => {
      const x = i * step;
      const y = height - (v / total) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  }, [values, total, width, height]);
  if (!pts) return null;
  const lastVal = values[values.length - 1];
  const color = lastVal === 0 ? "#f87171" : lastVal >= total ? "#34d399" : lastVal >= total / 2 ? "#fbbf24" : "#f87171";
  const lastPt = pts.split(" ").pop()!.split(",");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.8"
      />
      <circle cx={lastPt[0]} cy={lastPt[1]} r="2.5" fill={color} />
    </svg>
  );
}

function Sparkline({ values, width = 120, height = 32 }: { values: number[]; width?: number; height?: number }) {
  const pts = useMemo(() => {
    if (values.length < 2) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const step = width / (values.length - 1);
    return values.map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  }, [values, width, height]);

  if (!pts) return null;

  const lastVal = values[values.length - 1];
  const color = lastVal >= 75 ? "#34d399" : lastVal >= 50 ? "#fbbf24" : "#f87171";
  const lastPt = pts.split(" ").pop()!.split(",");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.8"
      />
      <circle cx={lastPt[0]} cy={lastPt[1]} r="2.5" fill={color} />
    </svg>
  );
}

// ─── Engine Breakdown Row ───────────────────────────────────────────────────
/**
 * Shows 4 engine icons (ChatGPT, Google AI, Perplexity, Gemini) with color-coded
 * cited/not-cited state. Used in MonitoredPageCard header and AICitationPanel.
 */
type EngineBreakdownItem = { engine: string; cited: boolean; citedUrl: string | null; query: string | null };

function EngineBreakdownRow({
  breakdown,
  size = "sm",
}: {
  breakdown: EngineBreakdownItem[];
  size?: "sm" | "md";
}) {
  const iconSize = size === "md" ? "w-5 h-5" : "w-4 h-4";
  const dotSize = size === "md" ? "w-2 h-2" : "w-1.5 h-1.5";

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1.5">
        {ALL_ENGINES.map((engine) => {
          const cfg = ENGINE_CONFIG[engine];
          const item = breakdown.find((b) => b.engine === engine);
          const cited = item?.cited ?? false;
          return (
            <Tooltip key={engine}>
              <TooltipTrigger asChild>
                <div className="relative cursor-default">
                  {/* Engine initial pill */}
                  <div
                    className={`${iconSize} rounded flex items-center justify-center text-[9px] font-bold border transition-all ${
                      cited
                        ? "border-transparent text-white"
                        : "border-border/50 text-muted-foreground/50 bg-muted/20"
                    }`}
                    style={cited ? { backgroundColor: cfg.color, borderColor: cfg.color } : {}}
                  >
                    {cfg.shortLabel[0]}
                  </div>
                  {/* Status dot */}
                  <div
                    className={`absolute -bottom-0.5 -right-0.5 ${dotSize} rounded-full border border-background ${
                      cited ? "bg-emerald-400" : "bg-zinc-600"
                    }`}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs max-w-52">
                <p className="font-semibold mb-0.5">{cfg.label}</p>
                {cited ? (
                  <p className="text-emerald-400">✓ Cytuje tę stronę</p>
                ) : (
                  <p className="text-muted-foreground">Nie cytuje tej strony</p>
                )}
                {item?.query && (
                  <p className="text-muted-foreground mt-0.5 truncate">Zapytanie: {item.query}</p>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

// ─── AI Visibility Score Badge ────────────────────────────────────────────────
/**
 * Replaces the raw "2/4" fraction with a 0–100 score + tier label.
 * One number, immediately understood by a marketing director.
 */
function AIVisibilityScoreBadge({
  citedEngines,
  totalEngines,
  size = "sm",
}: {
  citedEngines: number | null | undefined;
  totalEngines: number | null | undefined;
  size?: "sm" | "lg";
}) {
  const result = getVisibilityScoreResult(citedEngines, totalEngines);
  const hasData = citedEngines != null && totalEngines != null;

  if (!hasData) return null;

  if (size === "lg") {
    return (
      <div className={`flex flex-col items-center px-4 py-3 rounded-xl border ${result.bgClass}`}>
        <span className={`text-3xl font-bold tabular-nums ${result.colorClass}`}>{result.score}</span>
        <span className="text-[10px] text-muted-foreground mt-0.5">/ 100</span>
        <span className={`text-xs font-semibold mt-1 ${result.colorClass}`}>{result.label}</span>
      </div>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-bold tabular-nums cursor-default ${result.bgClass} ${result.colorClass}`}>
          <Eye className="w-3 h-3" />
          <span>{result.score}</span>
          <span className="font-normal opacity-60 text-[10px]">/100</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs max-w-56">
        <p className="font-semibold mb-1">Widoczność AI: {result.label}</p>
        <p className="text-muted-foreground">{result.description}</p>
        <p className="text-muted-foreground mt-1 text-[10px]">Cytowana przez {citedEngines} z {totalEngines} silników AI</p>
      </TooltipContent>
    </Tooltip>
  );
}

// ─── AI Visibility Timeline ───────────────────────────────────────────────────
/**
 * Dual-line SVG chart: AI Score trend (violet) + AI Visibility Score trend (emerald/amber/red).
 * Replaces the two separate sparklines with one unified view.
 */
function AIVisibilityTimeline({
  scoreValues,
  citationValues,
  citationTotal = 4,
  width = 280,
  height = 56,
}: {
  scoreValues: number[];
  citationValues: number[];
  citationTotal?: number;
  width?: number;
  height?: number;
}) {
  const pts = useMemo(() => {
    const len = Math.max(scoreValues.length, citationValues.length);
    if (len < 2) return null;

    const step = width / (len - 1);
    const pad = 4;

    const scoreLine = scoreValues.map((v, i) => {
      const x = i * step;
      const y = height - (v / 100) * (height - pad * 2) - pad;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");

    const citeLine = citationValues.map((v, i) => {
      const x = i * step;
      const score = Math.round((v / citationTotal) * 100);
      const y = height - (score / 100) * (height - pad * 2) - pad;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");

    return { scoreLine, citeLine };
  }, [scoreValues, citationValues, citationTotal, width, height]);

  if (!pts) return null;

  const lastCite = citationValues[citationValues.length - 1] ?? 0;
  const citeColor = lastCite >= citationTotal ? "#34d399" : lastCite > 0 ? "#fbbf24" : "#f87171";

  const scoreLastPt = pts.scoreLine.split(" ").pop()!.split(",");
  const citeLastPt = pts.citeLine.split(" ").pop()!.split(",");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      {/* Score line — violet */}
      {scoreValues.length >= 2 && (
        <>
          <polyline points={pts.scoreLine} fill="none" stroke="#8b5cf6" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
          <circle cx={scoreLastPt[0]} cy={scoreLastPt[1]} r="2.5" fill="#8b5cf6" />
        </>
      )}
      {/* Citation line — dynamic color */}
      {citationValues.length >= 2 && (
        <>
          <polyline points={pts.citeLine} fill="none" stroke={citeColor} strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
          <circle cx={citeLastPt[0]} cy={citeLastPt[1]} r="2.5" fill={citeColor} />
        </>
      )}
    </svg>
  );
}

// ─── Monitored Page Card ──────────────────────────────────────────────────────
type MonitoredPageItem = {
  id: number;
  url: string;
  label: string | null;
  lastScore: number | null;
  lastAuditAt: Date | null;
  lastAuditId: number | null;
  nextAuditAt?: Date | null;
  scheduleFrequency?: number | null;
  // AI Citation Visibility — from last citation check
  lastCitedEngines?: number | null;
  lastTotalEngines?: number | null;
  lastCitationAt?: Date | null;
};

const FREQUENCY_OPTIONS = [
  { value: "1", label: "Codziennie", days: 1 },
  { value: "3", label: "Co 3 dni", days: 3 },
  { value: "7", label: "Co tydzień", days: 7 },
  { value: "14", label: "Co 2 tygodnie", days: 14 },
  { value: "30", label: "Co miesiąc", days: 30 },
];

function MonitoredPageCard({
  page,
  onRemove,
  isPro,
  isStarter,
  citationStatus,
}: {
  page: MonitoredPageItem;
  onRemove: (id: number) => void;
  isPro: boolean;
  isStarter: boolean;
  citationStatus?: CitationStatusSummary;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const [activeMonitorTab, setActiveMonitorTab] = useState<"history" | "visibility" | "sentiment" | "competitors">("history");
  const score = page.lastScore;
  const domain = (() => { try { return new URL(page.url).hostname; } catch { return page.url; } })();

  // Feature 3: Phrase coverage indicator — how many monitored phrases were cited
  const phraseCoverageQuery = trpc.monitoring.getPhraseCoverage.useQuery(
    { monitoredPageId: page.id },
    { staleTime: 60_000 }
  );
  const phraseCoverage = phraseCoverageQuery.data;

  const historyQuery = trpc.monitoring.getRunHistory.useQuery(
    { monitoredPageId: page.id, limit: 10 },
    { enabled: showHistory }
  );
  // Citation snapshots for trend sparkline (loaded with history)
  const snapshotsQuery = trpc.monitoring.getSnapshots.useQuery(
    { monitoredPageId: page.id, limit: 10 },
    { enabled: showHistory }
  );
  // Per-engine breakdown — lazy-loaded when history is opened
  const engineBreakdownQuery = trpc.monitoring.getEngineBreakdown.useQuery(
    { monitoredPageId: page.id },
    { enabled: showHistory && page.lastCitedEngines != null, staleTime: 120_000 }
  );
  const runs = historyQuery.data ?? [];
  const snapshots = snapshotsQuery.data ?? [];
  const engineBreakdown = engineBreakdownQuery.data ?? [];
  const sparklineValues = useMemo(
    () => [...runs].reverse().map((r) => r.overallScore ?? 0).filter((v) => v > 0),
    [runs]
  );
  // Citation sparkline: values from score_snapshots ordered oldest-first
  const citationSparklineValues = useMemo(() => {
    const ordered = [...snapshots].reverse();
    return ordered
      .filter((s) => s.citedEnginesCount != null)
      .map((s) => s.citedEnginesCount as number);
  }, [snapshots]);
  const citationTotal = snapshots.find((s) => s.totalEnginesChecked != null)?.totalEnginesChecked ?? 4;

  // Current citation status from monitored_pages (fast, no extra query)
  const hasCitationData = page.lastCitedEngines != null;
  const citedEngines = page.lastCitedEngines ?? 0;
  const totalEngines = page.lastTotalEngines ?? 4;
  const visibilityResult = getVisibilityScoreResult(hasCitationData ? citedEngines : null, hasCitationData ? totalEngines : null);
  const lastAudit = page.lastAuditAt
    ? new Date(page.lastAuditAt).toLocaleDateString("pl-PL", { day: "numeric", month: "short" })
    : "Brak danych";
  const nextAudit = page.nextAuditAt
    ? new Date(page.nextAuditAt).toLocaleDateString("pl-PL", { day: "numeric", month: "short" })
    : null;
  const currentFreq = String(page.scheduleFrequency ?? 7);

  // ── Citation job state — spinner + Run Citation button ───────────────────────────────────────
  const utils = trpc.useUtils();
  const activeCitationJobQuery = trpc.monitoring.getActiveCitationJob.useQuery(
    { monitoredPageId: page.id },
    { staleTime: 8_000, refetchInterval: (data) => {
        const status = data?.state?.data?.status;
        return (status === "pending" || status === "running") ? 5_000 : false;
      }
    }
  );
  const isRunningCitation = activeCitationJobQuery.data?.status === "pending" || activeCitationJobQuery.data?.status === "running";
  const runCitationMutation = trpc.monitoring.runCitationCheck.useMutation({
    onSuccess: (data) => {
      if (data.alreadyRunning) {
        toast.info("⏳ Analiza widoczności AI jest już uruchomiona.");
      } else {
        toast.success("✅ Analiza uruchomiona — wyniki za chwilę.");
      }
      activeCitationJobQuery.refetch();
    },
    onError: (err) => toast.error(err.message || "Nie udało się uruchomić analizy. Spróbuj ponownie."),
  });
  // When job transitions from running → completed, refresh monitored pages list
  const prevRunningRef = useState<boolean>(false);
  if (prevRunningRef[0] !== isRunningCitation) {
    prevRunningRef[1](isRunningCitation);
    if (prevRunningRef[0] && !isRunningCitation && activeCitationJobQuery.data?.status === "completed") {
      utils.monitoring.list.invalidate();
    }
  }
  const setFrequency = trpc.monitoring.setFrequency.useMutation({
    onSuccess: (data) => {
      const label = FREQUENCY_OPTIONS.find((o) => o.days === data.frequencyDays)?.label ?? `co ${data.frequencyDays} dni`;
      toast.success(`Częstotliwość zmieniona: ${label}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleFrequencyChange = useCallback((val: string) => {
    const days = parseInt(val, 10);
    if (!isNaN(days)) {
      setFrequency.mutate({ id: page.id, frequencyDays: days });
    }
  }, [page.id, setFrequency]);

  const canChangeFrequency = isPro;
  const isMonitoringEligible = isPro || isStarter;

  return (
    <TooltipProvider>
      <div className={`rounded-xl border p-4 bg-card ${
        score == null ? "border-border" :
        score >= 75 ? "border-emerald-500/20" :
        score >= 50 ? "border-amber-500/20" :
        "border-red-500/20"
      }`}>
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{page.label || domain}</p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{page.url}</p>
          </div>
          {/* Dual metric: AI Score + AI Visibility Score */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {/* AI Readiness Score */}
            <div className={`text-2xl font-bold tabular-nums ${scoreColor(score)}`}>
              {score != null ? Math.round(score) : "–"}
            </div>
            {/* AI Visibility Score badge — replaces raw 2/4 fraction */}
            {isRunningCitation ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-semibold border-violet-500/30 bg-violet-500/10 text-violet-400 cursor-default">
                    <div className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                    <span>AI...</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-56">
                  <p className="font-semibold mb-1">Analiza widoczności AI w toku</p>
                  <p className="text-muted-foreground">Sprawdzamy widoczność Twojej strony w ChatGPT, Perplexity, Gemini i Google AI. Wyniki pojawią się za 2–5 minut.</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              <AIVisibilityScoreBadge
                citedEngines={hasCitationData ? citedEngines : null}
                totalEngines={hasCitationData ? totalEngines : null}
              />
            )}
            {/* Feature 3: Phrase coverage pill */}
            {phraseCoverage && phraseCoverage.total > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border cursor-help ${
                    phraseCoverage.cited === 0
                      ? "bg-zinc-500/10 border-zinc-500/20 text-zinc-400"
                      : phraseCoverage.cited === phraseCoverage.total
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                      : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                  }`}>
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    {phraseCoverage.cited}/{phraseCoverage.total}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left" className="text-xs max-w-48">
                  {phraseCoverage.cited} z {phraseCoverage.total} monitorowanych fraz zostało ostatnio zacytowanych przez AI.
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Frequency row */}
        {isMonitoringEligible && (
          <div className="mt-3 flex items-center gap-2">
            <RefreshCw className="w-3 h-3 text-muted-foreground shrink-0" />
            {canChangeFrequency ? (
              <Select
                value={currentFreq}
                onValueChange={handleFrequencyChange}
                disabled={setFrequency.isPending}
              >
                <SelectTrigger className="h-6 text-xs w-36 border-border bg-background">
                  <SelectValue placeholder="Częstotliwość" />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 cursor-help">
                    <span className="text-xs text-muted-foreground">Co tydzień</span>
                    <Lock className="w-3 h-3 text-muted-foreground" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-48">
                  Zmiana częstotliwości dostępna w planie Pro. Starter obsługuje wyłącznie cotygodniowy monitoring.
                </TooltipContent>
              </Tooltip>
            )}
            {nextAudit && (
              <span className="text-xs text-muted-foreground ml-auto">Następny: {nextAudit}</span>
            )}
          </div>
        )}

        {/* Actions row */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 mt-3">
          <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            <Clock className="w-3 h-3" />
            <span className="whitespace-nowrap">Ostatni: {lastAudit}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 ml-auto">
            <Button
              size="sm"
              variant="ghost"
              className={`h-6 text-xs gap-1 ${
                showHistory ? "text-violet-400 bg-violet-500/10" : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setShowHistory((v) => !v)}
            >
              <History className="w-3 h-3" />
              Historia
            </Button>
            {page.lastAuditId && (
              <>
                <Link href={`/results/${page.lastAuditId}`}>
                  <Button size="sm" variant="outline" className="h-6 text-xs">Raport</Button>
                </Link>
                {/* Link to AI Visibility Monitor — dedicated per-phrase tracking view */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link href="/pulse">
                      <Button
                        size="sm"
                        variant="outline"
                        className={`h-6 text-xs gap-1 ${
                          hasCitationData
                            ? citedEngines > 0
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15"
                              : "border-red-500/30 bg-red-500/8 text-red-400 hover:bg-red-500/15"
                            : "hover:border-violet-500/40 hover:bg-violet-500/10 hover:text-violet-400"
                        }`}
                      >
                        {isRunningCitation ? (
                          <div className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                        ) : hasCitationData ? (
                          citedEngines > 0
                            ? <CheckCircle2 className="w-3 h-3" />
                            : <XCircle className="w-3 h-3" />
                        ) : (
                          <Eye className="w-3 h-3" />
                        )}
                        {isRunningCitation
                          ? "Sprawdzam..."
                          : hasCitationData
                            ? `${citedEngines}/${totalEngines} silników`
                            : "Monitor"}
                      </Button>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs max-w-56">
                    {isRunningCitation
                      ? "Analiza widoczności AI jest w toku. Wyniki pojawią się za 2–5 minut."
                      : hasCitationData
                        ? `Widoczność w AI: ${citedEngines}/${totalEngines} silników. Kliknij, aby zobaczyć szczegóły w AI Visibility Monitor.`
                        : "Otwórz AI Visibility Monitor, aby śledzić cytowania tej strony per fraza i per silnik."}
                  </TooltipContent>
                </Tooltip>
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
              onClick={(e) => { e.preventDefault(); onRemove(page.id); }}
            >
              Usuń
            </Button>
          </div>
        </div>

        {/* Workflow Status — 3-step progress: Audit → Visibility → Content */}
        <div className="mt-3 border-t border-border/50 pt-3">
          <div className="flex items-center gap-1.5">
            {/* Step 1: Audyt */}
            <div className={`flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
              score != null
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                : "bg-zinc-500/10 border-zinc-500/20 text-zinc-500"
            }`}>
              {score != null
                ? <CheckCircle2 className="w-2.5 h-2.5" />
                : <Shield className="w-2.5 h-2.5" />
              }
              <span>Audyt{score != null ? ` · ${Math.round(score)}` : ""}</span>
            </div>
            <div className={`h-px w-3 ${
              hasCitationData ? "bg-emerald-500/40" : "bg-border/40"
            }`} />
            {/* Step 2: Widoczność */}
            <div className={`flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
              hasCitationData
                ? citedEngines > 0
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  : "bg-red-500/10 border-red-500/20 text-red-400"
                : "bg-zinc-500/10 border-zinc-500/20 text-zinc-500"
            }`}>
              {hasCitationData
                ? citedEngines > 0
                  ? <CheckCircle2 className="w-2.5 h-2.5" />
                  : <XCircle className="w-2.5 h-2.5" />
                : <Eye className="w-2.5 h-2.5" />
              }
              <span>Widoczność{hasCitationData ? ` · ${citedEngines}/${totalEngines}` : ""}</span>
            </div>
            <div className="h-px w-3 bg-border/40" />
            {/* Step 3: Treść */}
            {page.lastAuditId ? (
              <Link href={`/results/${page.lastAuditId}?tab=content`}>
                <div className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-primary/8 border-primary/20 text-primary/70 hover:bg-primary/15 hover:text-primary transition-colors cursor-pointer">
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>Treść AI</span>
                </div>
              </Link>
            ) : (
              <div className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-zinc-500/10 border-zinc-500/20 text-zinc-500">
                <Sparkles className="w-2.5 h-2.5" />
                <span>Treść AI</span>
              </div>
            )}
          </div>
        </div>

        {/* Phrase Manager — stable monitoring phrases */}
        {isMonitoringEligible && (
          <div className="mt-3 border-t border-border pt-3">
            <PhraseManager
              monitoredPageId={page.id}
              plan={isPro ? "pro" : isStarter ? "starter" : "free"}
              compact
            />
          </div>
        )}

        {/* Profound-class monitoring panel with tabs */}
        {showHistory && (
          <div className="mt-3 border-t border-border pt-3">
            {/* Tab navigation */}
            <div className="flex items-center gap-0.5 mb-3 bg-muted/30 rounded-lg p-0.5">
              {([
                { id: "history", label: "Historia", icon: History },
                { id: "visibility", label: "Visibility Score", icon: Eye },
                { id: "sentiment", label: "Sentiment", icon: Brain },
                { id: "competitors", label: "Konkurencja", icon: BarChart2 },
              ] as const).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveMonitorTab(id)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-colors flex-1 justify-center ${
                    activeMonitorTab === id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>

            {/* Visibility Score KPI tab */}
            {activeMonitorTab === "visibility" && (
              <VisibilityScoreKPI monitoredPageId={page.id} />
            )}

            {/* Sentiment Dashboard tab */}
            {activeMonitorTab === "sentiment" && (
              <SentimentDashboard monitoredPageId={page.id} />
            )}

            {/* Competitor Benchmark tab */}
            {activeMonitorTab === "competitors" && (
              <CompetitorBenchmark monitoredPageId={page.id} />
            )}

            {/* History tab */}
            {activeMonitorTab === "history" && (
            <div>
            {historyQuery.isLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>Ładowanie historii…</span>
              </div>
            ) : runs.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                Brak analiz. Wpisz URL na stronie głównej, żeby zobaczyć wyniki.
              </p>
            ) : (
              <>
                {/* ── AI Visibility Timeline: unified dual-line chart ── */}
                {sparklineValues.length >= 2 && (
                  <div className="mb-3">
                    {/* Legend row */}
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-0.5 rounded bg-violet-500 inline-block" /> AI Score
                        </span>
                        {citationSparklineValues.length >= 2 && isPro && (
                          <span className="flex items-center gap-1">
                            <span className="w-2.5 h-0.5 rounded bg-emerald-400 inline-block" /> Widoczność AI
                          </span>
                        )}
                      </div>
                      {/* Delta summary */}
                      {(() => {
                        const scoreDelta = sparklineValues[sparklineValues.length - 1] - sparklineValues[0];
                        const Icon = scoreDelta > 0 ? TrendingUp : scoreDelta < 0 ? TrendingDown : Minus;
                        const cls = scoreDelta > 0 ? "text-emerald-400" : scoreDelta < 0 ? "text-red-400" : "text-muted-foreground";
                        return (
                          <div className={`flex items-center gap-1 text-xs font-semibold ${cls}`}>
                            <Icon className="w-3 h-3" />
                            <span>{scoreDelta > 0 ? "+" : ""}{scoreDelta.toFixed(0)} pkt</span>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Dual-line chart (Pro) or single score line (Starter/Free) */}
                    {isPro ? (
                      <AIVisibilityTimeline
                        scoreValues={sparklineValues}
                        citationValues={citationSparklineValues}
                        citationTotal={citationTotal}
                        width={220}
                        height={48}
                      />
                    ) : (
                      <div className="relative">
                        <AIVisibilityTimeline
                          scoreValues={sparklineValues}
                          citationValues={[]}
                          width={220}
                          height={48}
                        />
                        {citationSparklineValues.length >= 2 && (
                          <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <Lock className="w-3 h-3 text-violet-400" />
                            <Link href="/pricing" className="text-violet-400 hover:text-violet-300 underline">
                              Odblokuj trend widoczności AI → Pro
                            </Link>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Per-engine breakdown — shown when data is available */}
                    {engineBreakdown.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-border/40 flex items-center justify-between">
                        <p className="text-[10px] text-muted-foreground">Silniki AI:</p>
                        <EngineBreakdownRow breakdown={engineBreakdown} size="sm" />
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-1.5">
                  {runs.map((run) => {
                    const runDate = new Date(run.createdAt).toLocaleDateString("pl-PL", {
                      day: "numeric", month: "short", year: "numeric",
                    });
                    const runTime = new Date(run.createdAt).toLocaleTimeString("pl-PL", {
                      hour: "2-digit", minute: "2-digit",
                    });
                    const s = run.overallScore;
                    const delta = run.scoreDelta;
                    return (
                      <div key={run.id} className="flex items-center justify-between gap-2 py-1 px-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            run.status === "failed" ? "bg-red-500" :
                            s != null && s >= 75 ? "bg-emerald-500" :
                            s != null && s >= 50 ? "bg-amber-500" : "bg-red-500"
                          }`} />
                          <div className="min-w-0">
                            <p className="text-xs font-medium">{runDate}</p>
                            <p className="text-xs text-muted-foreground">{runTime}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {run.status === "failed" ? (
                            <span className="text-xs text-red-400">Błąd</span>
                          ) : (
                            <>
                              {delta != null && delta !== 0 && (
                                <span className={`text-xs ${
                                  delta > 0 ? "text-emerald-400" : "text-red-400"
                                }`}>
                                  {delta > 0 ? "+" : ""}{delta.toFixed(0)}
                                </span>
                              )}
                              <span className={`text-sm font-bold tabular-nums ${scoreColor(s)}`}>
                                {s != null ? Math.round(s) : "–"}
                              </span>
                            </>
                          )}
                          {run.auditId && (
                            <Link href={`/results/${run.auditId}`}>
                              <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground">
                                <ChevronRight className="w-3 h-3" />
                              </Button>
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                    </div>
              </>
            )}
            </div>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

// ─── Dashboard Nav ────────────────────────────────────────────────────────────

function DashboardTopNav({ plan, user }: { plan: string; user?: { name?: string | null } | null }) {
  const { logout } = useAuth();

  return (
    <header className="sticky top-0 z-40">
      <div className="glass-strong border-b border-border/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
                <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shadow-sm shadow-primary/20">
                  <Bot className="w-4 h-4 text-primary-foreground" />
                </div>
                <span className="text-sm font-bold tracking-tight">GEO-Auditor</span>
              </div>
            </Link>
            <div className="h-4 w-px bg-border/50 hidden md:block" />
            <nav className="hidden md:flex items-center gap-1">
              <Link href="/hub">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary/8 text-primary">
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  AI HUB
                </div>
              </Link>
              <Link href="/pulse">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
                  <Eye className="w-3.5 h-3.5" />
                  AI Visibility Monitor
                </div>
              </Link>
              <Link href="/page-creator">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
                  <Sparkles className="w-3.5 h-3.5" />
                  Signal Rewrite
                </div>
              </Link>
              <Link href="/pricing">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
                  Plany
                </div>
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            {user?.name && (
              <span className="text-xs text-muted-foreground hidden sm:block">{user.name}</span>
            )}
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${planColorClass(plan)}`}>
              {planLabel(plan)}
            </span>
            <Link href="/">
              <Button size="sm" className="gap-1.5 h-8 text-xs shadow-md shadow-primary/20">
                <Plus className="w-3.5 h-3.5" /> Nowa analiza
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="text-xs text-muted-foreground h-8 hidden sm:flex hover:text-foreground"
            >
              Wyloguj
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="h-14 border-b border-border bg-background/95" />
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="h-8 bg-muted/30 rounded-lg w-64 animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-card border border-border animate-pulse" />
          ))}
        </div>
        <div className="h-16 rounded-xl bg-card border border-border animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-80 rounded-xl bg-card border border-border animate-pulse" />
          <div className="h-80 rounded-xl bg-card border border-border animate-pulse" />
        </div>
      </div>
    </div>
  );
}

// ─── Not Authenticated ────────────────────────────────────────────────────────

function NotAuthenticated() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border h-14 flex items-center px-4">
        <Link href="/">
          <div className="flex items-center gap-2 font-bold text-lg cursor-pointer">
            <Brain className="w-5 h-5 text-violet-400" />
            <span>GEO<span className="text-violet-400">-Auditor</span></span>
          </div>
        </Link>
      </header>
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-violet-500/10 flex items-center justify-center mx-auto mb-6">
            <LogIn className="w-8 h-8 text-violet-400" />
          </div>
          <h2 className="text-2xl font-bold mb-3">Sprawdź, czy AI poleca Twoją stronę</h2>
          <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
            Zaloguj się i uruchom pierwszą analizę. Wynik gotowy w 30 sekund — za darmo.
          </p>
          <Button
            onClick={() => (window.location.href = getLoginUrl())}
            className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
          >
            <LogIn className="w-4 h-4" />
            Zaloguj się za darmo
          </Button>
          <p className="text-xs text-muted-foreground mt-4">
            Bez karty kredytowej. 1 analiza dziennie gratis.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── AI Visibility AI HUB Hero ───────────────────────────────────────

function AIVisibilityCommandCenter({
  monitoredPages,
  usageStats,
  isPro,
  onAddMonitoring,
}: {
  monitoredPages: MonitoredPageItem[] | undefined;
  usageStats: ReturnType<typeof trpc.audit.getUsageStats.useQuery>["data"];
  isPro: boolean;
  onAddMonitoring: () => void;
}) {
  const pagesWithData = (monitoredPages ?? []).filter((p) => p.lastCitedEngines != null);
  const hasData = pagesWithData.length > 0;
  const hasPages = (monitoredPages ?? []).length > 0;

  // Aggregate visibility score across all monitored pages
  const totalCited = pagesWithData.reduce((sum, p) => sum + (p.lastCitedEngines ?? 0), 0);
  const totalPossible = pagesWithData.reduce((sum, p) => sum + (p.lastTotalEngines ?? 4), 0);
  const avgVisScore = hasData ? Math.round((totalCited / totalPossible) * 100) : null;
  const visResult = hasData
    ? getVisibilityScoreResult(totalCited / pagesWithData.length, pagesWithData[0]?.lastTotalEngines ?? 4)
    : null;
  const citedPages = pagesWithData.filter((p) => (p.lastCitedEngines ?? 0) > 0).length;

  // Weakest page — lowest visibility score
  const weakestPage = hasData
    ? [...pagesWithData].sort((a, b) => (a.lastCitedEngines ?? 0) - (b.lastCitedEngines ?? 0))[0]
    : null;

  if (!hasPages) {
    // Empty state — no monitored pages yet
    return (
      <div className="rounded-2xl border border-dashed border-violet-500/30 bg-violet-500/5 p-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center mx-auto mb-4">
          <Eye className="w-6 h-6 text-violet-400" />
        </div>
        <h2 className="text-base font-semibold mb-1">AI Visibility Check</h2>
        <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
          Dodaj pierwszą stronę do monitoringu, aby śledzić jej widoczność w ChatGPT, Google AI, Perplexity i Gemini.
        </p>
        <Button
          size="sm"
          className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5"
          onClick={onAddMonitoring}
        >
          <Plus className="w-3.5 h-3.5" /> Dodaj stronę do monitoringu
        </Button>
      </div>
    );
  }

  if (!hasData) {
    // Pages exist but no citation data yet
    return (
      <div className="rounded-2xl border border-border bg-card p-6 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
          <Eye className="w-5 h-5 text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold">AI Visibility Check</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {(monitoredPages ?? []).length} stron w monitoringu — oczekiwanie na pierwsze dane widoczności.
          </p>
        </div>
        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border p-5 ${visResult?.bgClass ?? "border-border bg-card"}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Eye className={`w-4 h-4 ${visResult?.colorClass ?? "text-violet-400"}`} />
          <span className="text-sm font-semibold">AI Visibility Check</span>
          <Badge variant="secondary" className="text-xs">{(monitoredPages ?? []).length} stron</Badge>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="text-xs gap-1 h-7 text-muted-foreground hover:text-foreground"
          onClick={onAddMonitoring}
        >
          <Plus className="w-3 h-3" /> Dodaj stronę
        </Button>
      </div>

      {/* Main metrics row */}
      <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-start sm:items-center">
        {/* Big score */}
        <div className="flex items-end gap-1.5 shrink-0">
          <span className={`text-5xl font-bold tabular-nums leading-none ${visResult?.colorClass}`}>
            {avgVisScore}
          </span>
          <div className="pb-1">
            <span className="text-sm text-muted-foreground">/100</span>
            <p className={`text-xs font-semibold ${visResult?.colorClass}`}>{visResult?.label}</p>
          </div>
        </div>

        <div className="w-px h-12 bg-border/60 shrink-0 hidden sm:block" />

        {/* Stats */}
        <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Cytowane strony</p>
            <p className="text-lg font-bold tabular-nums">{citedPages}<span className="text-sm text-muted-foreground font-normal">/{pagesWithData.length}</span></p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Sprawdzeń silników</p>
            <p className="text-lg font-bold tabular-nums">{totalCited}<span className="text-sm text-muted-foreground font-normal">/{totalPossible}</span></p>
          </div>
          {weakestPage && (
            <div>
              <p className="text-xs text-muted-foreground">Najsłabsza strona</p>
              <p className="text-xs font-medium truncate max-w-[140px]">
                {(() => { try { return new URL(weakestPage.url).pathname || "/"; } catch { return weakestPage.url; } })()}
              </p>
              <p className={`text-xs ${getVisibilityScoreResult(weakestPage.lastCitedEngines ?? 0, weakestPage.lastTotalEngines ?? 4).colorClass}`}>
                {weakestPage.lastCitedEngines ?? 0}/{weakestPage.lastTotalEngines ?? 4} silników
              </p>
            </div>
          )}
        </div>

        {/* Engine breakdown */}
        <div className="shrink-0 flex items-center gap-1.5">
          {ALL_ENGINES.map((engine) => {
            const cfg = ENGINE_CONFIG[engine];
            return (
              <TooltipProvider key={engine}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="w-7 h-7 rounded-lg text-[10px] font-bold flex items-center justify-center text-white shadow-sm"
                      style={{ backgroundColor: cfg.color }}
                    >
                      {cfg.shortLabel[0]}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">{cfg.label}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>

        {/* Pro upgrade CTA */}
        {!isPro && (
          <Link href="/pricing" className="shrink-0">
            <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white text-xs gap-1 h-8">
              <TrendingUp className="w-3 h-3" /> Trend AI
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user, loading: authLoading, isAuthenticated, logout } = useAuth();
  const [newUrl, setNewUrl] = useState("");
  const [showAddMonitoring, setShowAddMonitoring] = useState(false);
  const utils = trpc.useUtils();

  const { data: history, isLoading: historyLoading } = trpc.audit.myHistory.useQuery(
    { limit: 10 },
    { enabled: isAuthenticated }
  );
  const { data: monitoredPages, isLoading: monitoringLoading } = trpc.monitoring.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );
  const { data: planData } = trpc.payments.getMyPlan.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );
  const { data: usageStats } = trpc.audit.getUsageStats.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  // Hash-based scroll: navigate("/dashboard#pulse") from Results header
  useEffect(() => {
    if (window.location.hash === "#pulse") {
      const el = document.getElementById("pulse");
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 400);
      }
    }
  }, [monitoringLoading]);

  // Citation status batch — one query for all audits in history + monitored pages
  const historyAuditIds = (history ?? []).map((a) => a.id);
  const monitoredAuditIds = (monitoredPages ?? []).filter((p) => p.lastAuditId != null).map((p) => p.lastAuditId!);
  const auditIds = Array.from(new Set([...historyAuditIds, ...monitoredAuditIds]));
  const { data: citationStatuses } = trpc.citation.getStatusBatch.useQuery(
    { auditIds },
    { enabled: auditIds.length > 0, staleTime: 60_000 }
  );

  const addMonitoring = trpc.monitoring.add.useMutation({
    onSuccess: () => {
      utils.monitoring.list.invalidate();
      setNewUrl("");
      setShowAddMonitoring(false);
      toast.success("✅ Strona dodana — będziemy śledzili jej widoczność w AI.");
    },
    onError: (e) => toast.error(e.message),
  });
  const removeMonitoring = trpc.monitoring.remove.useMutation({
    onSuccess: () => {
      utils.monitoring.list.invalidate();
      toast.success("Strona usunięta z obserwacji.");
    },
    onError: (e) => toast.error(e.message),
  });
  // MUST be before any early returns — Rules of Hooks
  const [auditHistoryExpanded, setAuditHistoryExpanded] = useState(true);

  if (authLoading) return <DashboardSkeleton />;
  if (!isAuthenticated) return <NotAuthenticated />;

  const plan = planData?.plan ?? "free";
  const limits = planData?.limits;
  const auditsLimit = limits?.auditsPerMonth ?? 5;
  const monitoringLimit = limits?.monitoredPages ?? 1;
  const auditsUsed = usageStats?.auditsThisMonth ?? 0;
  const avgScore = usageStats?.avgScore;
  const bestScore = usageStats?.bestScore;
  const totalAudits = usageStats?.totalAudits ?? 0;

  const isPaid = plan !== "free";
  const isPro = plan === "pro" || plan === "business";
  const isBusiness = plan === "business";

  const hour = new Date().getHours();
  const greetingEmoji = hour < 12 ? "☀️" : hour < 18 ? "⚡" : "🌙";
  const greeting = hour < 12 ? "Dzień dobry" : hour < 18 ? "Cześć" : "Dobry wieczór";
  const firstName = user?.name?.split(" ")[0] ?? "Użytkownik u";

  // Hero subline: contextual progress message
  const lastAudit = history?.[0];
  const lastAuditDate = lastAudit?.createdAt
    ? (() => {
        const d = new Date(lastAudit.createdAt);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        if (d.toDateString() === today.toDateString()) return "dziś";
        if (d.toDateString() === yesterday.toDateString()) return "wczoraj";
        return d.toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
      })()
    : null;
  const bestAudit = history?.reduce((best, a) =>
    (a.overallScore ?? 0) > (best?.overallScore ?? 0) ? a : best,
    null as typeof history[0] | null
  );
  const bestAuditUrl = bestAudit?.url
    ? (() => { try { return new URL(bestAudit.url).hostname.replace(/^www\./, ""); } catch { return bestAudit.url; } })()
    : null;

  // Signal Rewrite: count content-related recommendations from last audit
  type AuditRec = { category: string; priority: string; title?: string; description?: string };
  const lastAuditRecs: AuditRec[] = (() => {
    try {
      const raw = lastAudit?.recommendations as { recommendations?: AuditRec[] } | null;
      return raw?.recommendations ?? [];
    } catch { return []; }
  })();
  const contentRewriteCount = lastAuditRecs.filter(
    (r) => r.category === "Content Structure" || r.category === "E-E-A-T"
  ).length;

  const handleAddMonitoring = () => {
    if (!newUrl.trim()) return;
    let url = newUrl.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }
    addMonitoring.mutate({ url });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">

      {/* ── LEFT SIDEBAR ── */}
      <aside className="w-56 shrink-0 flex flex-col border-r border-border/40 bg-card/30 hidden lg:flex">
        {/* Logo */}
        <div className="h-14 flex items-center gap-2 px-4 border-b border-border/30">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shadow-sm shadow-primary/20">
                <Bot className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="text-sm font-bold tracking-tight">GEO-Auditor</span>
            </div>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 flex flex-col gap-0.5 overflow-y-auto">
          {/* Primary CTA — always at top */}
          <Link href="/">
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors mb-2 shadow-sm shadow-primary/30">
              <Zap className="w-3.5 h-3.5" />
              Nowa analiza
            </div>
          </Link>

          {/* Main nav — no section labels, active state speaks for itself */}
          {/* AI HUB — active, violet highlight */}
          <Link href="/hub">
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold bg-violet-500/10 border border-violet-500/20 text-violet-400">
              <LayoutDashboard className="w-3.5 h-3.5" />
              AI HUB
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            </div>
          </Link>
          <Link href="/audit">
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
              <Search className="w-3.5 h-3.5" />
              AI Audit
            </div>
          </Link>
          <Link href="/ai-monitoring">
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
              <Eye className="w-3.5 h-3.5" />
              AI Monitoring
            </div>
          </Link>
          <Link href="/page-creator">
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
              <PenLine className="w-3.5 h-3.5" />
              AI Writer
            </div>
          </Link>
          <Link href="/pricing">
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
              <Star className="w-3.5 h-3.5" />
              Plany i cennik
            </div>
          </Link>

          {/* Content Creator upsell widget — PLG growth hook for new pages */}
          <div className="mt-auto pt-3">
            <Link href="/page-creator">
              <div className="rounded-xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/8 via-teal-500/5 to-transparent p-3 cursor-pointer hover:border-emerald-500/40 hover:from-emerald-500/12 transition-all group">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <PenLine className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
                  <span className="text-[11px] font-bold text-emerald-300">AI Writer</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-snug">
                  Uwaga! Możesz tworzyć także zoptymalizowane pod AI Search — od zera, gotowe do publikacji.
                </p>
                <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-emerald-400 group-hover:gap-1.5 transition-all">
                  Stwórz świetny content <ChevronRight className="w-3 h-3" />
                </div>
              </div>
            </Link>
          </div>
        </nav>

        {/* User + Plan footer */}
        <div className="px-3 py-4 border-t border-border/30 space-y-2">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${planColorClass(plan)}`}>
            {isBusiness ? <Trophy className="w-3.5 h-3.5" /> : isPro ? <Star className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
            <span className="font-semibold">{planLabel(plan)}</span>
          </div>
          {user?.name && (
            <div className="px-3 py-1.5 text-xs text-muted-foreground truncate">{user.name}</div>
          )}
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            <LogIn className="w-3.5 h-3.5 rotate-180" />
            Wyloguj
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top nav */}
        <div className="lg:hidden">
          <DashboardTopNav plan={plan} user={user} />
        </div>

        <div className="flex-1 overflow-y-auto">
          <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">

            {/* ── HERO: Greeting + ScoreOrb ── */}
            <div className="rounded-2xl border border-border/40 bg-gradient-to-br from-card via-card to-primary/3 p-6 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-violet-500/5 pointer-events-none" />
              <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    <span className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold">AI HUB</span>
                  </div>
                  <h1 className="text-2xl font-black tracking-tight mb-1">{greeting}, {firstName} {greetingEmoji}</h1>
                  <p className="text-sm text-muted-foreground">
                    {totalAudits === 0
                      ? "Pierwszy krok: sprawdź swoją stronę produktową → wynik w 30 sekund."
                      : "Twój panel widoczności AI Search."
                    }
                  </p>
                  {totalAudits === 0 ? (
                    /* Onboarding empty state — animated first step CTA */
                    <div className="mt-4 flex flex-col gap-3">
                      <Link href="/">
                        <Button className="gap-2 h-10 px-5 text-sm font-bold shadow-lg shadow-primary/30 animate-pulse hover:animate-none">
                          <Zap className="w-4 h-4" /> Sprawdź pierwszą stronę →
                        </Button>
                      </Link>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex gap-1">
                          {["Strona produktowa", "Artykuł blogowy", "Strona usługi"].map((hint) => (
                            <Link key={hint} href={`/?hint=${encodeURIComponent(hint)}`}>
                              <span className="px-2 py-0.5 rounded-full border border-border/40 hover:border-primary/40 hover:text-foreground transition-colors cursor-pointer">{hint}</span>
                            </Link>
                          ))}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-3 mt-4">
                      <Link href="/">
                        <Button className="gap-2 h-9 px-4 text-sm font-semibold shadow-md shadow-primary/20">
                          <Zap className="w-3.5 h-3.5" /> Wykonaj kolejny audyt →
                        </Button>
                      </Link>
                      {(monitoredPages ?? []).length === 0 && (
                        <Button variant="outline" className="gap-2 h-9 px-4 text-sm" onClick={() => setShowAddMonitoring(true)}>
                          <Eye className="w-3.5 h-3.5" /> Dodaj do monitoringu
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                {/* Score Orb */}
                {avgScore != null ? (
                  <div className="flex flex-col items-center gap-2 shrink-0">
                    <div className="relative w-28 h-28">
                      <svg width="112" height="112" viewBox="0 0 112 112" className="rotate-[-90deg]" aria-hidden="true">
                        <circle cx="56" cy="56" r="48" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                        <circle
                          cx="56" cy="56" r="48" fill="none"
                          stroke={avgScore >= 75 ? "oklch(0.72 0.18 145)" : avgScore >= 50 ? "oklch(0.75 0.18 80)" : "oklch(0.65 0.22 25)"}
                          strokeWidth="8" strokeLinecap="round"
                          strokeDasharray={`${2 * Math.PI * 48}`}
                          strokeDashoffset={`${2 * Math.PI * 48 * (1 - avgScore / 100)}`}
                          style={{ transition: "stroke-dashoffset 1.2s ease-out" }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className={`text-3xl font-black tabular-nums leading-none ${avgScore >= 75 ? "text-emerald-400" : avgScore >= 50 ? "text-amber-400" : "text-red-400"}`}>{avgScore}</span>
                        <span className="text-[10px] text-muted-foreground">/100</span>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground font-medium">AI Readiness Score</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 shrink-0">
                    <div className="w-28 h-28 rounded-full border-4 border-dashed border-border/40 flex items-center justify-center">
                      <span className="text-2xl text-muted-foreground/30">?</span>
                    </div>
                    <span className="text-xs text-muted-foreground">Brak danych</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── LAST AUDIT CARD ── */}
            {lastAudit && (
              <div className="rounded-2xl border border-border bg-card/60 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ostatni audyt</span>
                      <span className="text-xs text-muted-foreground">{lastAuditDate}</span>
                    </div>
                    <p className="text-sm font-semibold truncate mb-1">
                      {lastAudit.pageTitle || (() => { try { return new URL(lastAudit.url).hostname; } catch { return lastAudit.url; } })()}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mb-3">{lastAudit.url}</p>
                    {lastAuditRecs.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground font-medium">Top poprawki:</p>
                        {lastAuditRecs.slice(0, 3).map((r, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                              r.priority === 'critical' ? 'bg-red-400' :
                              r.priority === 'high' ? 'bg-amber-400' : 'bg-emerald-400'
                            }`} />
                            <span className="text-foreground/80 leading-snug">{r.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div className={`w-16 h-16 rounded-full border-2 flex items-center justify-center font-black text-xl ${
                      (lastAudit.overallScore ?? 0) >= 75 ? 'border-emerald-500 text-emerald-400' :
                      (lastAudit.overallScore ?? 0) >= 50 ? 'border-amber-500 text-amber-400' :
                      'border-red-500 text-red-400'
                    }`}>
                      {lastAudit.overallScore != null ? Math.round(lastAudit.overallScore) : '–'}
                    </div>
                    <span className="text-[10px] text-muted-foreground">/100</span>
                    <Link href={`/results/${lastAudit.id}`}>
                      <Button size="sm" variant="outline" className="text-xs h-7 mt-1 gap-1">
                        Otwórz <ChevronRight className="w-3 h-3" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            )}

        {/* ── STATS ROW ── */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            icon={BarChart2}
            label="ŚrednI wynik gotowości na AI"
            value={avgScore != null ? `${avgScore}/100` : "–"}
            sub={scoreLabel(avgScore)}
            colorClass={scoreColor(avgScore)}
            iconColor={scoreColor(avgScore)}
          />
          <StatCard
            icon={Trophy}
            label="Najlepszy wynik audytu"
            value={bestScore != null ? `${bestScore}/100` : "–"}
            sub={bestScore != null ? "Rekord konta" : "Brak danych"}
            colorClass={bestScore != null && bestScore >= 75 ? "text-emerald-400" : bestScore != null ? "text-amber-400" : undefined}
            iconColor={bestScore != null && bestScore >= 75 ? "text-emerald-400" : "text-amber-400"}
          />
          <StatCard
            icon={Flame}
            label="Analizy w tym miesiącu"
            value={`${auditsUsed}/${auditsLimit > 9999 ? "∞" : auditsLimit}`}
            sub={`Limit planu ${planLabel(plan)}`}
            iconColor="text-orange-400"
          />
        </div>

        {/* UsageMeter removed — duplicates the StatCard „Analizy w tym miesiącu” above */}
        {/* ── MONITORED PAGES GRID ── */}
        {(monitoredPages ?? []).length > 0 && (
          <div id="pulse">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                <Eye className="w-4 h-4" /> Strony pod obserwacją
              </h2>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs gap-1 h-7 text-muted-foreground hover:text-foreground"
                onClick={() => setShowAddMonitoring(!showAddMonitoring)}
              >
                <Plus className="w-3 h-3" /> Dodaj stronę
              </Button>
            </div>

            {showAddMonitoring && (
              <div className="rounded-xl border border-border bg-card p-4 mb-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="https://twoja-strona.pl/produkt"
                    className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 text-foreground placeholder:text-muted-foreground"
                    onKeyDown={(e) => e.key === "Enter" && handleAddMonitoring()}
                  />
                  <Button
                    size="sm"
                    className="bg-violet-600 hover:bg-violet-700 text-white shrink-0"
                    onClick={handleAddMonitoring}
                    disabled={addMonitoring.isPending}
                  >
                    {addMonitoring.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Dodaj"}
                  </Button>
                  <Button size="sm" variant="ghost" className="shrink-0 text-muted-foreground" onClick={() => setShowAddMonitoring(false)}>Anuluj</Button>
                </div>
                {!isPaid && (
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    Plan Free: 1 monitorowana strona.{" "}
                    <Link href="/pricing" className="text-violet-400 underline">Upgrade</Link> dla więcej.
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(monitoredPages ?? []).map((page) => (
                <MonitoredPageCard
                  key={page.id}
                  page={page}
                  onRemove={(id) => removeMonitoring.mutate({ id })}
                  isPro={isPro}
                  isStarter={plan === "starter"}
                  citationStatus={page.lastAuditId != null ? citationStatuses?.[page.lastAuditId] : undefined}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── PULSE MONITOR EMPTY STATE ── */}
        {(monitoredPages ?? []).length === 0 && !monitoringLoading && isPaid && (
          <div id="pulse" className="rounded-2xl border border-dashed border-violet-500/30 bg-gradient-to-br from-violet-500/5 to-violet-600/3 p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-violet-500/15 flex items-center justify-center shrink-0">
                <Eye className="w-6 h-6 text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-sm font-bold">AI Visibility Monitor</h2>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/20">Aktywny</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-lg">
                  Dodaj pierwszą stronę, aby automatycznie śledzić jej widoczność w ChatGPT, Perplexity, Google AI i Gemini.
                  Co tydzień otrzymasz raport — kto Cię cytuje, kto Cię wyprzedza i jakie luki możesz wypełnić.
                </p>
                <div className="flex flex-wrap gap-3 mt-3">
                  {["Automatyczne sprawdzanie co tydzień", "Alerty o zmianach cytowań", "Analiza konkurencji AI", "Trend Share of Voice"].map((f) => (
                    <span key={f} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <CheckCircle2 className="w-3 h-3 text-violet-400 shrink-0" /> {f}
                    </span>
                  ))}
                </div>
              </div>
              <Button
                size="sm"
                className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5 text-xs shrink-0"
                onClick={() => setShowAddMonitoring(true)}
              >
                <Plus className="w-3 h-3" /> Dodaj pierwszą stronę
              </Button>
            </div>
            {showAddMonitoring && (
              <div className="mt-4 rounded-xl border border-border bg-card p-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="https://twoja-strona.pl/produkt"
                    className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 text-foreground placeholder:text-muted-foreground"
                    onKeyDown={(e) => e.key === "Enter" && handleAddMonitoring()}
                  />
                  <Button
                    size="sm"
                    className="bg-violet-600 hover:bg-violet-700 text-white shrink-0"
                    onClick={handleAddMonitoring}
                    disabled={addMonitoring.isPending}
                  >
                    {addMonitoring.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Dodaj"}
                  </Button>
                  <Button size="sm" variant="ghost" className="shrink-0 text-muted-foreground" onClick={() => setShowAddMonitoring(false)}>Anuluj</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── MAIN GRID: Audit History + Sidebar ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* LEFT — Audit History (collapsible) */}
          <div id="audits" className="lg:col-span-2 space-y-3">
            <button
              className="w-full flex items-center justify-between text-sm font-semibold hover:text-foreground text-muted-foreground transition-colors"
              onClick={() => setAuditHistoryExpanded(!auditHistoryExpanded)}
            >
              <span className="flex items-center gap-2">
                <Clock className="w-4 h-4" /> Historia analiz
                {history && history.length > 0 && (
                  <Badge variant="secondary" className="text-xs">{history.length}</Badge>
                )}
              </span>
              {auditHistoryExpanded
                ? <ChevronUp className="w-4 h-4" />
                : <ChevronDown className="w-4 h-4" />}
            </button>

            {auditHistoryExpanded && (
              <>
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  {historyLoading ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">Wczytuję historię…</div>
                  ) : !history || history.length === 0 ? (
                    <div className="p-10 text-center">
                      <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-sm font-medium">Brak analiz</p>
                      <p className="text-xs text-muted-foreground mt-1 mb-4">
                        Wklej URL dowolnej podstrony i uruchom pierwszą analizę Signal Audit.
                      </p>
                      <Link href="/">
                        <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white">
                          Analizuj stronę
                        </Button>
                      </Link>
                    </div>
                  ) : history.length === 1 ? (
                    // #13 — First success onboarding: highlight the one audit with next step
                    <div>
                      <div className="px-5 py-3 border-b border-border/30 bg-gradient-to-r from-primary/5 to-transparent">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          <span className="text-xs font-semibold text-emerald-400">Pierwszy Signal Audit gotowy</span>
                        </div>
                      </div>
                      <AuditRow audit={history[0]} citationStatus={citationStatuses?.[history[0].id]} />
                      {/* First success CTA — Anton: what to do next */}
                      <div className="px-5 py-4 border-t border-border/30 bg-muted/20">
                        <p className="text-xs font-semibold mb-2">Co zrobić teraz?</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <Link href={`/results/${history[0].id}`}>
                            <div className="flex items-center gap-2 p-2.5 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer">
                              <Shield className="w-3.5 h-3.5 text-primary shrink-0" />
                              <div>
                                <p className="text-xs font-semibold">Przeglądaj rekomendacje</p>
                                <p className="text-[10px] text-muted-foreground">Wdroż 3 najważniejsze poprawki</p>
                              </div>
                            </div>
                          </Link>
                          <Link href={`/results/${history[0].id}?tab=visibility`}>
                            <div className="flex items-center gap-2 p-2.5 rounded-lg border border-border/40 hover:border-border hover:bg-muted/30 transition-colors cursor-pointer">
                              <Eye className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <div>
                                <p className="text-xs font-semibold">Sprawdź cytowania AI</p>
                                <p className="text-[10px] text-muted-foreground">ChatGPT, Gemini, Perplexity</p>
                              </div>
                            </div>
                          </Link>
                          <Link href="/">
                            <div className="flex items-center gap-2 p-2.5 rounded-lg border border-border/40 hover:border-border hover:bg-muted/30 transition-colors cursor-pointer">
                              <Zap className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <div>
                                <p className="text-xs font-semibold">Analizuj kolejną stronę</p>
                                <p className="text-[10px] text-muted-foreground">Porównaj podstrony</p>
                              </div>
                            </div>
                          </Link>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {history.map((audit) => (
                        <AuditRow key={audit.id} audit={audit} citationStatus={citationStatuses?.[audit.id]} />
                      ))}
                    </div>
                  )}
                </div>

                {!isPaid && history && history.length >= 3 && (
                  <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-violet-300">Widzisz tylko ostatnie analizy</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Starter odblokowuje pełną historię Signal Audit, eksport PDF i AI Visibility Monitor dla 10 podstron.
                      </p>
                    </div>
                    <Link href="/pricing">
                      <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white shrink-0 text-xs gap-1">
                        <Zap className="w-3 h-3" /> Upgrade
                      </Button>
                    </Link>
                  </div>
                )}
              </>
            )}

            {!auditHistoryExpanded && history && history.length > 0 && (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <AuditRow audit={history[0]} citationStatus={citationStatuses?.[history[0].id]} />
                <button
                  className="w-full py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors flex items-center justify-center gap-1"
                  onClick={() => setAuditHistoryExpanded(true)}
                >
                  <ChevronDown className="w-3 h-3" /> Pokaż wszystkie {history.length} analiz
                </button>
              </div>
            )}

            {!history || history.length === 0 && (
              <div className="rounded-xl border border-dashed border-border p-6 text-center">
                <p className="text-sm text-muted-foreground">Brak analiz — każdy Signal Audit pojawi się tutaj z wynikiem i listą poprawek.</p>
                <Link href="/"><Button size="sm" className="mt-3 bg-violet-600 hover:bg-violet-700 text-white">Analizuj stronę</Button></Link>
              </div>
            )}
          </div>

          {/* RIGHT — Plan + Quick Actions */}
          <div className="space-y-4">

            {/* Plan card */}
            <div className={`rounded-xl border p-5 ${
              isBusiness ? "border-amber-500/30 bg-amber-500/5" :
              isPro ? "border-violet-500/30 bg-violet-500/5" :
              plan === "starter" ? "border-blue-500/30 bg-blue-500/5" :
              "border-border bg-card"
            }`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs text-muted-foreground">Twój plan</p>
                  <p className="text-xl font-bold mt-0.5">{planLabel(plan)}</p>
                </div>
                {isBusiness ? <Trophy className="w-8 h-8 text-amber-400" /> :
                 isPro ? <Star className="w-8 h-8 text-violet-400" /> :
                 plan === "starter" ? <Zap className="w-8 h-8 text-blue-400" /> :
                 <Shield className="w-8 h-8 text-muted-foreground" />}
              </div>

              {plan === "free" && (
                <>
                  <p className="text-xs text-muted-foreground mb-3">Odblokuj pełną platformę Signal Audit</p>
                  <div className="space-y-1.5 mb-4">
                    {["50 analiz/mies.", "Pełna historia Signal Audit", "AI Visibility Monitor — 10 stron", "Eksport PDF"].map((f) => (
                      <div key={f} className="flex items-center gap-2 text-xs">
                        <CheckCircle className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                  <Link href="/pricing">
                    <Button className="w-full bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold gap-1.5">
                      <Zap className="w-3.5 h-3.5" /> Starter — $39/mies.
                    </Button>
                  </Link>
                </>
              )}

              {plan === "starter" && (
                <>
                  <p className="text-xs text-muted-foreground mb-3">Odblokuj AI Visibility Check dla 3 konkurentów i 200 analiz/mies.</p>
                  <Link href="/pricing">
                    <Button className="w-full bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold gap-1.5">
                      <ArrowUpRight className="w-3.5 h-3.5" /> Upgrade do Pro — $99/mies.
                    </Button>
                  </Link>
                </>
              )}

              {isPro && !isBusiness && (
                <>
                  <p className="text-xs text-muted-foreground mb-3">Odblokuj white-label raporty, API i integracje Shopify/WooCommerce.</p>
                  <Link href="/pricing">
                    <Button className="w-full bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold gap-1.5">
                      <Trophy className="w-3.5 h-3.5" /> Upgrade do Business
                    </Button>
                  </Link>
                </>
              )}

              {isBusiness && (
                <p className="text-xs text-emerald-400 flex items-center gap-1.5 mt-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Pełny dostęp do platformy
                </p>
              )}
            </div>

            {/* Quick Actions */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Target className="w-4 h-4 text-muted-foreground" /> Szybkie akcje
              </h3>
              <div className="space-y-2">
                <Link href="/">
                  <Button variant="outline" className="w-full justify-start gap-2 text-sm h-9">
                    <Search className="w-4 h-4 text-violet-400" /> Uruchom Signal Audit
                  </Button>
                </Link>
                <Link href="/page-creator">
                  <Button variant="outline" className="w-full justify-start gap-2 text-sm h-9">
                    <Sparkles className="w-4 h-4 text-emerald-400" /> Signal Rewrite
                  </Button>
                </Link>
                <Link href="/pricing">
                  <Button variant="outline" className="w-full justify-start gap-2 text-sm h-9">
                    <Star className="w-4 h-4 text-amber-400" /> Plany
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* ── LOCKED FEATURES ── */}
        {!isPro && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Lock className="w-4 h-4 text-muted-foreground" /> Moduły Pro i Business
              </h2>
              <Link href="/pricing">
                <Button size="sm" variant="ghost" className="text-xs text-violet-400 hover:text-violet-300 gap-1 h-7">
                  Zobacz plany <ChevronRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <LockedFeatureCard
                icon={BarChart2}
                title="AI Visibility Check Pro"
                description="Porównaj cytowania AI swojej domeny z 3 wybranymi konkurentami na tych samych frazach."
                requiredPlan="Pro"
              />
              <LockedFeatureCard
                icon={FileText}
                title="Eksport PDF"
                description="Pobierz pełny raport Signal Audit w formacie PDF gotowy do prezentacji klientowi."
                requiredPlan="Starter"
              />
              <LockedFeatureCard
                icon={Globe}
                title="AI Visibility Monitor — 50 stron"
                description="Cotygodniowy re-audyt dla całego sklepu. Alert gdy AI Readiness Score spada."
                requiredPlan="Pro"
              />
            </div>
          </div>
        )}

        {/* ── TIP ── */}
        <div className="rounded-xl border border-border bg-card/50 p-5 flex flex-col md:flex-row items-start md:items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-violet-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Zacznij od stron produktowych z najniższym AI Readiness Score</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Google AI Overviews i ChatGPT najczęściej cytują strony z jasną strukturą H1/H2, sekcją FAQ i schema.org Product. Tam jest największy potencjał wzrostu cytowań.
            </p>
          </div>
          <Link href="/">
            <Button size="sm" variant="outline" className="shrink-0 text-xs gap-1">
              Analizuj stronę <ArrowUpRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>

          </main>
        </div>
      </div>
    </div>
  );
}
