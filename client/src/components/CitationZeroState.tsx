/**
 * CitationZeroState — Emotional Zero-State for 0 Citations
 *
 * Visibility First — Warunek 2: gdy AI Visibility Check zwróci 0 cytowań,
 * ekran nie może być pusty. Musi pokazywać konkretny ból + top-3 konkurentów
 * + bezpośrednie CTA do AI Visibility Monitor.
 *
 * Zasada: "Pokaż ból przed rozwiązaniem" — konkurenci pojawiają się PRZED
 * jakimikolwiek wskazówkami. Użytkownik musi najpierw zobaczyć, kto go wyprzedza.
 *
 * Design: ciemne tło, czerwony akcent (brak cytowania = krytyczny stan),
 * animacja slide-in dla każdego elementu.
 */

import { useLocation } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Competitor {
  domain: string;
  url: string;
  count: number;
}

interface CitationZeroStateProps {
  /** Top competitors extracted from citation checks (already ranked by frequency) */
  competitors: Competitor[];
  /** Target domain being audited */
  targetDomain: string;
  /** Total number of AI engines checked */
  totalEngines: number;
  /** Total number of queries checked */
  totalQueries: number;
  /** Called when user clicks "Monitoruj widoczność" CTA */
  onNavigateToPulse?: () => void;
  /** Called when user clicks "Sprawdź Signal Audit" CTA */
  onNavigateToAudit?: () => void;
}

// ─── Engine labels for the "checked engines" list ────────────────────────────

