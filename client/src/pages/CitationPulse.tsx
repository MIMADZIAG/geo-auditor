/**
 * Citation Pulse — Per-phrase AI Visibility Board
 *
 * The retention engine of GEO-Auditor monitoring.
 * Shows all monitored pages with their phrase-level citation performance
 * across ChatGPT, Perplexity, Google AI Overviews, and Gemini.
 *
 * Three zones:
 *   1. "Cytowane teraz" — pages/phrases with active citations
 *   2. "Zmiany od ostatniego sprawdzenia" — deltas since last run
 *   3. "Szanse do wykorzystania" — phrases with 0 citations but high potential
 *
 * Phase 2 features:
 *   - Per-phrase citation table with engine columns
 *   - Citation streak indicator (🔥)
 *   - Competitor alert (who is cited instead of you)
 *   - Upsell triggers for phrase limits and Pro features
 */
import { useState, useMemo } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PhraseManager } from "@/components/PhraseManager";
import {
  Brain, Zap, Eye, Flame, TrendingUp, TrendingDown, Minus,
  AlertTriangle, CheckCircle, Clock, RefreshCw, Lock, Target,
  ChevronDown, ChevronUp, ArrowUpRight, Sparkles, Globe,
} from "lucide-react";

// ─── Engine config ─────────────────────────────────────────────────────────────

