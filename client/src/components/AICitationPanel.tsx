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

import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";

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
  /** Called when citation job completes with all cited competitor URLs */
  onCompetitorUrlsReady?: (urls: string[]) => void;
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
          {/* Full query text — professional exposition */}
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

// ─── Global Competitor Summary ────────────────────────────────────────────────

function CompetitorSummary({ checks, targetDomain, isPro }: {
  checks: CitationCheck[];
  targetDomain: string;
  isPro: boolean;
}) {
  const competitors = rankCompetitors(checks, targetDomain);
  if (competitors.length === 0) return null;
  const maxCount = competitors[0]?.count ?? 1;

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
          {/* Blurred preview */}
          <div className="blur-sm pointer-events-none select-none space-y-2" aria-hidden>
            {competitors.slice(0, 6).map((d) => (
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
        <div className="space-y-2">
          {competitors.map((d, i) => (
            <div key={d.domain} className="flex items-center gap-3">
              <span className="text-xs text-zinc-600 w-4 text-right">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex flex-col min-w-0 flex-1 mr-2">
                    <a href={d.url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-zinc-300 hover:text-white font-medium transition-colors truncate"
                      title={d.url}>
                      {d.url}
                    </a>
                  </div>
                  <span className="text-xs text-zinc-500 flex-shrink-0">{d.count}×</span>
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full"
                    style={{ width: `${Math.round((d.count / maxCount) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PLG Upsell ───────────────────────────────────────────────────────────────

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

function QueriesCheckedPanel({ checks, isPro }: { checks: CitationCheck[]; isPro: boolean }) {
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
              Przeanalizowaliśmy treść Twojej strony tak samo, jak robią to duże modele językowe — wyodrębniając tematy, intencje i pytania, które Twoi odbiorcy zadają AI. Następnie sprawdziliśmy każde z nich w 4 silnikach AI, żeby zobaczyć, czy Twoja strona pojawia się w odpowiedziach.
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

      {/* Collapsible list */}
      <div className="p-5">
        <div className={`space-y-1.5 ${!expanded ? "max-h-[200px] overflow-hidden relative" : ""}`}>
          {uniqueQueries.map((q, i) => {
            const st = queryStatus(q);
            return (
              <div key={i} className="flex items-start gap-2.5">
                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  st === "yes" ? "bg-emerald-400" :
                  st === "domain" ? "bg-amber-400" : "bg-zinc-700"
                }`} />
                <span className="text-xs text-zinc-300 leading-relaxed">„{q}"</span>
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

export function AICitationPanel({ auditId, url, onCompetitorUrlsReady }: Props) {
  const { user } = useAuth();
  const isPro = user?.role === "admin" || false; // TODO: replace with plan check
  const [jobStarted, setJobStarted] = useState(false);
  const [pollInterval, setPollInterval] = useState<ReturnType<typeof setInterval> | null>(null);
  const [competitorUrlsNotified, setCompetitorUrlsNotified] = useState(false);

  const startCheck = trpc.citation.startCheck.useMutation();
  const resultsQuery = trpc.citation.getResults.useQuery(
    { auditId },
    { enabled: jobStarted, refetchInterval: false }
  );

  const job = resultsQuery.data?.job as CitationJob | null | undefined;
  const checks = (resultsQuery.data?.checks ?? []) as CitationCheck[];

  // Poll while running
  useEffect(() => {
    if (!jobStarted) return;
    if (job?.status === "completed" || job?.status === "failed") {
      if (pollInterval) { clearInterval(pollInterval); setPollInterval(null); }
      return;
    }
    if (!pollInterval) {
      const id = setInterval(() => { resultsQuery.refetch(); }, 4000);
      setPollInterval(id);
    }
    return () => { if (pollInterval) clearInterval(pollInterval); };
  }, [jobStarted, job?.status]);

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
    setJobStarted(true);
    await startCheck.mutateAsync({ auditId });
    resultsQuery.refetch();
  }, [user, auditId]);

  const targetDomain = url ? getDomain(url) : "";
  const isRunning = job?.status === "pending" || job?.status === "running";
  const isCompleted = job?.status === "completed";
  const isFailed = job?.status === "failed";
  const foundCitation = hasCitation(checks);
  const byRound = groupByRound(checks);
  const rounds = Array.from(byRound.keys()).sort((a, b) => a - b);
  const totalQueries = new Set(checks.map(c => c.query)).size;

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
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { val: "5", label: "rund max" },
              { val: "25", label: "zapytań max" },
              { val: "4", label: "silniki AI" },
            ].map(({ val, label }) => (
              <div key={label} className="bg-zinc-800/50 border border-white/6 rounded-xl p-3">
                <p className="text-xl font-bold text-white">{val}</p>
                <p className="text-xs text-zinc-500">{label}</p>
              </div>
            ))}
          </div>

          <div className="bg-zinc-800/30 border border-white/6 rounded-xl p-4 text-xs text-zinc-400 space-y-1.5">
            <p className="font-semibold text-zinc-300">Co otrzymasz:</p>
            <p>✓ Sprawdzenie w 4 silnikach AI: ChatGPT, Google AI Overviews, Perplexity, Gemini</p>
            <p>✓ Status cytowania dla każdego zapytania (dokładny URL / inna podstrona / brak)</p>
            <p>✓ Lista domen cytowanych zamiast Ciebie (plan Pro)</p>
            <p>✓ Fragmenty odpowiedzi AI z Twoją domeną</p>
          </div>

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

  // ── Running ─────────────────────────────────────────────────────────────────────────────────
  if (isRunning || startCheck.isPending) {
    const completedQueries = new Set(checks.map(c => c.query)).size;
    return (
      <div className="bg-zinc-900/40 border border-indigo-500/20 rounded-2xl p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-indigo-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Analizuję Twoją stronę w AI Search…</h2>
            <p className="text-sm text-zinc-400 mt-0.5">
              Przetwarzam treść strony i sprawdzam widoczność w 4 silnikach AI
              {completedQueries > 0 ? ` — sprawdzono ${completedQueries} fraz` : ""}
            </p>
          </div>
        </div>

        {/* Progress steps */}
        <div className="space-y-2 bg-zinc-800/30 rounded-xl p-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center flex-shrink-0">
              <svg className="w-2.5 h-2.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </span>
            <span className="text-zinc-400">Analiza treści strony</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center flex-shrink-0">
              <svg className="w-2.5 h-2.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </span>
            <span className="text-zinc-400">Generowanie fraz wyszukiwania</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-4 h-4 rounded-full bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center flex-shrink-0">
              <svg className="w-2.5 h-2.5 text-indigo-400 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            </span>
            <span className="text-zinc-300 font-medium">Sprawdzanie w ChatGPT, Google AI, Perplexity, Gemini…</span>
          </div>
        </div>

        <p className="text-xs text-zinc-600 mt-3">To może potrwać kilka minut. Strona odświeży się automatycznie.</p>
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

  // ── Completed ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Summary hero */}
      <div className={`bg-zinc-900/40 border rounded-2xl p-5 ${
        foundCitation ? "border-emerald-500/30" : "border-red-500/20"
      }`}>
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
          <div className="flex-1">
            <h2 className="text-base font-bold text-white">
              {foundCitation
                ? "Twoja strona jest widoczna w AI Search ✅"
                : "Twoja strona nie jest widoczna w AI Search ❌"}
            </h2>
            <p className="text-sm text-zinc-400 mt-1">
              {foundCitation
                ? "Co najmniej jeden silnik AI cytuje Twoją stronę w odpowiedziach na pytania użytkowników."
                : "Sprawdziliśmy Twoją stronę w 4 silnikach AI. Twoja domena nie pojawiła się w żadnej z przeanalizowanych odpowiedzi."}
            </p>
          </div>
        </div>
      </div>

      {/* Queries checked — global list without round breakdown */}
      <QueriesCheckedPanel checks={checks} isPro={isPro} />

      {/* Per-engine breakdown */}
      <EngineBreakdownTable checks={checks} />

      {/* Global competitor summary */}
      <CompetitorSummary checks={checks} targetDomain={targetDomain} isPro={isPro} />

      {/* Methodology disclaimer — at the bottom, after all results */}
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
}

export default AICitationPanel;