const ENGINE_NAMES: Record<string, string> = {
  google: "Google AI Overviews",
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  gemini: "Gemini",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function CitationZeroState({
  competitors,
  targetDomain,
  totalEngines,
  totalQueries,
  onNavigateToPulse,
  onNavigateToAudit,
}: CitationZeroStateProps) {
  const [, navigate] = useLocation();
  const top3 = competitors.slice(0, 3);
  const hasCompetitors = top3.length > 0;

  const handlePulse = () => {
    if (onNavigateToPulse) {
      onNavigateToPulse();
    } else {
      navigate("/pulse");
    }
  };

  const handleAudit = () => {
    if (onNavigateToAudit) {
      onNavigateToAudit();
    }
  };

  return (
    <div className="animate-fade-in">
      {/* ── Primary pain card: "AI nie poleca Twojej strony" ── */}
      <div className="bg-zinc-900/60 border border-red-500/30 rounded-2xl overflow-hidden">

        {/* Header — the emotional statement */}
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/25 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>

            {/* Headline */}
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-white leading-snug">
                AI nie poleca Twojej strony
              </h2>
              <p className="text-sm text-zinc-400 mt-1 leading-relaxed">
                Sprawdziliśmy{" "}
                <span className="text-white font-semibold">{totalQueries} zapytań</span>{" "}
                w {totalEngines} silnikach AI.{" "}
                <span className="text-red-300 font-semibold">{targetDomain}</span>{" "}
                nie pojawił się w żadnej odpowiedzi.
              </p>
            </div>
          </div>
        </div>

        {/* ── Competitor reveal — the emotional core ── */}
        {hasCompetitors && (
          <div className="border-t border-white/5 px-5 py-4">
            <p className="text-[11px] text-zinc-500 uppercase tracking-wide font-semibold mb-3">
              Zamiast Ciebie AI poleca:
            </p>
            <div className="space-y-2">
              {top3.map((c, i) => (
                <div
                  key={c.domain}
                  className="flex items-center gap-3 bg-zinc-800/50 border border-white/5 rounded-xl px-3 py-2.5 animate-slide-in-up"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  {/* Rank badge */}
                  <div className="w-5 h-5 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-orange-400">{i + 1}</span>
                  </div>

                  {/* Domain */}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-mono font-semibold text-orange-300 truncate block">
                      {c.domain}
                    </span>
                    {c.url && (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors truncate block"
                      >
                        {c.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60)}
                      </a>
                    )}
                  </div>

                  {/* Citation count */}
                  <div className="shrink-0 text-right">
                    <span className="text-sm font-bold tabular-nums text-orange-400">{c.count}×</span>
                    <p className="text-[9px] text-zinc-600">cytowań</p>
                  </div>
                </div>
              ))}
            </div>

            {competitors.length > 3 && (
              <p className="text-[11px] text-zinc-600 mt-2.5 text-center">
                + {competitors.length - 3} innych domen wyprzedza Cię w AI Search
              </p>
            )}
          </div>
        )}

        {/* ── No competitors found — explain why it still hurts ── */}
        {!hasCompetitors && (
          <div className="border-t border-white/5 px-5 py-4">
            <div className="flex items-start gap-2.5 bg-zinc-800/40 border border-white/5 rounded-xl p-3">
              <svg className="w-4 h-4 text-zinc-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-zinc-400 leading-relaxed">
                AI odpowiadało na te zapytania bez cytowania konkretnych stron. To oznacza, że Twoja nisza jest słabo pokryta — szansa, by być pierwszym cytowanym źródłem.
              </p>
            </div>
          </div>
        )}

        {/* ── CTA section ── */}
        <div className="border-t border-white/5 px-5 py-4 bg-zinc-900/40">
          <p className="text-xs text-zinc-500 mb-3">
            Widoczność w AI zmienia się co tydzień. Monitoruj zmiany i dowiedz się, kiedy AI zacznie Cię cytować.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            {/* Primary CTA — AI Visibility Monitor */}
            <button
              onClick={handlePulse}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Monitoruj widoczność w AI
            </button>

            {/* Secondary CTA — Signal Audit */}
            <button
              onClick={handleAudit}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800/60 border border-white/10 text-zinc-300 text-sm font-medium hover:bg-zinc-800 hover:text-white transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Sprawdź bariery techniczne
            </button>
          </div>
        </div>
      </div>

      {/* ── What to do next — actionable steps ── */}
      <div className="mt-3 bg-zinc-900/30 border border-white/5 rounded-2xl p-4">
        <p className="text-[11px] text-zinc-500 uppercase tracking-wide font-semibold mb-3">
          Trzy kroki do pierwszego cytowania
        </p>
        <div className="space-y-2">
          {[
            {
              step: "1",
              title: "Dodaj FAQ schema do strony",
              desc: "Strony z FAQ schema są cytowane 3× częściej przez ChatGPT i Perplexity. Najszybszy sposób na pierwsze cytowanie.",
              color: "violet",
            },
            {
              step: "2",
              title: "Zacznij od odpowiedzi, nie od opisu",
              desc: "AI cytuje strony, ktore w pierwszych 80 slowach odpowiadaja na pytanie. Skorzystaj z Signal Rewrite - tryb Answer First.",
              color: "indigo",
            },
            {
              step: "3",
              title: "Sprawdź, co mają cytowani konkurenci",
              desc: "Gap Analysis pokaze dokladnie, czego brakuje Twojej stronie. Zacznij od pozycji oznaczonych jako Krytyczny.",
              color: "blue",
            },
          ].map(({ step, title, desc, color }) => (
            <div
              key={step}
              className="flex items-start gap-3 bg-zinc-800/30 border border-white/5 rounded-xl p-3"
            >
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 border"
                style={{
                  background: color === "violet" ? "oklch(0.55 0.22 290 / 0.2)" : color === "indigo" ? "oklch(0.55 0.22 265 / 0.2)" : "oklch(0.55 0.22 240 / 0.2)",
                  borderColor: color === "violet" ? "oklch(0.55 0.22 290 / 0.3)" : color === "indigo" ? "oklch(0.55 0.22 265 / 0.3)" : "oklch(0.55 0.22 240 / 0.3)",
                }}
              >
                <span
                  className="text-[10px] font-bold"
                  style={{ color: color === "violet" ? "oklch(0.72 0.22 290)" : color === "indigo" ? "oklch(0.72 0.22 265)" : "oklch(0.72 0.22 240)" }}
                >
                  {step}
                </span>
              </div>
              <div>
                <p className="text-xs font-semibold text-white mb-0.5">{title}</p>
                <p className="text-[11px] text-zinc-400 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
