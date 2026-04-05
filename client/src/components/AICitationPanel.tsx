/**
 * AICitationPanel v4 — Adaptive Fan-Out Results
 *
 * Displays:
 *  - Idle: CTA with stats (5 rounds × 5 queries × 2 engines)
 *  - Running: live progress with last checked queries
 *  - Completed: round-by-round accordion with full query text,
 *    per-engine status, competitor domains (Pro gate), summary hero
 *  - Failed: retry button
 *
 * PLG upsell: competitor domains blurred/locked in Free plan
 */

import { useState, useEffect, useCallback, forwardRef, useImperativeHandle, useMemo } from "react";
import { useCitationStream } from "@/hooks/useCitationStream";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { Link, useLocation } from "wouter";
import { ENGINE_CONFIG, ALL_ENGINES, getVisibilityScoreResult } from "../../../shared/visibilityScore";
import { GapAnalysisPanel } from "./GapAnalysisPanel";
import { CitationOpportunityPanel } from "./CitationOpportunityPanel";
import { PhraseManager } from "./PhraseManager";
import { CitationNarrativeCard } from "./CitationNarrativeCard";
import { EmotionalTensionFeed } from "./EmotionalTensionFeed";
import { QuickSignalCard, type QuickSignalData } from "./QuickSignalCard";
import { CitationZeroState } from "./CitationZeroState";
import { ScoreReveal, type ScoreRevealEngine } from "./ScoreReveal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CitationCheck {
  id: number;
  query: string;
  engine: "chatgpt" | "google" | "perplexity" | "gemini";
  round: number;
  isCited: "yes" | "domain" | "no";
  citedUrl?: string | null;
  domainCitedUrl?: string | null;
  allCitedUrls?: string[] | null;
  competitorDomains?: string[] | null;
  snippet?: string | null;
  responseText?: string | null;
  hasAIOverview?: boolean | null;
  fromCache?: boolean;
}

interface CitationJob {
  id: number;
  status: "pending" | "running" | "completed" | "failed";
  prompts?: string[] | null;
  language?: string | null;
}

interface Props {
  auditId: number;
  url?: string;
  /** Overall audit score (0-100) — used for score paradox explainer in CitationOpportunityPanel */
  overallScore?: number | null;
  /** Called when citation job completes with all cited competitor URLs */
  onCompetitorUrlsReady?: (urls: string[]) => void;
  /** Called when citation status changes — used by parent to update Sticky Score Bar */
  onStatusChange?: (status: "idle" | "running" | "done" | "error", citedCount?: number, totalEngines?: number) => void;
}

export interface AICitationPanelHandle {
  startCheck: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace("www.", ""); }
  catch { return url; }
}

function groupByRound(checks: CitationCheck[]): Map<number, CitationCheck[]> {
  const map = new Map<number, CitationCheck[]>();
  for (const c of checks) {
    const r = c.round ?? 1;
    if (!map.has(r)) map.set(r, []);
    map.get(r)!.push(c);
  }
  return map;
}

function groupByQuery(checks: CitationCheck[]): Map<string, CitationCheck[]> {
  const map = new Map<string, CitationCheck[]>();
  for (const c of checks) {
    if (!map.has(c.query)) map.set(c.query, []);
    map.get(c.query)!.push(c);
  }
  return map;
}

function getQueryStatus(checks: CitationCheck[]): "yes" | "domain" | "no" {
  if (checks.some(c => c.isCited === "yes")) return "yes";
  if (checks.some(c => c.isCited === "domain")) return "domain";
  return "no";
}

function rankCompetitors(checks: CitationCheck[], targetDomain: string): { domain: string; url: string; count: number }[] {
  // Track both full URL and domain frequency
  // We keep the most-cited URL per domain as the representative link
  const urlFreq: Record<string, number> = {};
  const domainToUrls: Record<string, string[]> = {};

  for (const c of checks) {
    for (const u of (c.allCitedUrls ?? [])) {
      try {
        const parsed = new URL(u);
        const d = parsed.hostname.replace("www.", "");
        if (!d || d === targetDomain) continue;
        // Skip translate.google.com and similar noise
        if (d.includes("google.com") || d.includes("translate.")) continue;
        urlFreq[u] = (urlFreq[u] ?? 0) + 1;
        if (!domainToUrls[d]) domainToUrls[d] = [];
        if (!domainToUrls[d].includes(u)) domainToUrls[d].push(u);
      } catch {}
    }
  }

  // Aggregate by domain: sum all URL frequencies, pick most-cited URL as representative
  const domainFreq: Record<string, number> = {};
  const domainRepUrl: Record<string, string> = {};
  for (const [domain, urls] of Object.entries(domainToUrls)) {
    const total = urls.reduce((sum, u) => sum + (urlFreq[u] ?? 0), 0);
    domainFreq[domain] = total;
    // Pick the URL with highest individual frequency as representative
    domainRepUrl[domain] = urls.sort((a, b) => (urlFreq[b] ?? 0) - (urlFreq[a] ?? 0))[0];
  }

  return Object.entries(domainFreq)
    .map(([domain, count]) => ({ domain, url: domainRepUrl[domain], count }))
    .sort((a, b) => b.count - a.count);
}

function hasCitation(checks: CitationCheck[]): boolean {
  return checks.some(c => c.isCited === "yes" || c.isCited === "domain");
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status, small }: { status: "yes" | "domain" | "no"; small?: boolean }) {
  const cls = small ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2.5 py-1";
  if (status === "yes") return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 ${cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
      Cytowany
    </span>
  );
  if (status === "domain") return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 ${cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
      Inna podstrona
    </span>
  );
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold bg-zinc-700/50 text-zinc-400 border border-zinc-600/50 ${cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
      Brak
    </span>
  );
}

// ─── Engine Icon ──────────────────────────────────────────────────────────────

function EngineChip({ engine }: { engine: "chatgpt" | "google" | "perplexity" | "gemini" }) {
  if (engine === "chatgpt") return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[#10a37f]/15 text-[#10a37f] border border-[#10a37f]/20 font-medium">
      <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 fill-[#10a37f]"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.843-3.372L15.115 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.403-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg>
      ChatGPT
    </span>
  );
  if (engine === "perplexity") return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[#20b2aa]/15 text-[#20b2aa] border border-[#20b2aa]/20 font-medium">
      <svg viewBox="0 0 24 24" className="w-2.5 h-2.5" fill="currentColor"><path d="M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2s10 4.477 10 10zm-10 6a6 6 0 100-12 6 6 0 000 12zm0-2a4 4 0 110-8 4 4 0 010 8zm0-2a2 2 0 100-4 2 2 0 000 4z"/></svg>
      Perplexity
    </span>
  );
  if (engine === "gemini") return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/20 font-medium">
      <svg viewBox="0 0 24 24" className="w-2.5 h-2.5" fill="currentColor"><path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5L12 2z"/></svg>
      Gemini
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/20 font-medium">
      <svg viewBox="0 0 24 24" className="w-2.5 h-2.5" fill="none">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      Google AI
    </span>
  );
}

// ─── Query Card ───────────────────────────────────────────────────────────────

