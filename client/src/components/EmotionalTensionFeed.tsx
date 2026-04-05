/**
 * EmotionalTensionFeed — Layer 3: Progressive Disclosure UI
 * ─────────────────────────────────────────────────────────────────────────────
 * The heart of the GEO-Auditor waiting experience.
 *
 * Three UX principles (from the product spec):
 *
 *  1. Show pain before solution.
 *     Competitor URLs appear BEFORE the "0/4" score. The user sees who is
 *     outranking them first — the number is the emotional payoff, not the opener.
 *
 *  2. Each SSE event = new information, not a counter update.
 *     Not "Checked 3/20 queries". Instead:
 *     "ChatGPT asked about 'kurtka zimowa damska' — your page is not in the answer."
 *
 *  3. Tension through specificity.
 *     Not "Analysing…" — "Asking ChatGPT: 'gdzie kupić kurtkę zimową damską?'"
 *     The user sees the exact question. This builds credibility AND suspense.
 *
 * Architecture:
 *  - Pure presentational component — receives streamResults + streamProgress as props
 *  - No internal timers, no polling, no side effects
 *  - Animates via CSS keyframes (no Framer Motion dependency)
 *  - Designed to be replaced/extended without touching AICitationPanel internals
 *
 * @author GEO-Auditor engineering (Profound × Perplexity × Linear reliability standards)
 */

import { useMemo, useRef, useEffect } from "react";
import type { StreamCitationResult, StreamProgress } from "@/hooks/useCitationStream";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmotionalTensionFeedProps {
  /** Accumulated citation results from the SSE stream */
  streamResults: StreamCitationResult[];
  /** Latest progress snapshot (engine + query being asked right now) */
  streamProgress: StreamProgress | null;
  /** The domain being audited — used to identify competitors */
  targetDomain: string;
  /** Whether the job is currently running */
  isRunning: boolean;
  /** Whether SSE fell back to polling (shows a subtle notice) */
  isFallback?: boolean;
}

// ─── Engine config ────────────────────────────────────────────────────────────

const ENGINE_META: Record<
  "chatgpt" | "google" | "perplexity" | "gemini",
  { label: string; shortLabel: string; color: string; bg: string; ring: string; dot: string }
> = {
  google: {
    label: "Google AI Overviews",
    shortLabel: "Google AI",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    ring: "ring-blue-500/30",
    dot: "bg-blue-400",
  },
  chatgpt: {
    label: "ChatGPT Search",
    shortLabel: "ChatGPT",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    ring: "ring-emerald-500/30",
    dot: "bg-emerald-400",
  },
  perplexity: {
    label: "Perplexity AI",
    shortLabel: "Perplexity",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    ring: "ring-cyan-500/30",
    dot: "bg-cyan-400",
  },
  gemini: {
    label: "Google Gemini",
    shortLabel: "Gemini",
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    ring: "ring-purple-500/30",
    dot: "bg-purple-400",
  },
};

