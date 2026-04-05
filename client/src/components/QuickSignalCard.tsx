/**
 * QuickSignalCard — Instant First Signal (Layer 4)
 *
 * Displays the result of the Quick Signal check (single Google AI Overview query)
 * as an emotionally charged reveal card. Appears within 2–4 seconds of clicking
 * "Sprawdź widoczność w AI" — before the full citation job has any results.
 *
 * Three states:
 *  1. Loading  — animated pulse while the quick signal is in flight
 *  2. Cited    — green card: "Google AI cytuje Twoją stronę na frazę '...'"
 *  3. Not cited — red/amber card: "Google AI nie cytuje Twojej strony" +
 *                competitor reveal (the emotional pain point)
 *
 * Design principles:
 *  - Competitor reveal comes BEFORE the score number (Zasada 1)
 *  - Shows the exact query used (Zasada 3: konkretność)
 *  - Fades out gracefully once full results arrive (isDone=true)
 */

import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuickSignalData {
  isCited: boolean;
  citationLevel: "yes" | "domain" | "no";
  queryUsed: string;
  topCompetitor: string | null;
  competitorDomains: string[];
  hasAIOverview: boolean;
  snippet: string | null;
  fromCache: boolean;
  durationMs: number;
  error?: string;
}

interface Props {
  /** The quick signal result — null while loading */
  data: QuickSignalData | null;
  /** Whether the quick signal fetch is still in progress */
  isLoading: boolean;
  /** When true, card fades out (full results have arrived) */
  isDone: boolean;
  /** The target domain for display */
  targetDomain: string;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LoadingState({ targetDomain }: { targetDomain: string }) {
  const [dotCount, setDotCount] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setDotCount(d => (d % 3) + 1), 500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-3 p-4">
      {/* Pulsing indicator */}
      <div className="relative flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-indigo-400 animate-pulse" />
        </div>
        <div className="absolute inset-0 rounded-full border border-indigo-500/30 animate-ping" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">
          Pytam Google AI{".".repeat(dotCount)}
        </p>
        <p className="text-xs text-zinc-500 mt-0.5 truncate">
          Sprawdzam, czy Google AI Overview cytuje{" "}
          <span className="text-zinc-300">{targetDomain}</span>
        </p>
      </div>
    </div>
  );
}

function CitedState({
  data,
  targetDomain,
}: {
  data: QuickSignalData;
  targetDomain: string;
}) {
  return (
    <div className="p-4 animate-slide-in-up">
      <div className="flex items-start gap-3">
        {/* Green checkmark icon */}
        <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-emerald-300">
            {data.citationLevel === "domain"
              ? "Google AI cytuje Twoją domenę"
              : "Google AI cytuje Twoją stronę"}
          </p>
          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
            Na zapytanie{" "}
            <span className="text-zinc-200 font-medium">
              &ldquo;{data.queryUsed}&rdquo;
            </span>{" "}
            Google AI Overview zawiera{" "}
            {data.citationLevel === "domain" ? "Twoją domenę" : "Twój URL"}.
          </p>
          {data.snippet && (
            <p className="text-xs text-zinc-500 mt-2 italic leading-relaxed line-clamp-2">
              &ldquo;{data.snippet.slice(0, 200)}&rdquo;
            </p>
          )}
          {data.fromCache && (
            <p className="text-[10px] text-zinc-600 mt-1.5">z cache · sprawdzamy teraz pozostałe silniki</p>
          )}
        </div>
      </div>
    </div>
  );
}

