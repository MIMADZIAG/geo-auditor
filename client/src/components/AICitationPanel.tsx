/**
 * AICitationPanel v3 — AI Visibility Check
 *
 * Shows whether the audited URL appears in:
 *   1. ChatGPT Search (OpenAI web search)
 *   2. Google AI Overviews (Puppeteer scrape)
 *
 * For each query × engine:
 *   - "yes"    = exact URL cited (green)
 *   - "domain" = different page on same domain cited (amber)
 *   - "no"     = not found (red)
 *   + Full list of competing domains that were cited instead
 *
 * PLG upsell: after results → What-IF Simulator + Sandbox
 */

import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CitationCheck {
  id: number;
  query: string;
  engine: "chatgpt" | "google";
  isCited: "yes" | "no" | "domain";
  citedUrl?: string | null;
  domainCitedUrl?: string | null;
  allCitedUrls?: string[] | null;
  snippet?: string | null;
  responseText?: string | null;
  hasAIOverview?: boolean | null;
}

interface CitationJob {
  id: number;
  auditId: number;
  status: "pending" | "running" | "completed" | "failed";
  prompts?: string[] | null;
}

interface Props {
  auditId: number;
  url?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace("www.", ""); }
  catch { return url; }
}

function getPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + (u.search || "");
  } catch { return url; }
}

// Extract unique competitor domains from allCitedUrls, excluding the target domain
function getCompetitorDomains(checks: CitationCheck[], targetDomain: string): string[] {
  const domains = new Set<string>();
  for (const c of checks) {
    for (const u of c.allCitedUrls ?? []) {
      try {
        const d = new URL(u).hostname.replace("www.", "");
        if (d && d !== targetDomain) domains.add(d);
      } catch {}
    }
  }
  return Array.from(domains).slice(0, 10);
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function CitationStatus({ isCited, hasAIOverview }: { isCited: "yes" | "no" | "domain"; hasAIOverview?: boolean | null }) {
  if (isCited === "yes") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        Cytowany
      </span>
    );
  }
  if (isCited === "domain") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        Inna podstrona
      </span>
    );
  }
  if (hasAIOverview === false) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-500/15 text-zinc-400 border border-zinc-500/30">
        Brak AI Overview
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
      <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
      Niewidoczny
    </span>
  );
}

// ─── Engine Header ─────────────────────────────────────────────────────────────