const ENGINES = [
  { key: "chatgpt", label: "ChatGPT", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  { key: "perplexity", label: "Perplexity", color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
  { key: "google", label: "Google AI", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  { key: "gemini", label: "Gemini", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number | null | undefined): string {
  if (score == null) return "text-muted-foreground";
  if (score >= 75) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

function CitationDot({ cited }: { cited: boolean | null }) {
  if (cited === null) return <span className="w-4 h-4 rounded-full border border-border bg-muted/30 inline-block" />;
  return cited
    ? <span className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center inline-flex">
        <CheckCircle className="w-2.5 h-2.5 text-emerald-400" />
      </span>
    : <span className="w-4 h-4 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center inline-flex">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500/50" />
      </span>;
}

// ─── Sparkline SVG ───────────────────────────────────────────────────────────
// Pure SVG, no external deps. Renders 7-point citation trend (0-4 engines).

function Sparkline({ data, width = 64, height = 24 }: {
  data: number[]; // citedEnginesCount per run, chronological
  width?: number;
  height?: number;
}) {
  if (data.length < 2) {
    // Single point or empty — render a flat line
    const y = height / 2;
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        <line x1={0} y1={y} x2={width} y2={y} stroke="currentColor" strokeWidth={1.5} strokeOpacity={0.3} />
        {data.length === 1 && (
          <circle cx={width / 2} cy={y} r={2} fill="currentColor" fillOpacity={0.6} />
        )}
      </svg>
    );
  }

  const max = 4; // max engines
  const pad = 3;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * w;
    const y = pad + h - (v / max) * h;
    return { x, y, v };
  });

  // Build smooth polyline
  const pathD = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(" ");

  // Area fill
  const areaD = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

  const lastVal = data[data.length - 1];
  const prevVal = data[data.length - 2];
  const trend = lastVal > prevVal ? "up" : lastVal < prevVal ? "down" : "flat";
  const lineColor = trend === "up" ? "#22c55e" : trend === "down" ? "#ef4444" : "#a78bfa";

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      {/* Area */}
      <path d={areaD} fill={lineColor} fillOpacity={0.08} />
      {/* Line */}
      <path d={pathD} fill="none" stroke={lineColor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {/* Last point dot */}
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={2.5} fill={lineColor} />
    </svg>
  );
}

// ─── Per-page Citation Pulse Panel ────────────────────────────────────────────

function PagePulsePanel({
  page,
  isPro,
  isStarter,
  plan,
}: {
  page: {
    id: number;
    url: string;
    label: string | null;
    lastScore: number | null;
    lastAuditAt: Date | string | null;
    lastCitedEngines: number | null;
    lastTotalEngines: number | null;
  };
  isPro: boolean;
  isStarter: boolean;
  plan: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const domain = (() => { try { return new URL(page.url).hostname; } catch { return page.url; } })();
  const lastAudit = page.lastAuditAt
    ? new Date(page.lastAuditAt).toLocaleDateString("pl-PL", { day: "numeric", month: "short" })
    : "Brak";

  const citedEngines = page.lastCitedEngines ?? 0;
  const totalEngines = page.lastTotalEngines ?? 4;
  const hasCitationData = page.lastTotalEngines != null;

  const citationStatus =
    !hasCitationData ? "unknown" :
    citedEngines === 0 ? "none" :
    citedEngines >= 3 ? "strong" : "partial";

  const statusConfig = {
    unknown: { label: "Brak danych", color: "text-muted-foreground", bg: "border-border" },
    none: { label: "Nie cytowana", color: "text-red-400", bg: "border-red-500/20" },
    partial: { label: "Częściowo cytowana", color: "text-amber-400", bg: "border-amber-500/20" },
    strong: { label: "Silnie cytowana", color: "text-emerald-400", bg: "border-emerald-500/20" },
  }[citationStatus];

  // Snapshots for mini trend
  const snapshotsQuery = trpc.monitoring.getSnapshots.useQuery(
    { monitoredPageId: page.id, limit: 8 },
    { enabled: expanded }
  );
  const engineBreakdownQuery = trpc.monitoring.getEngineBreakdown.useQuery(
    { monitoredPageId: page.id },
    { enabled: expanded }
  );
  // Per-phrase citation history for sparklines
  const phraseHistoryQuery = trpc.monitoring.getPhraseHistory.useQuery(
    { monitoredPageId: page.id, limit: 7 },
    { enabled: expanded }
  );
  const phraseHistory = phraseHistoryQuery.data ?? [];

  const engineBreakdown = engineBreakdownQuery.data ?? [];

  return (
    <div className={`rounded-xl border bg-card transition-all ${statusConfig.bg}`}>
      {/* Header */}
      <button
        className="w-full text-left p-4"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start gap-3">
          {/* Score ring */}
          <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center shrink-0 font-bold text-sm ${
            page.lastScore != null && page.lastScore >= 75 ? "border-emerald-500 text-emerald-400" :
            page.lastScore != null && page.lastScore >= 50 ? "border-amber-500 text-amber-400" :
            page.lastScore != null ? "border-red-500 text-red-400" :
            "border-border text-muted-foreground"
          }`}>
            {page.lastScore != null ? Math.round(page.lastScore) : "–"}
          </div>

          {/* Page info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{page.label || domain}</p>
            <p className="text-xs text-muted-foreground truncate">{page.url}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`text-xs font-medium ${statusConfig.color}`}>
                {statusConfig.label}
              </span>
              {hasCitationData && (
                <span className={`text-xs tabular-nums font-semibold ${
                  citedEngines >= 3 ? "text-emerald-400" :
                  citedEngines >= 1 ? "text-amber-400" : "text-red-400"
                }`}>
                  {citedEngines}/{totalEngines} silników AI
                </span>
              )}
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> {lastAudit}
              </span>
            </div>
          </div>

          {/* Engine dots */}
          <div className="flex items-center gap-1 shrink-0">
            {ENGINES.map((eng) => {
              const breakdown = engineBreakdown.find((b: { engine: string }) => b.engine === eng.key) as
                { engine: string; cited: boolean; citedUrl: string | null; query: string | null } | undefined;
              const cited = breakdown ? breakdown.cited : null;
              return (
                <Tooltip key={eng.key}>
                  <TooltipTrigger asChild>
                    <span className="cursor-help">
                      <CitationDot cited={expanded ? cited : null} />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {eng.label}: {cited === null ? "brak danych" : cited ? "cytowana" : "nie cytowana"}
                  </TooltipContent>
                </Tooltip>
              );
            })}
            {expanded
              ? <ChevronUp className="w-4 h-4 text-muted-foreground ml-1" />
              : <ChevronDown className="w-4 h-4 text-muted-foreground ml-1" />
            }
          </div>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
          {/* Engine breakdown table */}
          {engineBreakdown.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                Widoczność per silnik AI
              </p>
              <div className="grid grid-cols-4 gap-2">
                {ENGINES.map((eng) => {
                  const bd = engineBreakdown.find((b: { engine: string }) => b.engine === eng.key) as {
                    engine: string; cited: boolean; citedUrl: string | null; query: string | null;
                  } | undefined;
                  const pct = bd?.cited ? 100 : 0;
                  const total = 1;
                  const cited = bd?.cited ? 1 : 0;
                  return (
                    <div key={eng.key} className={`rounded-lg border p-2 text-center ${eng.bg}`}>
                      <p className={`text-xs font-semibold ${eng.color}`}>{eng.label}</p>
                      <p className={`text-xl font-bold tabular-nums mt-0.5 ${eng.color}`}>{pct}%</p>
                      <p className="text-[10px] text-muted-foreground">{cited}/{total} zapytań</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Per-phrase sparkline trend table */}
          {phraseHistory.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-1.5">
                <TrendingUp className="w-3 h-3" /> Trend widoczności per fraza (ostatnie 7 runów)
              </p>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Fraza</th>
                      <th className="text-center px-2 py-2 font-medium text-muted-foreground w-20">Trend</th>
                      <th className="text-center px-2 py-2 font-medium text-muted-foreground w-16">Ostatni</th>
                      <th className="text-center px-2 py-2 font-medium text-muted-foreground w-10" title="ChatGPT">GPT</th>
                      <th className="text-center px-2 py-2 font-medium text-muted-foreground w-10" title="Perplexity">PPX</th>
                      <th className="text-center px-2 py-2 font-medium text-muted-foreground w-10" title="Google AI">GGL</th>
                      <th className="text-center px-2 py-2 font-medium text-muted-foreground w-10" title="Gemini">GEM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {phraseHistory.map((ph) => {
                      const sparkData = ph.history.map((h) => h.citedEnginesCount);
                      const last = ph.history[ph.history.length - 1];
                      const lastCount = last?.citedEnginesCount ?? 0;
                      const lastColor = lastCount >= 3 ? "text-emerald-400" : lastCount >= 1 ? "text-amber-400" : "text-red-400";
                      return (
                        <tr key={ph.phraseId} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-3 py-2 font-medium max-w-[200px] truncate" title={ph.phrase}>
                            {ph.phrase}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <div className="flex items-center justify-center">
                              <Sparkline data={sparkData} width={64} height={22} />
                            </div>
                          </td>
                          <td className={`px-2 py-2 text-center font-bold tabular-nums ${lastColor}`}>
                            {lastCount}/4
                          </td>
                          <td className="px-2 py-2 text-center">
                            <CitationDot cited={last?.chatgptCited ?? null} />
                          </td>
                          <td className="px-2 py-2 text-center">
                            <CitationDot cited={last?.perplexityCited ?? null} />
                          </td>
                          <td className="px-2 py-2 text-center">
                            <CitationDot cited={last?.googleCited ?? null} />
                          </td>
                          <td className="px-2 py-2 text-center">
                            <CitationDot cited={last?.geminiCited ?? null} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {phraseHistoryQuery.isLoading && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Ładowanie historii fraz...
                </p>
              )}
            </div>
          )}

          {/* Phrase Manager */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
              Monitorowane frazy
            </p>
            <PhraseManager
              monitoredPageId={page.id}
              plan={plan}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            {page.lastAuditAt && (
              <Link href={`/dashboard`}>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                  <ArrowUpRight className="w-3 h-3" /> Dashboard
                </Button>
              </Link>
            )}
            {!isPro && (
              <Link href="/pricing">
                <Button size="sm" className="h-7 text-xs gap-1 bg-violet-600 hover:bg-violet-700 text-white">
                  <Zap className="w-3 h-3" /> Odblokuj pełną widoczność → Pro
                </Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ plan }: { plan: string }) {
  const isFree = plan === "free";
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-4">
        <Target className="w-8 h-8 text-violet-400" />
      </div>
      <h3 className="text-lg font-semibold mb-2">Brak monitorowanych stron</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        {isFree
          ? "Monitoring wymaga planu Starter lub wyższego. Dodaj stronę do monitoringu i śledź jej widoczność w AI Search."
          : "Dodaj pierwszą stronę do monitoringu, aby śledzić jej widoczność w ChatGPT, Perplexity, Google AI i Gemini."}
      </p>
      {isFree ? (
        <Link href="/pricing">
          <Button className="gap-2 bg-violet-600 hover:bg-violet-700 text-white">
            <Zap className="w-4 h-4" /> Odblokuj monitoring → Starter
          </Button>
        </Link>
      ) : (
        <Link href="/dashboard">
          <Button className="gap-2 bg-violet-600 hover:bg-violet-700 text-white">
            <Target className="w-4 h-4" /> Dodaj stronę w Dashboard
          </Button>
        </Link>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CitationPulse() {
  const { user, loading: authLoading } = useAuth();
  const [activeZone, setActiveZone] = useState<"all" | "cited" | "opportunities">("all");

  const monitoredQuery = trpc.monitoring.list.useQuery(undefined, { enabled: !!user });
  const pages = monitoredQuery.data ?? [];
  const plan = (user?.plan ?? "free") as string;
  const isPro = plan === "pro" || plan === "business";
  const isStarter = plan === "starter";
  const isEligible = isPro || isStarter;

  // Zone classification
  const citedPages = useMemo(() =>
    pages.filter((p) => (p.lastCitedEngines ?? 0) > 0),
    [pages]
  );
  const opportunityPages = useMemo(() =>
    pages.filter((p) => p.lastTotalEngines != null && (p.lastCitedEngines ?? 0) === 0),
    [pages]
  );
  const allPages = pages;

  const displayedPages = useMemo(() => {
    if (activeZone === "cited") return citedPages;
    if (activeZone === "opportunities") return opportunityPages;
    return allPages;
  }, [activeZone, citedPages, opportunityPages, allPages]);

  // Auth gate
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="w-6 h-6 animate-spin text-violet-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Brain className="w-10 h-10 text-violet-400" />
        <p className="text-muted-foreground">Zaloguj się, aby zobaczyć Citation Pulse.</p>
        <a href={getLoginUrl()}>
          <Button className="bg-violet-600 hover:bg-violet-700 text-white">Zaloguj się</Button>
        </a>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        {/* Top nav */}
        <header className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-40">
          <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/">
                <div className="flex items-center gap-2 font-bold text-lg cursor-pointer hover:opacity-80 transition-opacity">
                  <Brain className="w-5 h-5 text-violet-400" />
                  <span>GEO<span className="text-violet-400">-Auditor</span></span>
                </div>
              </Link>
              <span className="text-muted-foreground/40">/</span>
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <Sparkles className="w-4 h-4 text-violet-400" />
                Citation Pulse
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/dashboard">
                <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground">
                  Dashboard
                </Button>
              </Link>
            </div>
          </div>
        </header>

        <div className="max-w-5xl mx-auto px-4 py-8">
          {/* Page header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-violet-400" />
              Citation Pulse
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Śledź widoczność każdej podstrony w ChatGPT, Perplexity, Google AI i Gemini — per fraza, per silnik.
            </p>
          </div>

          {/* Summary stats */}
          {pages.length > 0 && (
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="rounded-xl border border-border bg-card p-4 text-center">
                <p className="text-2xl font-bold text-foreground tabular-nums">{pages.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Monitorowanych stron</p>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
                <p className="text-2xl font-bold text-emerald-400 tabular-nums">{citedPages.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Cytowanych teraz</p>
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-center">
                <p className="text-2xl font-bold text-amber-400 tabular-nums">{opportunityPages.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Szans do wykorzystania</p>
              </div>
            </div>
          )}

          {/* Zone filter tabs */}
          {pages.length > 0 && (
            <div className="flex items-center gap-1 mb-4 bg-muted/30 rounded-lg p-1 w-fit">
              {[
                { key: "all", label: "Wszystkie", count: allPages.length },
                { key: "cited", label: "Cytowane", count: citedPages.length },
                { key: "opportunities", label: "Szanse", count: opportunityPages.length },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveZone(tab.key as typeof activeZone)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    activeZone === tab.key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                  <span className={`text-[10px] px-1.5 py-0 rounded-full font-semibold ${
                    activeZone === tab.key ? "bg-violet-500/20 text-violet-400" : "bg-muted text-muted-foreground"
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Content */}
          {monitoredQuery.isLoading ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="w-6 h-6 animate-spin text-violet-400" />
            </div>
          ) : !isEligible ? (
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-8 text-center">
              <Lock className="w-8 h-8 text-violet-400 mx-auto mb-3" />
              <h3 className="text-base font-semibold mb-1">Monitoring wymaga planu Starter</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                Śledź widoczność swoich stron w AI Search co tydzień. Pierwszy krok do dominacji w AI Search.
              </p>
              <Link href="/pricing">
                <Button className="gap-2 bg-violet-600 hover:bg-violet-700 text-white">
                  <Zap className="w-4 h-4" /> Odblokuj monitoring → Starter
                </Button>
              </Link>
            </div>
          ) : displayedPages.length === 0 ? (
            <EmptyState plan={plan} />
          ) : (
            <div className="space-y-3">
              {displayedPages.map((page) => (
                <PagePulsePanel
                  key={page.id}
                  page={page}
                  isPro={isPro}
                  isStarter={isStarter}
                  plan={plan}
                />
              ))}
            </div>
          )}

          {/* Pro upsell banner (Starter users) */}
          {isStarter && pages.length > 0 && (
            <div className="mt-6 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-5 h-5 text-violet-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Odblokuj analizę konkurencji per fraza</p>
                  <p className="text-xs text-muted-foreground">
                    Plan Pro pokazuje, kto jest cytowany zamiast Ciebie dla każdej frazy.
                  </p>
                </div>
              </div>
              <Link href="/pricing">
                <Button size="sm" className="h-8 text-xs gap-1 bg-violet-600 hover:bg-violet-700 text-white shrink-0">
                  <Zap className="w-3 h-3" /> Pro
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
