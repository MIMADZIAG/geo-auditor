/**
 * CitationLoadingBridge — Warunek 1: Valuable Loading State
 *
 * Visibility First spec: "Podczas gdy Citation Intelligence ładuje się (2–5 min),
 * użytkownik musi widzieć coś wartościowego — np. Signal Audit jako 'wstępna diagnoza'
 * z komunikatem 'Sprawdzamy teraz cytowania w ChatGPT, Gemini i Perplexity — to zajmie chwilę.'"
 *
 * Design principles:
 * - Shows top 3 Signal Audit issues as concrete barriers to AI visibility
 * - Animated "checking" header with engine logos pulsing
 * - Clear message: "Wstępna diagnoza gotowa — czekamy na odpowiedź AI"
 * - Transitions out smoothly when Citation results arrive
 * - Never blocks — if no audit data, shows a minimal skeleton
 *
 * This component is shown in the visibility tab when citationStatus === "running"
 * and Signal Audit data is available.
 */

import { Shield, AlertTriangle, CheckCircle2, Clock, Zap } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TopIssue {
  id: string;
  label: string;
  status: "fail" | "warning";
  impact: "high" | "medium" | "low";
  description: string;
  category: string;
}

interface CitationLoadingBridgeProps {
  /** Top Signal Audit issues (max 3 shown) */
  topIssues: TopIssue[];
  /** Overall Signal Audit score (0–100) */
  overallScore: number;
  /** Page title or URL for context */
  pageTitle: string;
  /** Whether citation check is actively running */
  isRunning: boolean;
}

// ─── Engine pulse animation ───────────────────────────────────────────────────

const ENGINES = [
  { name: "ChatGPT", color: "#10a37f", delay: "0ms" },
  { name: "Gemini", color: "#4285f4", delay: "200ms" },
  { name: "Perplexity", color: "#20b2aa", delay: "400ms" },
  { name: "Google AI", color: "#ea4335", delay: "600ms" },
];

// ─── Impact badge ─────────────────────────────────────────────────────────────

function ImpactBadge({ impact }: { impact: "high" | "medium" | "low" }) {
  const config = {
    high: { label: "Krytyczne", bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20" },
    medium: { label: "Ważne", bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
    low: { label: "Drobne", bg: "bg-zinc-700/50", text: "text-zinc-400", border: "border-zinc-600/30" },
  }[impact];

  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${config.bg} ${config.text} ${config.border}`}>
      {config.label}
    </span>
  );
}

// ─── Score ring (mini) ────────────────────────────────────────────────────────

function MiniScoreRing({ score }: { score: number }) {
  const r = 18;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - score / 100);

  const color =
    score >= 70 ? "#10b981" :
    score >= 45 ? "#f59e0b" :
    "#ef4444";

  return (
    <div className="relative w-12 h-12 shrink-0">
      <svg className="w-12 h-12 -rotate-90" viewBox="0 0 44 44">
        <circle
          cx="22" cy="22" r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="text-zinc-700/60"
        />
        <circle
          cx="22" cy="22" r={r}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 1s ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-black tabular-nums" style={{ color }}>{score}</span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CitationLoadingBridge({
  topIssues,
  overallScore,
  pageTitle,
  isRunning,
}: CitationLoadingBridgeProps) {
  if (!isRunning) return null;

  const displayIssues = topIssues.slice(0, 3);
  const highCount = topIssues.filter(i => i.impact === "high").length;
  const mediumCount = topIssues.filter(i => i.impact === "medium").length;

  return (
    <div className="rounded-2xl border border-zinc-700/40 bg-zinc-900/30 overflow-hidden animate-fade-in">
      {/* ── Header: "Wstępna diagnoza" ── */}
      <div className="px-5 pt-5 pb-4 border-b border-zinc-800/60">
        <div className="flex items-start gap-4">
          {/* Score ring */}
          <MiniScoreRing score={overallScore} />

          {/* Title + summary */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Wstępna diagnoza · Signal Audit</span>
            </div>
            <h3 className="text-sm font-bold text-white leading-snug truncate">{pageTitle}</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              {highCount > 0
                ? `${highCount} krytycz${highCount === 1 ? "na bariera" : highCount < 5 ? "ne bariery" : "nych barier"} blokuje widoczność w AI`
                : mediumCount > 0
                ? `${mediumCount} ważn${mediumCount === 1 ? "a kwestia" : "e kwestie"} do poprawy przed AI Search`
                : "Podstawowe sygnały techniczne są w porządku"}
            </p>
          </div>
        </div>
      </div>

      {/* ── Top issues ── */}
      {displayIssues.length > 0 ? (
        <div className="px-5 py-3 space-y-2.5">
          <p className="text-[11px] text-zinc-500 font-medium">
            Bariery techniczne wykryte przez Signal Audit:
          </p>
          {displayIssues.map((issue, idx) => (
            <div
              key={issue.id}
              className="flex items-start gap-3 animate-slide-in-up"
              style={{ animationDelay: `${idx * 80}ms`, animationFillMode: "both" }}
            >
              <div className="mt-0.5 shrink-0">
                {issue.status === "fail" ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-zinc-200">{issue.label}</span>
                  <ImpactBadge impact={issue.impact} />
                </div>
                {issue.description && (
                  <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed line-clamp-2">
                    {issue.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-5 py-4 flex items-center gap-2 text-emerald-400">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="text-xs font-medium">Brak krytycznych barier technicznych — strona jest gotowa na AI Search</span>
        </div>
      )}

      {/* ── Divider ── */}
      <div className="mx-5 border-t border-zinc-800/60" />

      {/* ── Citation check status ── */}
      <div className="px-5 py-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse shrink-0" />
          <p className="text-xs font-semibold text-indigo-300">
            Sprawdzamy teraz cytowania w silnikach AI — to zajmie chwilę
          </p>
        </div>

        {/* Engine pulse grid */}
        <div className="grid grid-cols-4 gap-2">
          {ENGINES.map((engine) => (
            <div
              key={engine.name}
              className="flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-xl bg-zinc-800/40 border border-zinc-700/30"
            >
              {/* Pulsing dot */}
              <div className="relative">
                <div
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{
                    backgroundColor: engine.color,
                    animationDelay: engine.delay,
                    boxShadow: `0 0 6px ${engine.color}60`,
                  }}
                />
              </div>
              <span className="text-[10px] text-zinc-500 font-medium text-center leading-tight">
                {engine.name}
              </span>
              <div className="flex items-center gap-0.5">
                <Clock className="w-2.5 h-2.5 text-zinc-600" />
                <span className="text-[9px] text-zinc-600">pytam…</span>
              </div>
            </div>
          ))}
        </div>

        {/* Estimated time */}
        <div className="flex items-center gap-1.5 mt-3">
          <Zap className="w-3 h-3 text-zinc-600 shrink-0" />
          <p className="text-[11px] text-zinc-600">
            Odpytujemy rzeczywiste modele AI w czasie rzeczywistym — zwykle 2–5 minut
          </p>
        </div>
      </div>
    </div>
  );
}
