/**
 * CitationOpportunityPanel
 *
 * The "aha moment" feature: explains WHY a page is not cited despite high scores,
 * and delivers actionable content briefs per query.
 *
 * UX philosophy:
 *  - Swiss watch: every element has a purpose, nothing is decorative noise
 *  - One clear message per card: "X engine cites Y because of Z — here's what to write"
 *  - Progressive disclosure: summary → per-query → structural gaps → content brief
 *  - Paywall: Free = top-3 opportunities (blurred), Pro = all + semantic insights
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import type { CitationOpportunity, StructuralGap } from "../../../server/citation/opportunityFinder";

// ─── Constants ────────────────────────────────────────────────────────────────

const ENGINE_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  google: "Google AI",
  perplexity: "Perplexity",
  gemini: "Gemini",
};

const ENGINE_COLORS: Record<string, string> = {
  chatgpt: "#10a37f",
  google: "#4285f4",
  perplexity: "#20b2aa",
  gemini: "#8b5cf6",
};

const PRIORITY_CONFIG = {
  critical: { label: "Krytyczna", color: "text-red-400", bg: "bg-red-500/10 border-red-500/25", dot: "bg-red-400" },
  high:     { label: "Wysoka",    color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/25", dot: "bg-orange-400" },
  medium:   { label: "Średnia",   color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/25", dot: "bg-yellow-400" },
  low:      { label: "Niska",     color: "text-zinc-400",   bg: "bg-zinc-500/10 border-zinc-500/20",     dot: "bg-zinc-400" },
};

const CATEGORY_ICONS: Record<string, string> = {
  contentStructure: "📝",
  structuredData: "🏗️",
  eeat: "🎖️",
  metaTags: "🏷️",
  technical: "⚙️",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function EngineChip({ engine }: { engine: string }) {
  const label = ENGINE_LABELS[engine] ?? engine;
  const color = ENGINE_COLORS[engine] ?? "#888";
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
      style={{ backgroundColor: color + "33", border: `1px solid ${color}55`, color }}
    >
      {label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: CitationOpportunity["priority"] }) {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${cfg.bg} ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function StructuralGapItem({ gap }: { gap: StructuralGap }) {
  const priorityColor = {
    critical: "text-red-400 border-red-500/20",
    high: "text-orange-400 border-orange-500/20",
    medium: "text-yellow-400 border-yellow-500/20",
  }[gap.priority] ?? "text-zinc-400 border-zinc-500/20";

  const icon = CATEGORY_ICONS[gap.category] ?? "•";

  return (
    <div className={`rounded-xl border p-3.5 bg-zinc-900/60 ${priorityColor.split(" ")[1]}`}>
      <div className="flex items-start gap-2.5">
        <span className="text-base mt-0.5 flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className={`text-xs font-bold ${priorityColor.split(" ")[0]}`}>{gap.label}</span>
            <span className="text-[10px] text-zinc-600">{gap.categoryLabel}</span>
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed mb-2">{gap.recommendation}</p>
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
            <span className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center text-[8px] text-red-400">✗</span>
            <span>Twoja strona</span>
            <span className="mx-1.5 text-zinc-700">vs</span>
            <span className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-[8px] text-emerald-400">✓</span>
            <span>Konkurent</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function OpportunityCard({
  opportunity,
  index,
  isBlurred,
  isPro,
  auditScore,
}: {
  opportunity: CitationOpportunity;
  index: number;
  isBlurred: boolean;
  isPro: boolean;
  auditScore: number | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = PRIORITY_CONFIG[opportunity.priority];

  const hasStructuralGaps = opportunity.structuralGaps.length > 0;
  const hasSemanticInsight = !!opportunity.semanticInsight;
  const topGap = opportunity.structuralGaps[0];

  return (
    <div className={`relative rounded-2xl border transition-all ${
      isBlurred ? "opacity-40 pointer-events-none select-none" : ""
    } ${cfg.bg}`}>
      {/* Card Header — the "aha moment" */}
      <button
        className="w-full text-left p-4"
        onClick={() => !isBlurred && setExpanded(e => !e)}
        disabled={isBlurred}
      >
        <div className="flex items-start gap-3">
          {/* Query number */}
          <div className="w-7 h-7 rounded-lg bg-zinc-800/80 border border-white/5 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-xs font-bold text-zinc-400">{index + 1}</span>
          </div>

          <div className="flex-1 min-w-0">
            {/* Query */}
            <p className="text-sm font-semibold text-white mb-1.5 leading-snug">
              „{opportunity.query}"
            </p>

            {/* Aha moment — the one-sentence explanation */}
            <p className="text-xs text-zinc-300 leading-relaxed mb-2.5">
              {opportunity.ahaMoment}
            </p>

            {/* Engine chips + priority */}
            <div className="flex items-center gap-2 flex-wrap">
              {opportunity.engines.map(e => <EngineChip key={e} engine={e} />)}
              <PriorityBadge priority={opportunity.priority} />
              {opportunity.structuralGaps.length > 0 && (
                <span className="text-[10px] text-zinc-500">
                  {opportunity.structuralGaps.length} {opportunity.structuralGaps.length === 1 ? "luka" : "luki"}
                </span>
              )}
            </div>
          </div>

          {/* Expand chevron */}
          <div className={`flex-shrink-0 w-6 h-6 rounded-lg bg-zinc-800/60 flex items-center justify-center transition-transform ${expanded ? "rotate-180" : ""}`}>
            <svg className="w-3 h-3 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Score paradox note — shown when audit score is high but not cited */}
        {auditScore !== null && auditScore >= 70 && (
          <div className="mt-3 ml-10 flex items-start gap-2 p-2.5 rounded-lg bg-zinc-800/50 border border-white/5">
            <svg className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-[10px] text-zinc-400 leading-relaxed">
              <span className="text-amber-400 font-semibold">Wynik {auditScore}/100</span> oznacza, że strona jest technicznie gotowa.
              {topGap
                ? ` Brakuje jednak "${topGap.label}" — tego konkretnego elementu, który zadecydował o cytowaniu.`
                : " Różnica jest subtelna — sprawdź szczegóły poniżej."}
            </p>
          </div>
        )}
      </button>

      {/* Expanded details */}
      {expanded && !isBlurred && (
        <div className="px-4 pb-4 border-t border-white/5 pt-4 space-y-4">

          {/* AI snippet — what the AI said */}
          {opportunity.aiSnippet && (
            <div>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wide font-medium mb-2">Co powiedział AI</p>
              <blockquote className="border-l-2 border-zinc-600 pl-3 text-xs text-zinc-400 italic leading-relaxed">
                „{opportunity.aiSnippet.slice(0, 200)}{opportunity.aiSnippet.length > 200 ? "…" : ""}"
              </blockquote>
            </div>
          )}

          {/* Structural gaps */}
          {hasStructuralGaps && (
            <div>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wide font-medium mb-2.5">
                Co ma konkurent, czego Tobie brakuje
              </p>
              <div className="space-y-2">
                {opportunity.structuralGaps.map(gap => (
                  <StructuralGapItem key={gap.checkId} gap={gap} />
                ))}
              </div>
            </div>
          )}

          {/* Semantic insight — Pro only */}
          {hasSemanticInsight && opportunity.semanticInsight && (
            <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm">🧠</span>
                <p className="text-xs font-bold text-violet-300">Analiza semantyczna AI</p>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30">PRO</span>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-[10px] text-zinc-500 mb-1">Dlaczego konkurent wygrał</p>
                  <p className="text-xs text-zinc-300 leading-relaxed">{opportunity.semanticInsight.whyCompetitorWon}</p>
                </div>

                <div className="rounded-lg bg-emerald-500/8 border border-emerald-500/20 p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-xs">✍️</span>
                    <p className="text-[10px] font-bold text-emerald-300 uppercase tracking-wide">Co napisać, żeby wygrać</p>
                    {opportunity.semanticInsight.isQuickWin && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        ⚡ Quick Win
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-200 leading-relaxed">{opportunity.semanticInsight.contentBrief}</p>
                  <p className="text-[10px] text-zinc-500 mt-2">
                    Szacowana objętość: ~{opportunity.semanticInsight.estimatedWordCount} słów
                  </p>
                </div>

                <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                  <span>Intencja: <span className="text-zinc-300 font-medium">{opportunity.semanticInsight.queryIntent}</span></span>
                  <span>•</span>
                  <span>Format: <span className="text-zinc-300 font-medium">{opportunity.semanticInsight.responseType}</span></span>
                </div>
              </div>
            </div>
          )}

          {/* Semantic insight locked for free users */}
          {!hasSemanticInsight && !isPro && (
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm">🧠</span>
                <p className="text-xs font-semibold text-violet-300">Analiza semantyczna AI</p>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30">PRO</span>
              </div>
              <p className="text-xs text-zinc-400">
                Dowiedz się dokładnie co napisać, żeby wygrać to zapytanie — AI analizuje odpowiedź i generuje konkretny content brief.
              </p>
            </div>
          )}

          {/* Competitor info */}
          <div className="flex items-center gap-2 pt-1 border-t border-white/5">
            <span className="text-[10px] text-zinc-600">Cytowany konkurent:</span>
            <a
              href={opportunity.competitorUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors truncate max-w-[200px]"
            >
              {opportunity.competitorTitle ?? opportunity.competitorDomain}
            </a>
            <span className="text-[10px] text-zinc-600 ml-auto">
              Cytowany {opportunity.competitorCitationCount}× w tym audycie
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Summary Bar ──────────────────────────────────────────────────────────────

function OpportunitySummaryBar({
  totalQueriesChecked,
  queriesCited,
  queriesMissed,
  opportunityScore,
}: {
  totalQueriesChecked: number;
  queriesCited: number;
  queriesMissed: number;
  opportunityScore: number;
}) {
  const citedPct = totalQueriesChecked > 0 ? (queriesCited / totalQueriesChecked) * 100 : 0;

  const scoreColor = opportunityScore >= 70
    ? "text-emerald-400"
    : opportunityScore >= 40
    ? "text-yellow-400"
    : "text-red-400";

  return (
    <div className="grid grid-cols-3 gap-3 mb-4">
      <div className="rounded-xl border border-white/5 bg-zinc-900/40 p-3 text-center">
        <p className="text-xl font-black tabular-nums text-white">{totalQueriesChecked}</p>
        <p className="text-[10px] text-zinc-500 mt-0.5">Sprawdzonych zapytań</p>
      </div>
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
        <p className="text-xl font-black tabular-nums text-emerald-400">{queriesCited}</p>
        <p className="text-[10px] text-zinc-500 mt-0.5">Cytowań Twojej strony</p>
      </div>
      <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3 text-center">
        <p className={`text-xl font-black tabular-nums ${scoreColor}`}>{opportunityScore}</p>
        <p className="text-[10px] text-zinc-500 mt-0.5">Szansa na poprawę /100</p>
      </div>
    </div>
  );
}

// ─── Why Score Doesn't Equal Citations ───────────────────────────────────────

function ScoreParadoxExplainer({ auditScore, citedCount }: { auditScore: number | null; citedCount: number }) {
  if (!auditScore || auditScore < 60 || citedCount > 0) return null;

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 mb-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.347a3.75 3.75 0 01-5.303 0l-.347-.347z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-bold text-amber-300 mb-1">
            Wynik {auditScore}/100, ale 0 cytowań — dlaczego?
          </p>
          <p className="text-xs text-zinc-300 leading-relaxed">
            <strong className="text-white">Wysoki wynik audytu</strong> oznacza, że strona jest technicznie gotowa do cytowania — ma poprawną strukturę, schema.org, EEAT i dostępność dla botów AI.
            Jednak cytowanie zależy od <strong className="text-white">kontekstu konkretnego zapytania</strong> — czy Twoja treść bezpośrednio odpowiada na pytanie, które zadał użytkownik.
          </p>
          <p className="text-xs text-zinc-400 leading-relaxed mt-2">
            Poniżej znajdziesz dokładnie <strong className="text-white">które zapytania "wygrał" konkurent i dlaczego</strong> — oraz co konkretnie napisać, żeby następnym razem to Twoja strona była cytowana.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface CitationOpportunityPanelProps {
  auditId: number;
  auditScore?: number | null;
  citedCount?: number;
  isPro: boolean;
  citationJobStatus?: string | null;
}

export function CitationOpportunityPanel({
  auditId,
  auditScore = null,
  citedCount = 0,
  isPro,
  citationJobStatus,
}: CitationOpportunityPanelProps) {
  const { user } = useAuth();
  const [showAll, setShowAll] = useState(false);

  const isJobComplete = citationJobStatus === "completed";

  const { data, isLoading, error } = trpc.citation.getOpportunities.useQuery(
    {
      auditId,
      includeSemanticInsights: isPro,
    },
    {
      enabled: isJobComplete,
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
      refetchInterval: (query) => {
        // Stop polling once we have data
        if (query.state.data?.opportunities?.length) return false;
        return false; // Don't poll — data is computed on-demand
      },
    }
  );

  // Don't render if citation job hasn't completed
  if (!isJobComplete) return null;

  // Loading state
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-white/5 bg-zinc-900/30 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center">
            <span className="text-base">🎯</span>
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Citation Opportunities</h3>
            <p className="text-xs text-zinc-500">Analizuję szanse cytowania…</p>
          </div>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 rounded-xl bg-zinc-800/40 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) return null;

  // No data
  if (!data || !data.opportunities) return null;

  const { opportunities, totalQueriesChecked, queriesCited, queriesMissed, opportunityScore } = data;

  // If no missed queries, show success state
  if (opportunities.length === 0 && queriesCited > 0) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
            <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-emerald-300">Brak luk — Twoja strona jest cytowana!</p>
            <p className="text-xs text-zinc-400 mt-0.5">
              Sprawdzono {totalQueriesChecked} zapytań — Twoja strona pojawia się w cytowaniach AI.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (opportunities.length === 0) return null;

  // Paywall logic: Free = top-3 visible, rest blurred
  const FREE_LIMIT = 3;
  const visibleCount = isPro || showAll ? opportunities.length : Math.min(FREE_LIMIT, opportunities.length);
  const lockedCount = opportunities.length - FREE_LIMIT;
  const showPaywall = !isPro && opportunities.length > FREE_LIMIT;

  return (
    <div className="rounded-2xl border border-violet-500/15 bg-zinc-900/30 p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center flex-shrink-0">
            <span className="text-base">🎯</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">Citation Opportunities</h3>
              {!isPro && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  PRO
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              {queriesMissed} {queriesMissed === 1 ? "zapytanie, na którym" : "zapytań, na których"} cytuje konkurenta zamiast Ciebie
            </p>
          </div>
        </div>
        <div className="text-right relative group">
          {/* Label with info icon */}
          <div className="flex items-center justify-end gap-1 cursor-help mb-0.5">
            <p className="text-[10px] text-zinc-500">Potencjał wzrostu</p>
            <svg className="w-3 h-3 text-zinc-600 shrink-0" fill="none" viewBox="0 0 16 16">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 7v4M8 5.5v.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <p className={`text-lg font-black tabular-nums ${
            opportunityScore >= 70 ? "text-emerald-400" : opportunityScore >= 40 ? "text-yellow-400" : "text-orange-400"
          }`}>{opportunityScore}<span className="text-xs text-zinc-600">/100</span></p>
          {/* Tooltip */}
          <div className="absolute right-0 top-full mt-2 w-72 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <div className="rounded-xl border border-white/10 bg-zinc-900 shadow-2xl p-4 text-left">
              <p className="text-xs font-bold text-zinc-100 mb-1.5">Co oznacza Potencjał wzrostu?</p>
              <p className="text-[11px] text-zinc-400 leading-relaxed mb-3">
                Wskaźnik 0–100 mówiący, ile możesz zyskać na widoczności w AI Search, jeśli wdrożysz rekomendacje z Citation Opportunities. Im wyższy wynik, tym więcej zapytań możesz odzyskać od konkurencji.
              </p>
              <div className="space-y-1.5 mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  <span className="text-[10px] text-zinc-400"><strong className="text-zinc-300">70–100</strong> — duży potencjał, wiele luk do wypełnienia</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-yellow-400 shrink-0" />
                  <span className="text-[10px] text-zinc-400"><strong className="text-zinc-300">40–69</strong> — średni potencjał, wybrane szanse</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
                  <span className="text-[10px] text-zinc-400"><strong className="text-zinc-300">0–39</strong> — niski potencjał, mało luk do wypełnienia</span>
                </div>
              </div>
              <div className="rounded-lg bg-violet-500/10 border border-violet-500/20 p-2.5">
                <p className="text-[10px] text-violet-300 font-medium">✨ Signal Rewrite automatycznie wdraża rekomendacje z Citation Opportunities w nowej wersji treści.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Score paradox explainer */}
      <ScoreParadoxExplainer auditScore={auditScore} citedCount={citedCount} />

      {/* Summary bar */}
      <OpportunitySummaryBar
        totalQueriesChecked={totalQueriesChecked}
        queriesCited={queriesCited}
        queriesMissed={queriesMissed}
        opportunityScore={opportunityScore}
      />

      {/* Why high score matters even when not cited — educational note */}
      <div className="rounded-xl border border-white/5 bg-zinc-900/40 p-3.5 mb-4">
        <p className="text-[10px] text-zinc-500 leading-relaxed">
          <span className="text-zinc-300 font-semibold">Dlaczego warto dbać o wysoki wynik audytu?</span>{" "}
          Strony z wyższym AI Readiness Score są cytowane <strong className="text-zinc-200">3-5× częściej</strong> w dłuższej perspektywie — nawet jeśli dziś nie pojawiają się na konkretnych zapytaniach.
          Wysoki wynik to fundament. Citation Opportunities to taktyka — konkretne fragmenty treści, które decydują o cytowaniu <em>teraz</em>.
        </p>
      </div>

      {/* Opportunity cards */}
      <div className="space-y-3">
        {opportunities.slice(0, visibleCount).map((opp, idx) => (
          <OpportunityCard
            key={`${opp.query}-${opp.competitorUrl}`}
            opportunity={opp}
            index={idx}
            isBlurred={false}
            isPro={isPro}
            auditScore={auditScore}
          />
        ))}

        {/* Blurred locked cards */}
        {showPaywall && opportunities.slice(FREE_LIMIT).map((opp, idx) => (
          <OpportunityCard
            key={`locked-${opp.query}`}
            opportunity={opp}
            index={FREE_LIMIT + idx}
            isBlurred={true}
            isPro={isPro}
            auditScore={auditScore}
          />
        ))}
      </div>

      {/* Paywall CTA */}
      {showPaywall && (
        <div className="mt-4 rounded-xl border border-violet-500/25 bg-violet-500/8 p-4 text-center">
          <p className="text-sm font-bold text-white mb-1">
            {lockedCount} więcej {lockedCount === 1 ? "szansa" : "szans"} na cytowanie
          </p>
          <p className="text-xs text-zinc-400 mb-3">
            Odblokuj wszystkie szanse + analizę semantyczną AI — co konkretnie napisać, żeby wygrać każde zapytanie.
          </p>
          {user ? (
            <a
              href="/pricing"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-colors"
            >
              Odblokuj Plan Pro
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </a>
          ) : (
            <a
              href={getLoginUrl()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-colors"
            >
              Zaloguj się, aby zobaczyć wszystkie
            </a>
          )}
        </div>
      )}
    </div>
  );
}