function NotCitedState({
  data,
  targetDomain,
}: {
  data: QuickSignalData;
  targetDomain: string;
}) {
  // Competitor reveal — shown BEFORE any score number (Zasada 1)
  const hasCompetitors = data.competitorDomains.length > 0;

  return (
    <div className="p-4 animate-slide-in-up space-y-3">
      {/* Pain statement */}
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-red-300">
            {data.hasAIOverview
              ? "Google AI nie cytuje Twojej strony"
              : "Google AI nie wyświetla AI Overview dla tej frazy"}
          </p>
          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
            Zapytałem:{" "}
            <span className="text-zinc-200 font-medium">
              &ldquo;{data.queryUsed}&rdquo;
            </span>
            {data.hasAIOverview
              ? " — Twojej strony nie ma w odpowiedzi."
              : " — Google nie pokazał AI Overview dla tej frazy."}
          </p>
        </div>
      </div>

      {/* Competitor reveal — the emotional core (Zasada 1: ból przed wynikiem) */}
      {hasCompetitors && (
        <div className="ml-11 space-y-1.5">
          <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">
            Zamiast Ciebie Google cytuje:
          </p>
          <div className="space-y-1">
            {data.competitorDomains.slice(0, 3).map((domain, i) => (
              <div
                key={domain}
                className="flex items-center gap-2 animate-slide-in-up"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" />
                <span className="text-xs font-mono text-orange-300">{domain}</span>
                {i === 0 && (
                  <span className="text-[10px] text-orange-500/70 ml-auto">
                    #1 konkurent
                  </span>
                )}
              </div>
            ))}
            {data.competitorDomains.length > 3 && (
              <p className="text-[10px] text-zinc-600 ml-3.5">
                +{data.competitorDomains.length - 3} więcej · sprawdzamy teraz pozostałe silniki
              </p>
            )}
          </div>
        </div>
      )}

      {/* No AI Overview at all — softer message */}
      {!data.hasAIOverview && !hasCompetitors && (
        <div className="ml-11">
          <p className="text-xs text-zinc-500">
            Google nie generuje AI Overview dla tej frazy — sprawdzamy ChatGPT, Perplexity i Gemini.
          </p>
        </div>
      )}

      {data.fromCache && (
        <p className="text-[10px] text-zinc-600 ml-11">z cache · sprawdzamy teraz pozostałe silniki</p>
      )}
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex items-center gap-3 p-4">
      <div className="w-8 h-8 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center flex-shrink-0">
        <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div>
        <p className="text-sm text-zinc-400">Szybki sygnał niedostępny</p>
        <p className="text-xs text-zinc-600 mt-0.5">Pełna analiza trwa — wyniki pojawią się za chwilę.</p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * QuickSignalCard — renders the Instant First Signal reveal.
 *
 * Lifecycle:
 *  isLoading=true, data=null  → Loading state (pulsing indicator)
 *  isLoading=false, data set  → Cited or NotCited state (animated reveal)
 *  isDone=true                → Card fades out (full results have arrived)
 */
export function QuickSignalCard({ data, isLoading, isDone, targetDomain }: Props) {
  // Fade-out animation when full results arrive
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (isDone) {
      // Small delay so the transition doesn't feel abrupt
      const id = setTimeout(() => setVisible(false), 1200);
      return () => clearTimeout(id);
    }
  }, [isDone]);

  if (!visible) return null;

  const containerClass = [
    "rounded-xl border overflow-hidden transition-all duration-700",
    isDone ? "opacity-0 scale-95 pointer-events-none" : "opacity-100 scale-100",
    // Border color based on state
    isLoading
      ? "border-indigo-500/20 bg-indigo-950/10"
      : data?.error
        ? "border-white/8 bg-zinc-900/40"
        : data?.isCited
          ? "border-emerald-500/25 bg-emerald-950/10"
          : "border-red-500/20 bg-red-950/8",
  ].join(" ");

  // Label badge
  const badge = isLoading ? null : data?.error ? null : (
    <div className={[
      "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
      data?.isCited
        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
        : "bg-red-500/10 text-red-400 border border-red-500/20",
    ].join(" ")}>
      {data?.isCited ? "Cytowany" : "Niewidoczny"}
    </div>
  );

  return (
    <div className={containerClass}>
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
            Szybki sygnał · Google AI
          </span>
        </div>
        {badge}
      </div>

      {/* Content */}
      {isLoading && <LoadingState targetDomain={targetDomain} />}
      {!isLoading && data?.error && !data.isCited && !data.hasAIOverview && <ErrorState />}
      {!isLoading && data && !data.error && data.isCited && (
        <CitedState data={data} targetDomain={targetDomain} />
      )}
      {!isLoading && data && !data.error && !data.isCited && (
        <NotCitedState data={data} targetDomain={targetDomain} />
      )}
    </div>
  );
}
