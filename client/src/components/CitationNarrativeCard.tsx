/**
 * CitationNarrativeCard
 *
 * Renders an LLM-generated one-paragraph diagnosis connecting citation results
 * to the most likely root cause gap. This is the "aha moment" card — it converts
 * raw data into a decision the user can act on immediately.
 *
 * Design principles:
 *  - Loads lazily (only after citation job is completed)
 *  - Shows a skeleton while the LLM is generating
 *  - Gracefully falls back to template narrative if LLM fails
 *  - Confidence badge tells the user how reliable the diagnosis is
 *  - Primary action is always visible, even before expanding
 */

import { useMemo } from "react";
import { trpc } from "@/lib/trpc";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CitationNarrativeCardProps {
  auditId: number;
  url: string;
  citingEngines: string[];
  missingEngines: string[];
  totalChecks: number;
  /** Whether the citation job has completed (gate before fetching) */
  isCompleted: boolean;
  language?: string;
}

// ─── Engine display names ─────────────────────────────────────────────────────

const ENGINE_LABELS: Record<string, string> = {
  google: "Google AI",
  perplexity: "Perplexity",
  gemini: "Gemini",
  chatgpt: "ChatGPT",
};

// ─── Confidence config ────────────────────────────────────────────────────────

const CONFIDENCE_CONFIG = {
  high: {
    label: "Wysoka pewność",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    dot: "bg-emerald-500",
  },
  medium: {
    label: "Średnia pewność",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    dot: "bg-amber-500",
  },
  low: {
    label: "Szacunkowa",
    color: "text-zinc-400",
    bg: "bg-zinc-500/10",
    border: "border-zinc-500/20",
    dot: "bg-zinc-500",
  },
} as const;

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function NarrativeSkeleton() {
  return (
    <div className="bg-zinc-900/40 border border-white/8 rounded-2xl p-5 space-y-3 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-full bg-zinc-800" />
        <div className="h-3.5 w-48 bg-zinc-800 rounded" />
        <div className="ml-auto h-4 w-20 bg-zinc-800 rounded-full" />
      </div>
      <div className="space-y-2 pt-1">
        <div className="h-3 bg-zinc-800 rounded w-full" />
        <div className="h-3 bg-zinc-800 rounded w-5/6" />
        <div className="h-3 bg-zinc-800 rounded w-4/6" />
      </div>
      <div className="h-10 bg-zinc-800/60 rounded-xl" />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CitationNarrativeCard({
  auditId,
  url,
  citingEngines,
  missingEngines,
  totalChecks,
  isCompleted,
  language = "pl",
}: CitationNarrativeCardProps) {
  const ALL_ENGINES = ["chatgpt", "google", "perplexity", "gemini"];

  // Stable input — memoized to avoid re-fetching on every render
  const queryInput = useMemo(() => ({
    auditId,
    url,
    citedEngineCount: citingEngines.length,
    totalEngines: ALL_ENGINES.length,
    citingEngines,
    missingEngines,
    totalChecks,
    language,
  }), [auditId, url, citingEngines, missingEngines, totalChecks, language]);

  const { data: narrative, isLoading } = trpc.citation.getNarrative.useQuery(
    queryInput,
    {
      enabled: isCompleted && totalChecks > 0,
      staleTime: 10 * 60 * 1000, // 10 min — matches server cache TTL
      retry: 1,
    }
  );

  // Don't render at all if job isn't done or no checks were run
  if (!isCompleted || totalChecks === 0) return null;

  if (isLoading) return <NarrativeSkeleton />;
  if (!narrative) return null;

  const conf = CONFIDENCE_CONFIG[narrative.confidence];
  const isFullyCited = citingEngines.length === ALL_ENGINES.length;
  const isNotCited = citingEngines.length === 0;

  return (
    <div className={`bg-zinc-900/40 border rounded-2xl overflow-hidden ${
      isNotCited
        ? "border-red-500/20"
        : isFullyCited
          ? "border-emerald-500/20"
          : "border-amber-500/20"
    }`}>
      {/* Header */}
      <div className="px-5 pt-4 pb-3 flex items-start gap-3 border-b border-white/5">
        {/* Icon */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isNotCited ? "bg-red-500/15" : isFullyCited ? "bg-emerald-500/15" : "bg-amber-500/15"
        }`}>
          {isNotCited ? (
            <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ) : isFullyCited ? (
            <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
        </div>

        {/* Title + verdict */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-white">Diagnoza AI</h3>
            {/* Confidence badge */}
            <span className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${conf.color} ${conf.bg} ${conf.border}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${conf.dot}`} />
              {conf.label}
            </span>
            {narrative.source === "template" && (
              <span className="text-[9px] text-zinc-600 bg-zinc-800/60 px-1.5 py-0.5 rounded-full border border-white/5">
                Szablon
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">{narrative.verdict}</p>
        </div>
      </div>

      {/* Diagnosis body */}
      <div className="px-5 py-4 space-y-3">
        <p className="text-xs text-zinc-300 leading-relaxed">{narrative.diagnosis}</p>

        {/* Root cause highlight */}
        {narrative.rootCauseGap && (
          <div className="flex items-start gap-2 bg-zinc-800/40 border border-white/5 rounded-xl px-3 py-2.5">
            <svg className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <div>
              <p className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider mb-0.5">Główna przyczyna</p>
              <p className="text-xs text-zinc-300">{narrative.rootCauseGap}</p>
            </div>
          </div>
        )}

        {/* Primary action CTA */}
        <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-xl px-3 py-2.5 flex items-start gap-2">
          <svg className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
          <div>
            <p className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider mb-0.5">Najważniejszy krok</p>
            <p className="text-xs text-zinc-200 leading-relaxed">{narrative.primaryAction}</p>
          </div>
        </div>

        {/* Engine summary pills */}
        {(citingEngines.length > 0 || missingEngines.length > 0) && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {citingEngines.map(e => (
              <span key={e} className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {ENGINE_LABELS[e] ?? e}
              </span>
            ))}
            {missingEngines.map(e => (
              <span key={e} className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-zinc-800/60 text-zinc-500 border border-white/5">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                {ENGINE_LABELS[e] ?? e}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default CitationNarrativeCard;