function QueryCard({ query, checks, isPro, defaultOpen }: {
  query: string;
  checks: CitationCheck[];
  isPro: boolean;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const status = getQueryStatus(checks);
  const googleCheck = checks.find(c => c.engine === "google");
  const chatgptCheck = checks.find(c => c.engine === "chatgpt");
  const perplexityCheck = checks.find(c => c.engine === "perplexity");
  const geminiCheck = checks.find(c => c.engine === "gemini");
  const allCitedUrls = Array.from(new Set(checks.flatMap(c => c.allCitedUrls ?? [])));
  const competitors = allCitedUrls
    .filter(u => {
      try {
        const h = new URL(u).hostname.replace("www.", "");
        return !h.includes("google.com") && !h.includes("translate.");
      } catch { return false; }
    })
    .slice(0, 8);

  const borderCls = status === "yes"
    ? "border-emerald-500/30 bg-emerald-500/4"
    : status === "domain"
    ? "border-amber-500/30 bg-amber-500/4"
    : "border-white/6 bg-zinc-900/30";

  return (
    <div className={`rounded-xl border overflow-hidden ${borderCls}`}>
      {/* Header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start gap-3 p-3.5 text-left hover:bg-white/2 transition-colors"
      >
        {/* Status dot */}
        <div className="mt-0.5 flex-shrink-0">
          {status === "yes" && <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1 animate-pulse" />}
          {status === "domain" && <div className="w-2 h-2 rounded-full bg-amber-400 mt-1" />}
          {status === "no" && <div className="w-2 h-2 rounded-full bg-zinc-600 mt-1" />}
        </div>

        <div className="flex-1 min-w-0">
          {/* Prompt label */}
          <div className="flex items-center gap-1.5 mb-1">
            <svg className="w-3 h-3 text-zinc-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wide">Zapytanie do AI</span>
          </div>
          {/* Full query text -- professional exposition */}
          <p className="text-sm text-zinc-100 font-medium leading-snug">
            „{query}"
          </p>
          {/* Engine chips + status */}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <StatusBadge status={status} small />
            {googleCheck && <EngineChip engine="google" />}
            {chatgptCheck && <EngineChip engine="chatgpt" />}
            {perplexityCheck && <EngineChip engine="perplexity" />}
            {geminiCheck && <EngineChip engine="gemini" />}
            {googleCheck?.hasAIOverview === false && (
              <span className="text-[10px] text-zinc-600">brak AI Overview</span>
            )}
            {allCitedUrls.length > 0 && (
              <span className="text-[10px] text-zinc-500">{allCitedUrls.length} źródeł</span>
            )}
          </div>
        </div>

        <svg
          className={`w-4 h-4 text-zinc-500 flex-shrink-0 transition-transform mt-0.5 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded details */}
      {open && (
        <div className="px-3.5 pb-3.5 pt-2 border-t border-white/6 space-y-3">
          {/* Per-engine results */}
          {checks.map(check => {
            const engineName = check.engine === "google" ? "Google AI Overviews" :
              check.engine === "chatgpt" ? "ChatGPT" :
              check.engine === "perplexity" ? "Perplexity" : "Gemini";
            return (
            <div key={check.id} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <EngineChip engine={check.engine} />
                {check.isCited !== "no" && (
                  <span className="text-[10px] text-zinc-400 font-medium">{engineName} zacytowało:</span>
                )}
                {check.isCited === "no" && <StatusBadge status={check.isCited} small />}
                {check.fromCache && <span className="text-[10px] text-zinc-600">cache</span>}
              </div>

              {check.isCited === "yes" && check.citedUrl && (
                <div className="ml-1 p-2.5 rounded-lg bg-emerald-500/8 border border-emerald-500/20">
                  <p className="text-[10px] text-emerald-400 font-semibold mb-1">✅ Twoja strona jest cytowana</p>
                  <a href={check.citedUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-emerald-300 hover:underline break-all">
                    {check.citedUrl}
                  </a>
                </div>
              )}

              {check.isCited === "domain" && check.domainCitedUrl && (
                <div className="ml-1 p-2.5 rounded-lg bg-amber-500/8 border border-amber-500/20">
                  <p className="text-[10px] text-amber-400 font-semibold mb-1">🔗 Inna podstrona Twojej domeny</p>
                  <a href={check.domainCitedUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-amber-300 hover:underline break-all">
                    {check.domainCitedUrl}
                  </a>
                  <p className="text-[10px] text-zinc-500 mt-1.5">
                    AI cytuje inną podstronę Twojej domeny. Sprawdź, czy jest lepiej zoptymalizowana pod to zapytanie.
                  </p>
                </div>
              )}

              {check.snippet && (
                <p className="ml-1 text-xs text-zinc-400 italic border-l-2 border-zinc-700 pl-2 leading-relaxed">
                  {check.snippet}
                </p>
              )}

              {check.engine === "google" && check.hasAIOverview === false && (
                <p className="ml-1 text-[10px] text-zinc-600">
                  Google nie wyświetlił AI Overview dla tego zapytania.
                </p>
              )}
            </div>
            );
          })}

          {/* Competitor domains for this query */}
          {competitors.length > 0 && (
            <div>
              {!isPro ? (
                <div className="relative rounded-lg overflow-hidden">
                  {/* Blurred preview */}
                  <div className="blur-sm pointer-events-none select-none p-2 space-y-1" aria-hidden>
                    {competitors.slice(0, 4).map((u, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />
                        <span className="text-zinc-300">{getDomain(u)}</span>
                      </div>
                    ))}
                  </div>
                  {/* Upsell overlay */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/85 backdrop-blur-sm rounded-lg p-3 text-center">
                    <svg className="w-4 h-4 text-amber-400 mb-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <p className="text-xs font-semibold text-white mb-0.5">{competitors.length} konkurentów — plan Pro</p>
                    <p className="text-[10px] text-zinc-400">Odblokuj pełną listę domen</p>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wide mb-1.5">
                    Cytowane przez AI:
                  </p>
                  <div className="flex flex-col gap-1">
                    {competitors.map((u, i) => (
                      <a key={i} href={u} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-zinc-300 hover:text-white hover:underline transition-colors truncate block"
                        title={u}>
                        {u}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Round Section ────────────────────────────────────────────────────────────

function RoundSection({ round, checks, isPro, isLast }: {
  round: number;
  checks: CitationCheck[];
  isPro: boolean;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const roundFound = hasCitation(checks);
  const byQuery = groupByQuery(checks);
  const queryCount = byQuery.size;

  return (
    <div className="space-y-2">
      {/* Round header */}
      <button
        className="w-full flex items-center gap-3 py-1.5 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 border ${
          roundFound
            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
            : isLast
            ? "bg-red-500/10 text-red-400 border-red-500/30"
            : "bg-zinc-800 text-zinc-400 border-zinc-700"
        }`}>
          {round}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-zinc-200">
            Runda {round} — {queryCount} {queryCount === 1 ? "zapytanie" : queryCount < 5 ? "zapytania" : "zapytań"}
          </span>
          {roundFound ? (
            <span className="ml-2 text-xs text-emerald-400">✓ Znaleziono cytowanie</span>
          ) : isLast ? (
            <span className="ml-2 text-xs text-red-400">Brak cytowania</span>
          ) : (
            <span className="ml-2 text-xs text-zinc-500">Brak — kontynuowano</span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-zinc-500 flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="space-y-2 ml-4 pl-4 border-l-2 border-zinc-800">
          {Array.from(byQuery.entries()).map(([query, qChecks], i) => (
            <QueryCard
              key={query}
              query={query}
              checks={qChecks}
              isPro={isPro}
              defaultOpen={i === 0 && roundFound}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Competitor Engine Badges ─────────────────────────────────────────────────
// For each competitor domain, find which engines cited it
function getEnginesForDomain(checks: CitationCheck[], domain: string): ("chatgpt" | "google" | "perplexity" | "gemini")[] {
  const engines = new Set<"chatgpt" | "google" | "perplexity" | "gemini">();
  for (const c of checks) {
    for (const u of (c.allCitedUrls ?? [])) {
      try {
        const h = new URL(u).hostname.replace("www.", "");
        if (h === domain) engines.add(c.engine);
      } catch {}
    }
  }
  return Array.from(engines);
}

// ─── Global Competitor Summary ────────────────────────────────────────────────

const TOP_N = 5;

function CompetitorSummary({ checks, targetDomain, isPro }: {
  checks: CitationCheck[];
  targetDomain: string;
  isPro: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const competitors = rankCompetitors(checks, targetDomain);
  if (competitors.length === 0) return null;
  const maxCount = competitors[0]?.count ?? 1;
  const visible = showAll ? competitors : competitors.slice(0, TOP_N);
  const hidden = competitors.length - TOP_N;

  return (
    <div className="bg-zinc-900/40 border border-white/8 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Kto dominuje zamiast Ciebie</h3>
          <p className="text-xs text-zinc-500">Domeny najczęściej cytowane przez AI dla Twoich zapytań</p>
        </div>
        {!isPro && (
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold">
            Pro
          </span>
        )}
      </div>

      {!isPro ? (
        <div className="relative">
          {/* Blurred preview -- always show top 5 rows */}
          <div className="blur-sm pointer-events-none select-none space-y-2" aria-hidden>
            {competitors.slice(0, TOP_N).map((d) => (
              <div key={d.domain} className="flex items-center gap-3">
                <span className="text-xs text-zinc-300 flex-1 truncate">{d.domain}</span>
                <div className="h-1.5 bg-purple-500/50 rounded-full" style={{ width: `${Math.round((d.count / maxCount) * 100)}px` }} />
                <span className="text-xs text-zinc-500 w-6 text-right">{d.count}×</span>
              </div>
            ))}
          </div>
          {/* Upsell overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/85 backdrop-blur-sm rounded-xl p-5 text-center">
            <svg className="w-6 h-6 text-amber-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <p className="text-base font-bold text-white mb-1">
              {competitors.length} domen wyprzedza Cię w AI Search
            </p>
            <p className="text-xs text-zinc-400 mb-4 max-w-xs">
              Odblokuj pełną listę konkurentów, ich częstotliwość cytowań i strategię widoczności w planie Pro.
            </p>
            <Button className="bg-amber-500 hover:bg-amber-600 text-black font-bold text-sm">
              ⚡ Odblokuj za $99/mies.
            </Button>
            <p className="text-[10px] text-zinc-600 mt-2">Anuluj w dowolnym momencie</p>
          </div>
        </div>
      ) : (
        <div>
          <div className="space-y-2">
            {visible.map((d, i) => {
              const engines = getEnginesForDomain(checks, d.domain);
              return (
                <div key={d.domain} className="flex items-start gap-3 py-1.5 border-b border-white/4 last:border-0">
                  {/* Rank */}
                  <span className="text-xs text-zinc-600 w-4 text-right flex-shrink-0 mt-0.5">{i + 1}</span>
                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    {/* Domain + count */}
                    <div className="flex items-center justify-between mb-1">
                      <a href={d.url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-zinc-200 hover:text-white font-semibold transition-colors truncate mr-2"
                        title={d.url}>
                        {d.domain}
                      </a>
                      <span className="text-xs text-zinc-500 flex-shrink-0 font-mono">{d.count}×</span>
                    </div>
                    {/* Progress bar */}
                    <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mb-1.5">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all"
                        style={{ width: `${Math.round((d.count / maxCount) * 100)}%` }}
                      />
                    </div>
                    {/* Engine badges -- which AI cited this domain */}
                    {engines.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[9px] text-zinc-600 mr-0.5">cytowane przez:</span>
                        {engines.map(e => <EngineChip key={e} engine={e} />)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Show more / less toggle */}
          {hidden > 0 && (
            <button
              onClick={() => setShowAll(v => !v)}
              className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors py-2 rounded-lg hover:bg-white/4 border border-dashed border-white/10 hover:border-white/20"
            >
              {showAll ? (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
                  Zwiń listę
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                  Pokaż {hidden} więcej {hidden === 1 ? "domenę" : hidden < 5 ? "domeny" : "domen"}
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── PLG Upsell ───────────────────────────────────────────────────────────────

// ─── Competitor Intelligence Panel ──────────────────────────────────────────────────

/**
 * Shows top-5 competitor pages with their AI-Readiness Score vs. audited page.
 * Data is populated asynchronously after citation check completes (fire-and-forget).
 * Pro gate: Starter/Free see blurred rows with upgrade CTA.
 */
function CompetitorIntelPanel({ auditId, isPro, citationJobStatus }: { auditId: number; isPro: boolean; citationJobStatus?: string | null }) {
  // Smart polling: competitor audit runs async ~30-60s after citation job completes.
  // Poll every 5s for up to 3 minutes until data arrives, then stop.
  const [pollCount, setPollCount] = useState(0);
  const MAX_POLLS = 36; // 36 × 5s = 3 min max

  const { data: competitors, isLoading, refetch } = trpc.competitor.getForAudit.useQuery(
    { auditId },
    { retry: false, staleTime: 0 }
  );

  const hasCompleted = !!(competitors && competitors.some(c => c.status === "completed"));

  // Start polling when citation job is done but competitor data isn't ready yet
  useEffect(() => {
    if (hasCompleted) return; // data arrived — stop
    if (pollCount >= MAX_POLLS) return; // timeout
    // Only poll when citation job is completed (competitor audit is in progress)
    if (citationJobStatus !== "completed") return;
    const timer = setTimeout(() => {
      refetch();
      setPollCount(p => p + 1);
    }, 5000);
    return () => clearTimeout(timer);
  }, [hasCompleted, pollCount, citationJobStatus]);

  // Not yet populated (citation job still running or no competitors found)
  if (isLoading) return null;
  if (!competitors || competitors.length === 0) {
    // Show a subtle loading indicator when citation job is done (competitor audit in progress)
    if (citationJobStatus === "completed" && pollCount < MAX_POLLS) {
      return (
        <div className="bg-zinc-900/40 border border-white/8 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-3 h-3 rounded-full border-2 border-zinc-500 border-t-transparent animate-spin flex-shrink-0" />
          <span className="text-xs text-zinc-500">Trwa analiza konkurencji… może potrwać do 2 minut</span>
        </div>
      );
    }
    return null;
  }

  const completed = competitors.filter(c => c.status === "completed");
  if (completed.length === 0) return null;

  // ── Freshness indicator ──────────────────────────────────────────────────────
  // Use the most recent completedAt among all completed competitors.
  const latestCompletedAt: Date | null = completed.reduce<Date | null>((latest, c) => {
    if (!c.completedAt) return latest;
    const d = new Date(c.completedAt);
    return !latest || d > latest ? d : latest;
  }, null);

  function formatRelativeTime(date: Date): string {
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    const diffH = Math.floor(diffMin / 60);
    const diffD = Math.floor(diffH / 24);
    if (diffMin < 2) return "przed chwilą";
    if (diffMin < 60) return `${diffMin} min temu`;
    if (diffH < 24) return `${diffH} godz. temu`;
    if (diffD === 1) return "wczoraj";
    if (diffD < 7) return `${diffD} dni temu`;
    return date.toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
  }

  // Fresh = completed within last 24 h; Stale = older
  const isFresh = latestCompletedAt
    ? Date.now() - latestCompletedAt.getTime() < 24 * 60 * 60 * 1000
    : false;

  // Score tier color helper
  function scoreColor(score: number | null): string {
    if (score === null) return "text-zinc-500";
    if (score >= 75) return "text-emerald-400";
    if (score >= 50) return "text-amber-400";
    return "text-red-400";
  }

  function ScoreBar({ score }: { score: number | null }) {
    if (score === null) return <span className="text-zinc-600 text-xs">N/A</span>;
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              score >= 75 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-red-500"
            }`}
            style={{ width: `${score}%` }}
          />
        </div>
        <span className={`text-xs font-bold tabular-nums w-7 text-right ${scoreColor(score)}`}>{score}</span>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/40 border border-white/8 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center flex-shrink-0">
          <svg className="w-3.5 h-3.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Competitor Intelligence</h3>
          <p className="text-[10px] text-zinc-500">AI-Readiness Score stron, które AI cytuje zamiast Twojej</p>
        </div>
        {/* Freshness badge + last-run timestamp */}
        <div className="ml-auto flex items-center gap-2">
          {latestCompletedAt && (
            <span
              title={`Ostatni audyt: ${latestCompletedAt.toLocaleString("pl-PL")}`}
              className={`flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full border ${
                isFresh
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/25"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${
                isFresh ? "bg-emerald-400" : "bg-amber-400"
              }`} />
              {formatRelativeTime(latestCompletedAt)}
            </span>
          )}
          {!isPro && (
            <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30">Pro</span>
          )}
        </div>
      </div>

      {/* Column headers */}
      <div className="px-4 py-2 grid grid-cols-[1fr_80px_80px_80px] gap-2 border-b border-white/5">
        <span className="text-[10px] text-zinc-600 uppercase tracking-wide font-medium">Strona konkurenta</span>
        <span className="text-[10px] text-zinc-600 uppercase tracking-wide font-medium text-center">Cytowania</span>
        <span className="text-[10px] text-zinc-600 uppercase tracking-wide font-medium">AI Score</span>
        <span className="text-[10px] text-zinc-600 uppercase tracking-wide font-medium">Dostęp tech.</span>
      </div>

      {/* Competitor rows */}
      <div className="divide-y divide-white/5">
        {completed.map((comp, idx) => {
          const isBlurred = !isPro && idx >= 2;
          return (
            <div
              key={comp.id}
              className={`px-4 py-3 grid grid-cols-[1fr_80px_80px_80px] gap-2 items-center transition-colors hover:bg-white/2 ${
                isBlurred ? "relative" : ""
              }`}
            >
              {isBlurred && (
                <div className="absolute inset-0 backdrop-blur-sm bg-zinc-950/60 flex items-center justify-center z-10 rounded">
                  <Link href="/pricing">
                    <span className="text-[11px] text-violet-400 font-semibold hover:text-violet-300 cursor-pointer">
                      🔒 Odblokuj pełną analizę → Pro
                    </span>
                  </Link>
                </div>
              )}
              {/* Domain + rank */}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded text-[9px] font-bold bg-zinc-800 text-zinc-500 flex items-center justify-center flex-shrink-0">
                    {comp.rank}
                  </span>
                  <a
                    href={comp.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-zinc-300 hover:text-white truncate font-medium"
                  >
                    {comp.domain}
                  </a>
                </div>
                {comp.pageTitle && (
                  <p className="text-[10px] text-zinc-600 truncate mt-0.5 pl-5.5">{comp.pageTitle}</p>
                )}
              </div>
              {/* Citation count */}
              <div className="text-center">
                <span className="text-xs font-bold text-violet-400">{comp.citationCount}</span>
                <span className="text-[9px] text-zinc-600"> raz</span>
              </div>
              {/* Overall score */}
              <ScoreBar score={comp.overallScore} />
              {/* Technical access */}
              <div className="flex items-center gap-1">
                {comp.tech_robots_disallow === null ? (
                  <span className="text-[9px] text-zinc-600">–</span>
                ) : comp.tech_robots_disallow === 0 ? (
                  <span className="text-[9px] text-emerald-400 font-medium">✓ OK</span>
                ) : (
                  <span className="text-[9px] text-red-400 font-medium">✗ Blok.</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pro upsell footer */}
      {!isPro && completed.length > 2 && (
        <div className="px-4 py-3 border-t border-white/5 bg-violet-500/5">
          <p className="text-[11px] text-zinc-500">
            Odblokuj pełną analizę {completed.length} konkurentów z porównaniem 50+ parametrów.
            {" "}<Link href="/pricing" className="text-violet-400 hover:text-violet-300 font-semibold">Upgrade do Pro →</Link>
          </p>
        </div>
      )}
    </div>
  );
}

function PLGUpsell({ url }: { url?: string }) {
  const sandboxHref = url ? `/sandbox?url=${encodeURIComponent(url)}` : "/sandbox";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/60 via-purple-950/40 to-zinc-900/60 p-6">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 pointer-events-none" />
      <div className="relative">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Co zrobić, żeby AI Cię cytowało?</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Wiemy już, gdzie stoisz. Teraz czas sprawdzić, co konkretnie blokuje Twoją widoczność i jak to zmienić.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          <div className="bg-white/4 border border-white/8 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">⚡</span>
              <span className="text-xs font-semibold text-white">What-IF Simulator</span>
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">Pro</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Symuluj zmiany treści i sprawdź natychmiast, jak wpłyną na Twój AI Visibility Score — bez edytowania strony.
            </p>
          </div>
          <div className="bg-white/4 border border-white/8 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">🧪</span>
              <span className="text-xs font-semibold text-white">AI Sandbox</span>
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">Pro</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Testuj, jak ChatGPT i Google interpretują Twoją treść. Otrzymaj konkretne sugestie z podglądem „przed i po".
            </p>
          </div>
        </div>

        <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-3 mb-4">
          <p className="text-xs text-amber-300 leading-relaxed">
            <span className="font-semibold">Ważne:</span> Widoczność w AI to nie tylko treść. Liczy się też struktura techniczna, autorytet marki, schema.org i wiele innych sygnałów — wszystkie analizowane przez GEO-Auditor.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Link href={sandboxHref} className="flex-1">
            <Button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold py-2.5">
              Otwórz AI Sandbox →
            </Button>
          </Link>
          <Button variant="outline" className="flex-1 text-sm border-white/15 text-zinc-300 hover:bg-white/5 py-2.5">
            Uaktualnij plan
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Queries Checked Panel ───────────────────────────────────────────────────────

function QueriesCheckedPanel({
  checks,
  isPro,
  canonicalPhrases,
}: {
  checks: CitationCheck[];
  isPro: boolean;
  canonicalPhrases: Array<{ id: number; phrase: string; isActive: boolean }> | null;
}) {
  const [expanded, setExpanded] = useState(false);

  // Deduplicate queries globally (same query may appear across multiple engines/rounds)
  const uniqueQueries = Array.from(
    new Map(checks.map(c => [c.query, c])).values()
  ).map(c => c.query);

  if (uniqueQueries.length === 0) return null;

  // Aggregate status per query across all engines
  const queryStatus = (q: string): "yes" | "domain" | "no" => {
    const qChecks = checks.filter(c => c.query === q);
    return getQueryStatus(qChecks);
  };

  const citedCount = uniqueQueries.filter(q => queryStatus(q) === "yes").length;
  const domainCount = uniqueQueries.filter(q => queryStatus(q) === "domain").length;

  // ── Canonical phrases from monitoring ───────────────────────────────────────────────────
  // If monitoring phrases are available, they are the authoritative set.
  // The uniqueQueries from checks are the actual queries sent to AI engines
  // (which may be generated from CI or from monitoring phrases).
  const hasCanonicalPhrases = canonicalPhrases && canonicalPhrases.length > 0;

  return (
    <div className="bg-zinc-900/40 border border-white/8 rounded-2xl overflow-hidden">
      {/* Header with copywriting */}
      <div className="p-5 border-b border-white/6">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white">Jak AI widzi Twoją stronę?</h3>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              {hasCanonicalPhrases
                ? "Sprawdziliśmy Twoje monitorowane frazy w 4 silnikach AI — poniżej widzisz, na które z nich Twoja strona pojawia się w odpowiedziach."
                : "Przeanalizowaliśmy treść Twojej strony tak samo, jak robią to duże modele językowe — wyodrębniając tematy, intencje i pytania, które Twoi odbiorcy zadają AI. Następnie sprawdziliśmy każde z nich w 4 silnikach AI."
              }
            </p>
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-3 mt-3 text-xs">
          <span className="text-zinc-500">{uniqueQueries.length} fraz sprawdzonych</span>
          {citedCount > 0 && (
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {citedCount} z cytowaniem
            </span>
          )}
          {domainCount > 0 && (
            <span className="flex items-center gap-1 text-amber-400">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              {domainCount} inna podstrona
            </span>
          )}
        </div>
      </div>

      {/* Canonical phrase set from monitoring -- shown as the authoritative reference */}
      {hasCanonicalPhrases && (
        <div className="px-5 pt-4 pb-2">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-3 h-3 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">Monitorowane frazy — wiążący zestaw dla tej podstrony</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-1">
            {canonicalPhrases!.map((p) => {
              const st = queryStatus(p.phrase);
              return (
                <span key={p.id} className={`text-[11px] px-2 py-0.5 rounded-full border ${
                  st === "yes" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" :
                  st === "domain" ? "bg-amber-500/10 border-amber-500/30 text-amber-300" :
                  "bg-indigo-500/10 border-indigo-500/20 text-indigo-300"
                }`}>{p.phrase}</span>
              );
            })}
          </div>
          <p className="text-[10px] text-zinc-600 mt-1.5 mb-1">
            <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" /> cytowana</span>
            {" "}<span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" /> inna podstrona domeny</span>
            {" "}<span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" /> brak cytowania</span>
          </p>
        </div>
      )}

      {/* Collapsible list of all queries sent to AI engines */}
      <div className="p-5">
        {hasCanonicalPhrases && (
          <p className="text-[10px] text-zinc-600 mb-2">Wszystkie zapytania wysłane do silników AI:</p>
        )}
        <div className={`space-y-1.5 ${!expanded ? "max-h-[200px] overflow-hidden relative" : ""}`}>
          {uniqueQueries.map((q, i) => {
            const st = queryStatus(q);
            return (
              <div key={i} className="flex items-start gap-2.5">
                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  st === "yes" ? "bg-emerald-400" :
                  st === "domain" ? "bg-amber-400" : "bg-zinc-700"
                }`} />
                <span className="text-xs text-zinc-300 leading-relaxed">„{q}“</span>
              </div>
            );
          })}
          {!expanded && uniqueQueries.length > 6 && (
            <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-zinc-900/90 to-transparent pointer-events-none" />
          )}
        </div>

        {uniqueQueries.length > 6 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-3 flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            <svg className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
            {expanded ? "Zwiń" : `Pokaż wszystkie ${uniqueQueries.length} frazy`}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Per-Engine Breakdown Table ─────────────────────────────────────────────

type EngineKey = "chatgpt" | "google" | "perplexity" | "gemini";

function EngineBreakdownTable({ checks }: { checks: CitationCheck[] }) {
  const engines: EngineKey[] = ["google", "perplexity", "gemini", "chatgpt"];

  const engineLabels: Record<EngineKey, string> = {
    google: "Google AI Overviews",
    perplexity: "Perplexity",
    gemini: "Gemini",
    chatgpt: "ChatGPT",
  };

  const stats = engines.map(engine => {
    const engineChecks = checks.filter(c => c.engine === engine);
    const total = engineChecks.length;
    const withAI = engineChecks.filter(c => c.hasAIOverview !== false && (c.allCitedUrls?.length ?? 0) > 0).length;
    const cited = engineChecks.filter(c => c.isCited === "yes").length;
    const domainCited = engineChecks.filter(c => c.isCited === "domain").length;
    const queries = Array.from(new Set(engineChecks.map(c => c.query)));
    return { engine, total, withAI, cited, domainCited, queries };
  }).filter(s => s.total > 0);

  if (stats.length === 0) return null;

  return (
    <div className="bg-zinc-900/40 border border-white/8 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Wyniki per silnik AI</h3>
          <p className="text-xs text-zinc-500">Podsumowanie sprawdzonych zapytań dla każdej platformy</p>
        </div>
      </div>

      <div className="space-y-3">
        {stats.map(({ engine, total, withAI, cited, domainCited, queries }) => {
          const hasCit = cited > 0 || domainCited > 0;
          return (
            <div key={engine} className={`rounded-xl border p-3.5 ${
              hasCit ? "border-emerald-500/25 bg-emerald-500/4" : "border-white/6 bg-zinc-800/30"
            }`}>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <EngineChip engine={engine as EngineKey} />
                  <span className="text-xs text-zinc-400 font-medium">{engineLabels[engine as EngineKey]}</span>
                </div>
                {hasCit ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold">
                    {cited > 0 ? `${cited} cytowanie${cited > 1 ? "" : ""}` : "Inna podstrona"}
                  </span>
                ) : (
                  <span className="text-xs text-zinc-600">Brak cytowania</span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 mb-2.5">
                <div className="text-center">
                  <p className="text-sm font-bold text-white tabular-nums">{total}</p>
                  <p className="text-[10px] text-zinc-600">zapytań</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-white tabular-nums">{withAI}</p>
                  <p className="text-[10px] text-zinc-600">z odpowiedzią AI</p>
                </div>
                <div className="text-center">
                  <p className={`text-sm font-bold tabular-nums ${hasCit ? "text-emerald-400" : "text-zinc-600"}`}>
                    {cited + domainCited}
                  </p>
                  <p className="text-[10px] text-zinc-600">cytowań</p>
                </div>
              </div>


            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export const AICitationPanel = forwardRef<AICitationPanelHandle, Props>(function AICitationPanel(
  { auditId, url, overallScore, onCompetitorUrlsReady, onStatusChange }: Props,
  ref
) {
  const { user } = useAuth();
  const isPro = user?.role === "admin" || user?.plan === "pro" || user?.plan === "business";
  const [, navigate] = useLocation();

  // ── Core fix: always query DB for existing jobs ──────────────────────────────────
  // Previously: enabled: jobStarted (local state) — reset to false on every remount
  // (switching tabs unmounts AICitationPanel, so existing completed jobs were invisible).
  // Fix: always enable the query. Use `userStartedJob` only to distinguish
  // "user explicitly clicked Start" from "job already existed in DB".
  const [userStartedJob, setUserStartedJob] = useState(false);
  const [competitorUrlsNotified, setCompetitorUrlsNotified] = useState(false);
  // Feature 2: inline PhraseManager toggle
  const [showPhraseManager, setShowPhraseManager] = useState(false);

  // ── Canonical phrases from monitoring (single source of truth) ──────────────
  // Same set of phrases used in Monitoring dashboard — unifies phrase source across the app.
  // Only fetched when user is authenticated (protected procedure).
  const phrasesForUrlQuery = trpc.monitoring.getPhrasesForUrl.useQuery(
    { url: url ?? "" },
    { enabled: !!user && !!url }
  );
  const monitoringPhrasesData = phrasesForUrlQuery.data;
  // canonicalPhrases is null when: query not yet loaded, user not authenticated, or page not monitored
  // When page IS monitored, monitoringPhrasesData is { monitoredPageId, phrases[] }
  // When page is NOT monitored, monitoringPhrasesData is null (server returns null)
  const canonicalPhrases = monitoringPhrasesData?.phrases?.filter(p => p.isActive) ?? null;
  // isPageMonitored: true only when query has resolved AND returned a non-null result
  const isPageMonitored = phrasesForUrlQuery.isFetched && monitoringPhrasesData != null;

  // ── Layer 4: Quick Signal state ────────────────────────────────────────────
  // quickSignalData: null while loading or not yet started
  // quickSignalLoading: true while the mutation is in flight
  // quickSignalVisible: controls whether the card is shown at all
  const [quickSignalData, setQuickSignalData] = useState<QuickSignalData | null>(null);
  const [quickSignalLoading, setQuickSignalLoading] = useState(false);
  const [quickSignalVisible, setQuickSignalVisible] = useState(false);
  const quickSignalMutation = trpc.citation.quickSignal.useMutation({
    onSuccess: (data) => {
      setQuickSignalData(data as QuickSignalData);
      setQuickSignalLoading(false);
    },
    onError: () => {
      // Non-fatal: quick signal failure should never block the main flow
      setQuickSignalLoading(false);
    },
  });

  const startCheck = trpc.citation.startCheck.useMutation();
  const resultsQuery = trpc.citation.getResults.useQuery(
    { auditId },
    {
      // Always enabled — loads existing job from DB even after remount.
      // staleTime: 0 ensures we always get fresh data on mount.
      enabled: true,
      refetchInterval: false,
      staleTime: 0,
    }
  );

  const job = resultsQuery.data?.job as CitationJob | null | undefined;
  const dbChecks = (resultsQuery.data?.checks ?? []) as CitationCheck[];

  // jobStarted = user clicked Start OR a job already exists in DB
  const jobStarted = userStartedJob || !!job;

  // ── Layer 2: SSE streaming ────────────────────────────────────────────────────
  // Subscribe to real-time citation results while job is running.
  // When SSE is unavailable (old browser / proxy), fall back to 4s polling.
  const streamJobId = (job?.status === "pending" || job?.status === "running") ? job?.id : null;
  const {
    streamResults,
    progress: streamProgress,
    isDone: streamIsDone,
    shouldFallbackToPolling,
    resultCount: streamResultCount,
  } = useCitationStream(streamJobId ?? null);

  // Polling fallback: only active when SSE is unavailable
  useEffect(() => {
    const isActive = job?.status === "pending" || job?.status === "running";
    if (!isActive || !shouldFallbackToPolling) return;
    const id = setInterval(() => { resultsQuery.refetch(); }, 4000);
    return () => clearInterval(id);
  }, [job?.status, shouldFallbackToPolling]);

  // When SSE stream completes, do a final DB refetch to get authoritative data
  useEffect(() => {
    if (streamIsDone) {
      // Small delay to ensure DB write has committed
      const t = setTimeout(() => resultsQuery.refetch(), 800);
      return () => clearTimeout(t);
    }
  }, [streamIsDone]);

  // Merge: while streaming, show stream results for immediate feedback;
  // once completed, use authoritative DB data (which includes IDs, full metadata).
  const isJobActive = job?.status === "pending" || job?.status === "running";
  const checks: CitationCheck[] = useMemo(() => {
    if (isJobActive && streamResults.length > 0) {
      // Progressive: show stream results as synthetic CitationCheck objects
      return streamResults.map((r, i) => ({
        id: -(i + 1), // negative IDs mark stream-only results
        query: r.query,
        engine: r.engine,
        round: r.round,
        isCited: r.isCited,
        citedUrl: r.citedUrl ?? null,
        domainCitedUrl: r.domainCitedUrl ?? null,
        allCitedUrls: r.allCitedUrls,
        competitorDomains: r.competitorDomains,
        snippet: r.snippet ?? null,
        responseText: r.responseText ?? null,
        hasAIOverview: r.hasAIOverview ?? null,
        fromCache: r.fromCache,
      }));
    }
    return dbChecks;
  }, [isJobActive, streamResults, dbChecks]);

  // Notify parent when job completes with competitor URLs
  useEffect(() => {
    if (job?.status === "completed" && checks.length > 0 && !competitorUrlsNotified && onCompetitorUrlsReady) {
      const targetDomainLocal = url ? getDomain(url) : "";
      const allUrls = checks.flatMap(c => c.allCitedUrls ?? []);
      const competitorUrls = allUrls.filter(u => {
        try {
          const h = new URL(u).hostname.replace("www.", "");
          return h !== targetDomainLocal && !h.includes("google.com") && !h.includes("translate.");
        } catch { return false; }
      });
      const uniqueUrls = Array.from(new Set(competitorUrls));
      if (uniqueUrls.length > 0) {
        onCompetitorUrlsReady(uniqueUrls);
        setCompetitorUrlsNotified(true);
      }
    }
  }, [job?.status, checks.length]);

  const handleStart = useCallback(async () => {
    if (!user) { window.location.href = getLoginUrl(); return; }
    setUserStartedJob(true);
    onStatusChange?.("running");

    // Layer 4: Fire Quick Signal concurrently with startCheck.
    // quickSignal is non-blocking — it never delays the main job start.
    // Show the card immediately (loading state) so the user sees activity.
    setQuickSignalVisible(true);
    setQuickSignalLoading(true);
    setQuickSignalData(null);
    quickSignalMutation.mutate({ auditId }); // fire-and-forget (handled in onSuccess/onError)

    await startCheck.mutateAsync({ auditId });
    resultsQuery.refetch();
  }, [user, auditId, onStatusChange]);

  const targetDomain = url ? getDomain(url) : "";
  const isRunning = job?.status === "pending" || job?.status === "running";
  const isCompleted = job?.status === "completed";
  const isFailed = job?.status === "failed";
  const foundCitation = hasCitation(checks);
  const byRound = groupByRound(checks);
  const rounds = Array.from(byRound.keys()).sort((a, b) => a - b);
  const totalQueries = new Set(checks.map(c => c.query)).size;

  // Expose startCheck to parent via ref
  useImperativeHandle(ref, () => ({
    startCheck: () => { handleStart(); },
  }), [handleStart]);

  // Notify parent of status changes — fire on mount too (job may already exist)
  useEffect(() => {
    if (isRunning || startCheck.isPending) {
      onStatusChange?.("running");
    } else if (isCompleted) {
      const citedChecks = checks.filter(c => c.isCited);
      const engines = new Set(checks.map(c => c.engine)).size;
      const citedEngines = new Set(citedChecks.map(c => c.engine)).size;
      onStatusChange?.("done", citedEngines, Math.max(engines, 3));
    } else if (isFailed) {
      onStatusChange?.("error");
    }
  }, [isRunning, isCompleted, isFailed, startCheck.isPending, checks.length]);

  // ── Idle ─────────────────────────────────────────────────────────────────────
  if (!jobStarted || (!job && !startCheck.isPending)) {
    return (
      <div className="bg-zinc-900/40 border border-white/8 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-white/8">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-white">AI Visibility Check</h2>
              <p className="text-sm text-zinc-400 mt-1">
                Sprawdź, czy Twoja strona pojawia się w odpowiedziach ChatGPT, Google AI Overviews, Perplexity i Gemini — i kto jest cytowany zamiast Ciebie.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Value propositions -- no raw numbers, benefit-first */}
          <div className="space-y-2.5">
            {[
              {
                icon: (
                  <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                ),
                title: "Analiza jak LLM",
                desc: "Przetwarzamy treść Twojej strony tak samo jak ChatGPT i Gemini — wyodrębniamy tematy i pytania, które zadają Twoi klienci.",
              },
              {
                icon: (
                  <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ),
                title: "Sprawdzenie w 4 silnikach AI",
                desc: "ChatGPT, Google AI Overviews, Perplexity i Gemini — dowiesz się, gdzie jesteś cytowany, a gdzie Twój konkurent Cię wyprzedza.",
              },
              {
                icon: (
                  <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                ),
                title: "Konkretny wynik, nie tylko dane",
                desc: "Jeden jasny werdykt: widoczny lub niewidoczny w AI Search. Plus lista fraz, na które Cię sprawdziliśmy.",
              },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="flex items-start gap-3 bg-zinc-800/30 border border-white/5 rounded-xl p-3.5">
                <div className="w-7 h-7 rounded-lg bg-zinc-700/50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  {icon}
                </div>
                <div>
                  <p className="text-xs font-semibold text-zinc-200">{title}</p>
                  <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Canonical phrases preview -- shown before running the check */}
          {canonicalPhrases && canonicalPhrases.length > 0 && (
            <div className="bg-zinc-800/30 border border-white/8 rounded-xl p-4">
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  <span className="text-xs font-semibold text-zinc-300">Frazy do sprawdzenia ({canonicalPhrases.length})</span>
                </div>
                {/* Feature 2: Manage phrases inline */}
                {monitoringPhrasesData && (
                  <button
                    onClick={() => setShowPhraseManager((v) => !v)}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    {showPhraseManager ? "Ukryj" : "Zarządzaj"}
                  </button>
                )}
              </div>
              <p className="text-[11px] text-zinc-500 mb-2.5 leading-relaxed">Te same frazy, które monitorujesz w dashboardzie — jeden spójny zestaw dla tej podstrony.</p>
              {/* Inline PhraseManager -- Feature 2 */}
              {showPhraseManager && monitoringPhrasesData ? (
                <div className="mt-2">
                  <PhraseManager
                    monitoredPageId={monitoringPhrasesData.monitoredPageId}
                    plan={user?.plan ?? "free"}
                    compact={false}
                    className="bg-transparent border-0 p-0"
                  />
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {canonicalPhrases.slice(0, 8).map((p) => (
                    <span key={p.id} className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">{p.phrase}</span>
                  ))}
                  {canonicalPhrases.length > 8 && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-700/50 border border-white/5 text-zinc-500">+{canonicalPhrases.length - 8} więcej</span>
                  )}
                </div>
              )}
            </div>
          )}

          {!user ? (
            <div className="space-y-3">
              <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300">
                Zaloguj się, aby uruchomić AI Visibility Check.
              </div>
              <Button onClick={() => { window.location.href = getLoginUrl(); }}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5">
                Zaloguj się i sprawdź widoczność →
              </Button>
            </div>
          ) : (
            <Button onClick={handleStart} disabled={startCheck.isPending}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 text-sm">
              {startCheck.isPending ? (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Uruchamianie...
                </span>
              ) : "Sprawdź widoczność w AI →"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ── Running (SSE progressive) — Layer 3: Emotional Tension Sequence ─────────────
  if (isRunning || startCheck.isPending) {
    const completedQueries = new Set(checks.map(c => c.query)).size;
    return (
      <div className="bg-zinc-900/40 border border-indigo-500/20 rounded-2xl p-5 space-y-4">
        {/* Header — shows what we're doing right now */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
            <svg className="w-4.5 h-4.5 text-indigo-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-white">Sprawdzam widoczność w AI Search</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {completedQueries > 0
                ? `${completedQueries} ${completedQueries === 1 ? 'fraza' : completedQueries < 5 ? 'frazy' : 'fraz'} sprawdzone${streamProgress ? ` · runda ${streamProgress.round}` : ""}`
                : "Pytamy wiodące modele AI tak samo, jak robi to Twój klient"}
            </p>
          </div>
          {completedQueries > 0 && (
            <div className="shrink-0 text-right">
              <span className="text-xl font-bold tabular-nums text-indigo-300">{completedQueries}</span>
              <p className="text-[10px] text-zinc-600">fraz</p>
            </div>
          )}
        </div>

        {/* Layer 4: Quick Signal — instant first signal, appears within 2-4s */}
        {quickSignalVisible && (
          <QuickSignalCard
            data={quickSignalData}
            isLoading={quickSignalLoading}
            isDone={streamIsDone}
            targetDomain={targetDomain}
          />
        )}

        {/* Layer 3: Emotional Tension Sequence — the heart of the experience */}
        <EmotionalTensionFeed
          streamResults={streamResults}
          streamProgress={streamProgress}
          targetDomain={targetDomain}
          isRunning={isRunning || startCheck.isPending}
          isFallback={shouldFallbackToPolling}
        />
      </div>
    );
  }

  // ── Failed ────────────────────────────────────────────────────────────────────────────
  if (isFailed) {
    return (
      <div className="bg-zinc-900/40 border border-red-500/20 rounded-2xl p-6 text-center">
        <p className="text-red-400 font-semibold mb-2">Sprawdzanie nie powiodło się</p>
        <p className="text-sm text-zinc-500 mb-4">Spróbuj ponownie za chwilę.</p>
        <Button onClick={handleStart} variant="outline" className="border-white/15 text-zinc-300">
          Spróbuj ponownie
        </Button>
      </div>
    );
  }

  // ── Completed ────────────────────────────────────────────────────────────────────────────────

  // Build engine results for ScoreReveal from the completed checks
  const completedCitingEngines = Array.from(
    new Set(
      checks
        .filter(c => c.isCited === "yes" || c.isCited === "domain")
        .map(c => c.engine)
    )
  ) as ("chatgpt" | "google" | "perplexity" | "gemini")[];

  const scoreRevealEngineResults: ScoreRevealEngine[] = (ALL_ENGINES as ("chatgpt" | "google" | "perplexity" | "gemini")[]).map(engine => ({
    engine,
    cited: completedCitingEngines.includes(engine),
  }));

  return (
    <div className="space-y-4">
      {/* Score Reveal — emotional payoff after Emotional Tension Sequence.
           Only shown when user started the job in this session (userStartedJob).
           Returning users see the summary hero immediately without animation. */}
      <ScoreReveal
        citedEngines={completedCitingEngines.length}
        totalEngines={ALL_ENGINES.length}
        engineResults={scoreRevealEngineResults}
        visible={userStartedJob}
      />

      {/* Summary hero */}
      {(() => {
        // Collect which engines cited the target (exact or domain)
        const citingEngines = Array.from(
          new Set(
            checks
              .filter(c => c.isCited === "yes" || c.isCited === "domain")
              .map(c => c.engine)
          )
        ) as ("chatgpt" | "google" | "perplexity" | "gemini")[];

        // Build a human-readable sentence: "Google AI Overviews i Perplexity cytują Twoją stronę"
        const engineLabels: Record<string, string> = {
          google: "Google AI Overviews",
          perplexity: "Perplexity",
          gemini: "Gemini",
          chatgpt: "ChatGPT",
        };
        const citingNames = citingEngines.map(e => engineLabels[e]);
        const citingSentence = citingNames.length === 1
          ? `${citingNames[0]} cytuje Twoją stronę`
          : citingNames.length === 2
          ? `${citingNames[0]} i ${citingNames[1]} cytują Twoją stronę`
          : `${citingNames.slice(0, -1).join(", ")} i ${citingNames[citingNames.length - 1]} cytują Twoją stronę`;

        // AI Visibility Score — one number, immediately understood by marketing directors
        const visResult = getVisibilityScoreResult(citingEngines.length, ALL_ENGINES.length);

        return (
          <div className={`bg-zinc-900/40 border rounded-2xl p-5 ${
            foundCitation ? "border-emerald-500/30" : "border-red-500/20"
          }`}>
            {/* Top row: icon + headline + AI Visibility Score */}
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                foundCitation ? "bg-emerald-500/20 border border-emerald-500/30" : "bg-red-500/15 border border-red-500/25"
              }`}>
                {foundCitation ? (
                  <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold text-white">
                  {foundCitation ? "Twoja strona jest widoczna w AI Search" : "Twoja strona nie jest widoczna w AI Search"}
                </h2>
                {foundCitation && citingEngines.length > 0 ? (
                  <p className="text-sm text-zinc-400 mt-1">{citingSentence}.</p>
                ) : (
                  <p className="text-sm text-zinc-400 mt-1">
                    Sprawdziliśmy Twoją stronę w 4 silnikach AI. Twoja domena nie pojawiła się w żadnej z przeanalizowanych odpowiedzi.
                  </p>
                )}
              </div>
              {/* AI Visibility Score -- replaces the raw fraction, one number */}
              <div className={`shrink-0 flex flex-col items-center px-3 py-2 rounded-xl border ${
                foundCitation ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/20 bg-red-500/8"
              }`}>
                <span className={`text-2xl font-bold tabular-nums ${visResult.colorClass}`}>{visResult.score}</span>
                <span className="text-[9px] text-zinc-500">/100</span>
                <span className={`text-[10px] font-semibold mt-0.5 ${visResult.colorClass}`}>{visResult.label}</span>
              </div>
            </div>

            {/* Per-engine breakdown -- 4-column grid with color-coded status */}
            <div className="mt-4 pt-3 border-t border-white/5">
              <p className="text-[10px] text-zinc-600 mb-2.5 uppercase tracking-wide font-medium">Status w silnikach AI</p>
              <div className="grid grid-cols-4 gap-2">
                {ALL_ENGINES.map((engine) => {
                  const cfg = ENGINE_CONFIG[engine];
                  const isCited = (citingEngines as string[]).includes(engine);
                  return (
                    <div
                      key={engine}
                      className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all ${
                        isCited
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : "border-white/5 bg-zinc-800/30"
                      }`}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white"
                        style={{ backgroundColor: isCited ? cfg.color : "#3f3f46" }}
                      >
                        {cfg.shortLabel[0]}
                      </div>
                      <span className="text-[10px] text-zinc-400 text-center leading-tight font-medium">{cfg.shortLabel}</span>
                      <span className={`text-[9px] font-semibold ${
                        isCited ? "text-emerald-400" : "text-zinc-600"
                      }`}>
                        {isCited ? "✓ Cytuje" : "– Brak"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

         {/* Citation Narrative -- LLM-generated diagnosis connecting results to root cause gaps */}
      {(() => {
        const narrativeCitingEngines = Array.from(
          new Set(
            checks
              .filter(c => c.isCited === "yes" || c.isCited === "domain")
              .map(c => c.engine)
          )
        ) as string[];
        const allEngineNames = ALL_ENGINES as string[];
        const narrativeMissingEngines = allEngineNames.filter(e => !narrativeCitingEngines.includes(e));
        return (
          <CitationNarrativeCard
            auditId={auditId}
            url={url ?? ""}
            citingEngines={narrativeCitingEngines}
            missingEngines={narrativeMissingEngines}
            totalChecks={checks.length}
            isCompleted={isCompleted}
            language="pl"
          />
        );
      })()}

      {/* Zero-citation state — Visibility First Warunek 2:
           Emotional zero-state with top-3 competitors + Pulse Monitor CTA.
           Competitors appear BEFORE any action steps (pain before solution). */}
      {isCompleted && !foundCitation && checks.length > 0 && (
        <CitationZeroState
          competitors={rankCompetitors(checks, targetDomain)}
          targetDomain={targetDomain}
          totalEngines={ALL_ENGINES.length}
          totalQueries={totalQueries}
          onNavigateToPulse={() => navigate("/pulse")}
          onNavigateToAudit={() => {
            // Scroll to Signal Audit tab — emit a custom event that Results.tsx listens to
            window.dispatchEvent(new CustomEvent("geo:switch-tab", { detail: "optimization" }));
          }}
        />
      )}

      {/* Queries checked -- global list without round breakdown */}
      <QueriesCheckedPanel checks={checks} isPro={isPro} canonicalPhrases={canonicalPhrases} />
      {/* Global competitor summary */}
      <CompetitorSummary checks={checks} targetDomain={targetDomain} isPro={isPro} />
      {/* Competitor Intelligence -- AI Score comparison table */}
      <CompetitorIntelPanel auditId={auditId} isPro={isPro} citationJobStatus={job?.status ?? null} />
      {/* Gap Analysis -- check-by-check diff vs competitors */}
       <GapAnalysisPanel auditId={auditId} isPro={isPro} citationJobStatus={job?.status ?? null} />
      {/* Citation Opportunity Finder -- per-query analysis of why competitors are cited instead */}
      <CitationOpportunityPanel
        auditId={auditId}
        isPro={isPro}
        auditScore={overallScore ?? null}
        citationJobStatus={job?.status ?? null}
        citedCount={checks.filter(c => c.isCited === "yes" || c.isCited === "domain").length}
      />
      {/* Methodology disclaimer -- at the bottom, after all results */}
      <div className="bg-zinc-800/20 border border-white/5 rounded-xl px-4 py-3 flex gap-3">
        <svg className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-[11px] text-zinc-600 leading-relaxed">
          Wyniki dotyczą <span className="text-zinc-500">Google AI Overviews</span> (standardowe wyniki wyszukiwania), nie Google AI Mode. Sprawdzamy zapytania wygenerowane na podstawie treści Twojej strony — wyniki mogą się różnić przy innych frazach lub w innych momentach. Brak cytowania nie wyklucza widoczności na frazy, których nie sprawdzaliśmy.
        </p>
      </div>
    </div>
  );
});

export default AICitationPanel;