const ENGINE_ORDER: Array<"google" | "chatgpt" | "perplexity" | "gemini"> = [
  "google",
  "chatgpt",
  "perplexity",
  "gemini",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDomain(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function isCited(result: StreamCitationResult): boolean {
  return result.isCited === "yes" || result.isCited === "domain";
}

/** Build a human-readable narrative sentence for a single result event */
function buildNarrativeLine(
  result: StreamCitationResult,
  targetDomain: string,
): { headline: string; detail: string | null; sentiment: "positive" | "negative" | "neutral" } {
  const engine = ENGINE_META[result.engine as keyof typeof ENGINE_META];
  const engineLabel = engine?.shortLabel ?? result.engine;
  const q = `"${result.query}"`;

  if (result.isCited === "yes") {
    return {
      headline: `${engineLabel} cytuje Twoją stronę`,
      detail: `Zapytanie ${q} — Twój URL pojawił się w odpowiedzi AI.`,
      sentiment: "positive",
    };
  }

  if (result.isCited === "domain") {
    return {
      headline: `${engineLabel} cytuje Twoją domenę`,
      detail: `Zapytanie ${q} — inna podstrona z ${targetDomain} pojawia się w AI.`,
      sentiment: "positive",
    };
  }

  // isCited === "no" — show who IS there instead
  const topCompetitor = result.allCitedUrls[0]
    ? getDomain(result.allCitedUrls[0])
    : result.competitorDomains[0] ?? null;

  if (topCompetitor) {
    return {
      headline: `${engineLabel} nie cytuje Twojej strony`,
      detail: `Zapytanie ${q} — zamiast niej pojawia się ${topCompetitor}.`,
      sentiment: "negative",
    };
  }

  return {
    headline: `${engineLabel} — brak cytowania`,
    detail: `Zapytanie ${q} — Twoja strona nie pojawia się w odpowiedzi.`,
    sentiment: "neutral",
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** The "Asking ChatGPT: '...'" live ticker — Principle 3: tension through specificity */
function LiveQueryTicker({
  progress,
}: {
  progress: StreamProgress | null;
}) {
  if (!progress?.currentQuery) return null;

  const engine = ENGINE_META[progress.engine as keyof typeof ENGINE_META];
  const engineLabel = engine?.shortLabel ?? progress.engine;
  const engineColor = engine?.color ?? "text-zinc-400";

  return (
    <div className="flex items-start gap-2.5 px-3.5 py-2.5 bg-zinc-800/50 border border-zinc-700/40 rounded-xl animate-fade-in">
      {/* Pulsing dot */}
      <span
        className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse ${engine?.dot ?? "bg-zinc-400"}`}
      />
      <div className="min-w-0">
        <span className="text-[11px] text-zinc-500">Pytam </span>
        <span className={`text-[11px] font-semibold ${engineColor}`}>{engineLabel}</span>
        <span className="text-[11px] text-zinc-500">: </span>
        <span className="text-[11px] text-zinc-200 italic break-words">
          &ldquo;{progress.currentQuery}&rdquo;
        </span>
      </div>
    </div>
  );
}

/** Per-engine summary card — shows live count + cited/not status */
function EngineStatusCard({
  engine,
  results,
  isActive,
}: {
  engine: "google" | "chatgpt" | "perplexity" | "gemini";
  results: StreamCitationResult[];
  isActive: boolean;
}) {
  const meta = ENGINE_META[engine];
  const total = results.length;
  const cited = results.filter(isCited).length;
  const hasCitation = cited > 0;

  return (
    <div
      className={`
        rounded-xl border p-2.5 text-center transition-all duration-300
        ${meta.bg} border-zinc-700/30
        ${isActive ? `ring-1 ${meta.ring}` : ""}
      `}
    >
      <p className={`text-[10px] font-semibold mb-1 ${meta.color}`}>{meta.shortLabel}</p>
      {total > 0 ? (
        <>
          <p className="text-base font-bold text-white tabular-nums leading-none">{total}</p>
          <p className="text-[9px] text-zinc-600 mt-0.5">
            {total === 1 ? "fraza" : total < 5 ? "frazy" : "fraz"}
          </p>
          {hasCitation ? (
            <p className="text-[9px] text-emerald-400 font-semibold mt-1">
              {cited} {cited === 1 ? "cytowanie" : "cytowania"}
            </p>
          ) : (
            <p className="text-[9px] text-zinc-600 mt-1">brak cytowań</p>
          )}
        </>
      ) : (
        <div className="flex justify-center items-center h-8">
          {isActive ? (
            <svg
              className={`w-3.5 h-3.5 animate-spin ${meta.color}`}
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : (
            <span className="text-[10px] text-zinc-700">—</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * NarrativeEventCard — Principle 1 + 2: shows competitors BEFORE score,
 * each event is a story not a counter.
 */
function NarrativeEventCard({
  result,
  targetDomain,
  isLatest,
}: {
  result: StreamCitationResult;
  targetDomain: string;
  isLatest: boolean;
}) {
  const { headline, detail, sentiment } = buildNarrativeLine(result, targetDomain);
  const meta = ENGINE_META[result.engine as keyof typeof ENGINE_META];

  const sentimentStyles = {
    positive: "border-emerald-500/25 bg-emerald-500/5",
    negative: "border-red-500/20 bg-red-500/5",
    neutral: "border-zinc-700/30 bg-zinc-800/20",
  };

  const sentimentIcon = {
    positive: (
      <svg className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    ),
    negative: (
      <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    neutral: (
      <svg className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
      </svg>
    ),
  };

  return (
    <div
      className={`
        rounded-xl border px-3 py-2.5 transition-all duration-300
        ${sentimentStyles[sentiment]}
        ${isLatest ? "animate-slide-in-up" : "opacity-60"}
      `}
    >
      <div className="flex items-start gap-2">
        {/* Sentiment icon */}
        <div className="mt-0.5">{sentimentIcon[sentiment]}</div>

        <div className="flex-1 min-w-0">
          {/* Headline */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${meta?.bg} ${meta?.color}`}
            >
              {meta?.shortLabel ?? result.engine}
            </span>
            <span className="text-xs font-medium text-zinc-200">{headline}</span>
          </div>

          {/* Detail — competitor reveal (Principle 1: pain before solution) */}
          {detail && (
            <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed break-words">
              {detail}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function EmotionalTensionFeed({
  streamResults,
  streamProgress,
  targetDomain,
  isRunning,
  isFallback = false,
}: EmotionalTensionFeedProps) {
  const feedRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest event as results arrive
  useEffect(() => {
    if (!feedRef.current) return;
    const el = feedRef.current;
    // Only auto-scroll if the user is near the bottom (within 120px)
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [streamResults.length]);

  // Per-engine result buckets
  const engineResults = useMemo(() => {
    const buckets: Record<string, StreamCitationResult[]> = {
      google: [],
      chatgpt: [],
      perplexity: [],
      gemini: [],
    };
    for (const r of streamResults) {
      if (buckets[r.engine]) buckets[r.engine].push(r);
    }
    return buckets;
  }, [streamResults]);

  const activeEngine = streamProgress?.engine ?? null;

  // Last N results for the narrative feed — most recent first
  // We show max 8 events to avoid overwhelming the user
  const narrativeEvents = useMemo(() => {
    return [...streamResults].reverse().slice(0, 8);
  }, [streamResults]);

  const totalChecked = streamResults.length;
  const totalCited = streamResults.filter(isCited).length;

  // ── Empty / connecting state ──────────────────────────────────────────────
  if (totalChecked === 0 && !streamProgress) {
    return (
      <div className="space-y-3">
        {/* Connecting skeleton */}
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-zinc-800/30 border border-zinc-700/30 rounded-xl">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse flex-shrink-0" />
          <span className="text-[11px] text-zinc-500 italic">
            Generuję zapytania dla Twojej strony…
          </span>
        </div>
        {/* Engine grid skeleton */}
        <div className="grid grid-cols-4 gap-2">
          {ENGINE_ORDER.map((engine) => (
            <EngineStatusCard
              key={engine}
              engine={engine}
              results={[]}
              isActive={false}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Live query ticker (Principle 3: tension through specificity) ─── */}
      {isRunning && <LiveQueryTicker progress={streamProgress} />}

      {/* ── Per-engine status grid ─────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-2">
        {ENGINE_ORDER.map((engine) => (
          <EngineStatusCard
            key={engine}
            engine={engine}
            results={engineResults[engine] ?? []}
            isActive={activeEngine === engine}
          />
        ))}
      </div>

      {/* ── Narrative event feed (Principles 1 + 2) ───────────────────── */}
      {narrativeEvents.length > 0 && (
        <div
          ref={feedRef}
          className="space-y-1.5 max-h-[280px] overflow-y-auto pr-0.5 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
        >
          {narrativeEvents.map((result, i) => (
            <NarrativeEventCard
              key={`${result.engine}-${result.query}-${result.round}`}
              result={result}
              targetDomain={targetDomain}
              isLatest={i === 0}
            />
          ))}
        </div>
      )}

      {/* ── Running summary line ───────────────────────────────────────── */}
      <div className="flex items-center justify-between text-[11px] text-zinc-600 pt-0.5">
        <span>
          {totalChecked > 0
            ? `${totalChecked} ${totalChecked === 1 ? "fraza sprawdzona" : totalChecked < 5 ? "frazy sprawdzone" : "fraz sprawdzonych"}`
            : "Łączę się z modelami AI…"}
        </span>
        {totalChecked > 0 && (
          <span className={totalCited > 0 ? "text-emerald-500" : "text-zinc-600"}>
            {totalCited}/{totalChecked} cytowań
          </span>
        )}
      </div>

      {/* ── Fallback notice ────────────────────────────────────────────── */}
      {isFallback && (
        <p className="text-[10px] text-zinc-700 text-center">
          Tryb odświeżania co 4s (SSE niedostępne w tej sieci)
        </p>
      )}
    </div>
  );
}