function EngineIcon({ engine }: { engine: "chatgpt" | "google" }) {
  if (engine === "chatgpt") {
    return (
      <div className="w-8 h-8 rounded-lg bg-[#10a37f]/15 border border-[#10a37f]/30 flex items-center justify-center flex-shrink-0">
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-[#10a37f]">
          <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.843-3.372L15.115 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.403-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
        </svg>
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    </div>
  );
}

// ─── Query Result Row ─────────────────────────────────────────────────────────

function QueryRow({ check, targetDomain }: { check: CitationCheck; targetDomain: string }) {
  const [expanded, setExpanded] = useState(false);
  const competitors = (check.allCitedUrls ?? [])
    .filter(u => { try { return new URL(u).hostname.replace("www.", "") !== targetDomain; } catch { return false; } })
    .slice(0, 5);

  return (
    <div className="border border-white/8 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-white/3 transition-colors"
      >
        <CitationStatus isCited={check.isCited} hasAIOverview={check.hasAIOverview} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-200 font-medium leading-snug">„{check.query}"</p>
          {check.isCited === "yes" && check.citedUrl && (
            <p className="text-xs text-emerald-400 mt-1 truncate">↳ {getPath(check.citedUrl)}</p>
          )}
          {check.isCited === "domain" && check.domainCitedUrl && (
            <p className="text-xs text-amber-400 mt-1 truncate">↳ Cytowana: {getPath(check.domainCitedUrl)}</p>
          )}
          {check.isCited === "no" && competitors.length > 0 && (
            <p className="text-xs text-zinc-500 mt-1">
              Zamiast Ciebie: {competitors.slice(0, 3).map(u => getDomain(u)).join(", ")}
            </p>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-zinc-500 flex-shrink-0 transition-transform mt-0.5 ${expanded ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/8 pt-3">
          {/* Cited URL detail */}
          {check.isCited === "yes" && check.citedUrl && (
            <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-lg p-3">
              <p className="text-xs text-emerald-400 font-semibold mb-1">✅ Twoja strona jest cytowana</p>
              <a href={check.citedUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs text-emerald-300 hover:underline break-all">{check.citedUrl}</a>
            </div>
          )}

          {/* Domain citation detail */}
          {check.isCited === "domain" && check.domainCitedUrl && (
            <div className="bg-amber-500/8 border border-amber-500/20 rounded-lg p-3">
              <p className="text-xs text-amber-400 font-semibold mb-1">🔗 Twoja domena jest widoczna — ale inna podstrona</p>
              <a href={check.domainCitedUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs text-amber-300 hover:underline break-all">{check.domainCitedUrl}</a>
              <p className="text-xs text-zinc-500 mt-2">
                AI cytuje inną podstronę Twojej domeny. Sprawdź, czy ta strona jest lepiej zoptymalizowana pod to zapytanie.
              </p>
            </div>
          )}

          {/* Competitors */}
          {competitors.length > 0 && (
            <div>
              <p className="text-xs text-zinc-500 font-semibold mb-2 uppercase tracking-wide">
                {check.isCited === "no" ? "Kto jest cytowany zamiast Ciebie:" : "Inne cytowane domeny:"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {competitors.map((u, i) => (
                  <a
                    key={i}
                    href={u} target="_blank" rel="noopener noreferrer"
                    className="text-xs px-2.5 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
                  >
                    {getDomain(u)}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* AI response snippet */}
          {check.snippet && (
            <div className="bg-zinc-900/60 border border-white/6 rounded-lg p-3">
              <p className="text-xs text-zinc-500 font-semibold mb-1">Fragment odpowiedzi AI:</p>
              <p className="text-xs text-zinc-400 italic leading-relaxed">{check.snippet}</p>
            </div>
          )}

          {/* No AI Overview note */}
          {check.engine === "google" && check.hasAIOverview === false && (
            <p className="text-xs text-zinc-500 italic">
              Google nie wyświetlił AI Overview dla tego zapytania. Może to oznaczać, że zapytanie jest zbyt specyficzne lub Google nie ma wystarczającej pewności, by generować odpowiedź AI.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Engine Section ────────────────────────────────────────────────────────────

function EngineSection({
  engine,
  checks,
  targetDomain,
}: {
  engine: "chatgpt" | "google";
  checks: CitationCheck[];
  targetDomain: string;
}) {
  const engineName = engine === "chatgpt" ? "ChatGPT Search" : "Google AI Overview";
  const cited = checks.filter(c => c.isCited === "yes").length;
  const domainCited = checks.filter(c => c.isCited === "domain").length;
  const withAI = engine === "google"
    ? checks.filter(c => c.hasAIOverview !== false).length
    : checks.length;
  const total = checks.length;

  // Overall status for this engine
  const overallStatus: "yes" | "domain" | "no" =
    cited > 0 ? "yes" : domainCited > 0 ? "domain" : "no";

  // Score: exact=1, domain=0.5, no=0
  const score = total > 0
    ? Math.round(((cited + domainCited * 0.5) / total) * 100)
    : 0;

  return (
    <div className="bg-zinc-900/40 border border-white/8 rounded-2xl overflow-hidden">
      {/* Engine header */}
      <div className="flex items-center gap-3 p-5 border-b border-white/8">
        <EngineIcon engine={engine} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-white">{engineName}</h3>
            <CitationStatus isCited={overallStatus} hasAIOverview={withAI > 0 ? true : false} />
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            {cited > 0
              ? `Cytowany w ${cited} z ${total} zapytań`
              : domainCited > 0
              ? `Domena widoczna w ${domainCited} z ${total} zapytań`
              : engine === "google" && withAI === 0
              ? `Brak AI Overview dla żadnego z ${total} zapytań`
              : `Niewidoczny w żadnym z ${total} zapytań`}
          </p>
        </div>
        {/* Score ring */}
        <div className="flex-shrink-0 text-center">
          <div className={`text-2xl font-bold tabular-nums ${
            score >= 60 ? "text-emerald-400" : score >= 30 ? "text-amber-400" : "text-red-400"
          }`}>{score}%</div>
          <div className="text-xs text-zinc-600">widoczność</div>
        </div>
      </div>

      {/* Query list */}
      <div className="p-4 space-y-2">
        {checks.map((check) => (
          <QueryRow key={check.id} check={check} targetDomain={targetDomain} />
        ))}
      </div>
    </div>
  );
}

// ─── Competitor Summary ────────────────────────────────────────────────────────

function CompetitorSummary({ checks, targetDomain }: { checks: CitationCheck[]; targetDomain: string }) {
  const competitors = getCompetitorDomains(checks, targetDomain);
  if (competitors.length === 0) return null;

  // Count how many times each competitor appears
  const counts: Record<string, number> = {};
  for (const c of checks) {
    for (const u of c.allCitedUrls ?? []) {
      try {
        const d = new URL(u).hostname.replace("www.", "");
        if (d && d !== targetDomain) counts[d] = (counts[d] ?? 0) + 1;
      } catch {}
    }
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);

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
      </div>

      <div className="space-y-2">
        {sorted.map(([domain, count], i) => {
          const maxCount = sorted[0][1];
          const pct = Math.round((count / maxCount) * 100);
          return (
            <div key={domain} className="flex items-center gap-3">
              <span className="text-xs text-zinc-600 w-4 text-right">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <a
                    href={`https://${domain}`} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-zinc-300 hover:text-white transition-colors font-medium"
                  >
                    {domain}
                  </a>
                  <span className="text-xs text-zinc-500">{count}×</span>
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-zinc-600 mt-4 italic">
        Te strony są regularnie cytowane przez AI dla zapytań związanych z Twoją tematyką. Analiza ich struktury i treści może wskazać, co warto poprawić.
      </p>
    </div>
  );
}

// ─── PLG Upsell Block ─────────────────────────────────────────────────────────

function PLGUpsell({ url, hasIssues }: { url?: string; hasIssues: boolean }) {
  const sandboxHref = url ? `/sandbox?url=${encodeURIComponent(url)}` : "/sandbox";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/60 via-purple-950/40 to-zinc-900/60 p-6">
      {/* Background glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 pointer-events-none" />

      <div className="relative">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
            <svg className="w-4.5 h-4.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Co zrobić, żeby AI Cię cytowało?</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              {hasIssues
                ? "Wiemy już, że Twoja strona nie jest widoczna w AI. Teraz czas sprawdzić, co konkretnie to blokuje."
                : "Twoja strona jest widoczna — sprawdź, jak zwiększyć częstotliwość cytowań."}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          {/* What-IF Simulator */}
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

          {/* AI Sandbox */}
          <div className="bg-white/4 border border-white/8 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">🧪</span>
              <span className="text-xs font-semibold text-white">AI Sandbox</span>
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">Pro</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Testuj, jak ChatGPT i Google interpretują Twoją treść. Otrzymaj konkretne sugestie poprawek z podglądem „przed i po".
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

// ─── Main Component ────────────────────────────────────────────────────────────

export function AICitationPanel({ auditId, url }: Props) {
  const { user } = useAuth();
  const [jobStarted, setJobStarted] = useState(false);
  const [pollInterval, setPollInterval] = useState<ReturnType<typeof setInterval> | null>(null);

  const startCheck = trpc.citation.startCheck.useMutation();
  const resultsQuery = trpc.citation.getResults.useQuery(
    { auditId },
    { enabled: jobStarted, refetchInterval: false }
  );

  const job = resultsQuery.data?.job as CitationJob | null | undefined;
  const checks = (resultsQuery.data?.checks ?? []) as CitationCheck[];

  // Poll while job is running
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

  const handleStart = useCallback(async () => {
    if (!user) {
      window.location.href = getLoginUrl();
      return;
    }
    setJobStarted(true);
    await startCheck.mutateAsync({ auditId });
    resultsQuery.refetch();
  }, [user, auditId]);

  const targetDomain = url ? getDomain(url) : "";
  const chatgptChecks = checks.filter(c => c.engine === "chatgpt");
  const googleChecks = checks.filter(c => c.engine === "google");
  const isRunning = job?.status === "pending" || job?.status === "running";
  const isCompleted = job?.status === "completed";
  const hasCitations = checks.some(c => c.isCited === "yes");
  const hasDomainCitations = checks.some(c => c.isCited === "domain");
  const hasIssues = !hasCitations && !hasDomainCitations;

  // ── Not started yet ──────────────────────────────────────────────────────────
  if (!jobStarted || (!job && !startCheck.isPending)) {
    return (
      <div className="bg-zinc-900/40 border border-white/8 rounded-2xl overflow-hidden">
        {/* Header */}
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
                Sprawdź, czy Twoja strona pojawia się w odpowiedziach ChatGPT Search i Google AI Overview — i kto jest cytowany zamiast Ciebie.
              </p>
            </div>
          </div>
        </div>

        {/* What will be checked */}
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-start gap-3 bg-zinc-800/40 border border-white/6 rounded-xl p-4">
              <EngineIcon engine="chatgpt" />
              <div>
                <p className="text-xs font-semibold text-white">ChatGPT Search</p>
                <p className="text-xs text-zinc-500 mt-0.5">Sprawdza, czy ChatGPT cytuje Twoją stronę odpowiadając na pytania użytkowników</p>
              </div>
            </div>
            <div className="flex items-start gap-3 bg-zinc-800/40 border border-white/6 rounded-xl p-4">
              <EngineIcon engine="google" />
              <div>
                <p className="text-xs font-semibold text-white">Google AI Overview</p>
                <p className="text-xs text-zinc-500 mt-0.5">Sprawdza, czy Google wyświetla Twoją stronę w sekcji AI Overview wyników wyszukiwania</p>
              </div>
            </div>
          </div>

          <div className="bg-zinc-800/30 border border-white/6 rounded-xl p-4 text-xs text-zinc-400 space-y-1.5">
            <p className="font-semibold text-zinc-300">Co otrzymasz:</p>
            <p>✓ Status cytowania dla każdego zapytania (dokładny URL / inna podstrona / brak)</p>
            <p>✓ Pełna lista domen, które są cytowane zamiast Ciebie</p>
            <p>✓ Fragmenty odpowiedzi AI, w których pojawia się Twoja domena</p>
          </div>

          {!user ? (
            <div className="space-y-3">
              <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300">
                Zaloguj się, aby uruchomić AI Visibility Check. Wymagamy rejestracji, aby chronić usługę przed nadużyciami.
              </div>
              <Button
                onClick={() => { window.location.href = getLoginUrl(); }}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5"
              >
                Zaloguj się i sprawdź widoczność →
              </Button>
            </div>
          ) : (
            <Button
              onClick={handleStart}
              disabled={startCheck.isPending}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 text-sm"
            >
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

  // ── Loading / Running ────────────────────────────────────────────────────────
  if (isRunning || startCheck.isPending || (!isCompleted && !job?.status)) {
    return (
      <div className="bg-zinc-900/40 border border-white/8 rounded-2xl p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
            <svg className="w-5 h-5 text-indigo-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Sprawdzam widoczność w AI...</h2>
            <p className="text-sm text-zinc-400 mt-0.5">To może potrwać 2–4 minuty. Analizujemy ChatGPT Search i Google AI Overview.</p>
          </div>
        </div>

        <div className="space-y-3">
          {[
            { label: "Generowanie zapytań użytkowników", done: true },
            { label: "Sprawdzanie ChatGPT Search", done: false },
            { label: "Sprawdzanie Google AI Overview", done: false },
            { label: "Analiza cytowanych domen", done: false },
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                step.done ? "bg-emerald-500/20 border border-emerald-500/40" : "bg-zinc-800 border border-zinc-700"
              }`}>
                {step.done ? (
                  <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-600 animate-pulse" />
                )}
              </div>
              <span className={`text-sm ${step.done ? "text-zinc-400" : "text-zinc-500"}`}>{step.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Failed ───────────────────────────────────────────────────────────────────
  if (job?.status === "failed") {
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

  // ── Completed ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="bg-zinc-900/40 border border-white/8 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            hasCitations
              ? "bg-emerald-500/20 border border-emerald-500/30"
              : hasDomainCitations
              ? "bg-amber-500/20 border border-amber-500/30"
              : "bg-red-500/20 border border-red-500/30"
          }`}>
            {hasCitations ? (
              <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : hasDomainCitations ? (
              <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
          </div>
          <div>
            <h2 className="text-base font-bold text-white">
              {hasCitations
                ? "Twoja strona jest cytowana przez AI ✅"
                : hasDomainCitations
                ? "Twoja domena jest widoczna — ale nie ta podstrona 🔗"
                : "Twoja strona nie jest cytowana przez AI ❌"}
            </h2>
            <p className="text-sm text-zinc-400 mt-1">
              {hasCitations
                ? "Dobra robota! Twoja strona pojawia się w odpowiedziach AI. Sprawdź szczegóły poniżej."
                : hasDomainCitations
                ? "AI cytuje inne podstrony Twojej domeny. Ta konkretna strona nie jest wystarczająco widoczna."
                : "AI nie cytuje Twojej strony dla żadnego z testowanych zapytań. Poniżej znajdziesz, kto jest cytowany zamiast Ciebie."}
            </p>
          </div>
        </div>
      </div>

      {/* ChatGPT results */}
      {chatgptChecks.length > 0 && (
        <EngineSection engine="chatgpt" checks={chatgptChecks} targetDomain={targetDomain} />
      )}

      {/* Google results */}
      {googleChecks.length > 0 && (
        <EngineSection engine="google" checks={googleChecks} targetDomain={targetDomain} />
      )}

      {/* Competitor summary */}
      <CompetitorSummary checks={checks} targetDomain={targetDomain} />

      {/* PLG Upsell */}
      <PLGUpsell url={url} hasIssues={hasIssues} />
    </div>
  );
}

export default AICitationPanel;
