/**
 * AICitationPanel — AI Citation Check feature (Pro)
 *
 * Shows whether the audited URL is cited by ChatGPT, Perplexity, and Google AI Overviews.
 * Starts a citation job on mount (if user is authenticated), then polls for results.
 */

import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getLoginUrl } from "@/const";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CitationCheck {
  id: number;
  query: string;
  engine: "chatgpt" | "perplexity" | "google";
  isCited: "yes" | "no" | "partial";
  citedUrl?: string | null;
  snippet?: string | null;
  responseText?: string | null;
}

interface CitationJob {
  id: number;
  auditId: number;
  status: "pending" | "running" | "completed" | "failed";
  prompts?: string[] | null;
}

interface Props {
  auditId: number;
  url: string;
  pageTitle?: string;
  pageTopics?: string[];
  pageType?: string;
  // Content Intelligence top_questions — used as citation queries (zero LLM cost, correct language)
  topQuestions?: string[];
  // Detected page language (e.g. "pl", "en", "de")
  language?: string;
}

// ─── Engine Config ─────────────────────────────────────────────────────────────

const ENGINE_CONFIG = {
  chatgpt: {
    name: "ChatGPT Search",
    icon: "🤖",
    color: "from-green-500/20 to-emerald-500/10",
    borderColor: "border-green-500/30",
    description: "OpenAI web search",
  },
  perplexity: {
    name: "Perplexity",
    icon: "🔍",
    color: "from-blue-500/20 to-indigo-500/10",
    borderColor: "border-blue-500/30",
    description: "AI search engine",
  },
  google: {
    name: "Google AI Overviews",
    icon: "🌐",
    color: "from-orange-500/20 to-yellow-500/10",
    borderColor: "border-orange-500/30",
    description: "AI-generated summaries",
  },
} as const;

// ─── Sub-components ────────────────────────────────────────────────────────────

function CitationBadge({ isCited }: { isCited: "yes" | "no" | "partial" }) {
  if (isCited === "yes") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30">
        ✅ Cytowany
      </span>
    );
  }
  if (isCited === "partial") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
        ⚠️ Wzmiankowany
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-700/50 text-zinc-400 border border-zinc-600/30">
      ❌ Brak cytowania
    </span>
  );
}

function EngineCard({
  engine,
  checks,
}: {
  engine: "chatgpt" | "perplexity" | "google";
  checks: CitationCheck[];
}) {
  const config = ENGINE_CONFIG[engine];
  const engineChecks = checks.filter((c) => c.engine === engine);
  const cited = engineChecks.filter((c) => c.isCited === "yes").length;
  const partial = engineChecks.filter((c) => c.isCited === "partial").length;
  const total = engineChecks.length;
  const [open, setOpen] = useState(false);

  const score = total > 0 ? Math.round(((cited + partial * 0.5) / total) * 100) : 0;

  return (
    <div className={`rounded-xl border ${config.borderColor} bg-gradient-to-br ${config.color} p-4`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{config.icon}</span>
          <div>
            <div className="font-semibold text-sm text-zinc-100">{config.name}</div>
            <div className="text-xs text-zinc-400">{config.description}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-zinc-100">{score}%</div>
          <div className="text-xs text-zinc-400">
            {cited + partial}/{total} zapytań
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-zinc-700/50 rounded-full mb-3 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            score >= 50 ? "bg-green-500" : score >= 25 ? "bg-yellow-500" : "bg-zinc-500"
          }`}
          style={{ width: `${score}%` }}
        />
      </div>

      {/* Query list */}
      {engineChecks.length > 0 && (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <button className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1">
              {open ? "▲" : "▼"} {open ? "Ukryj" : "Pokaż"} zapytania ({engineChecks.length})
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 space-y-1.5">
              {engineChecks.map((check) => (
                <div
                  key={check.id}
                  className="flex items-start gap-2 py-1.5 px-2 rounded-lg bg-zinc-900/40"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-zinc-300 truncate" title={check.query}>
                      "{check.query}"
                    </div>
                    {check.snippet && check.isCited !== "no" && (
                      <div className="text-xs text-zinc-500 mt-0.5 line-clamp-2 italic">
                        {check.snippet}
                      </div>
                    )}
                    {check.citedUrl && (
                      <a
                        href={check.citedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300 truncate block"
                      >
                        {check.citedUrl.slice(0, 60)}...
                      </a>
                    )}
                  </div>
                  <CitationBadge isCited={check.isCited} />
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function AICitationPanel({ auditId, url, pageTitle, pageTopics, pageType, topQuestions, language }: Props) {
  const { user } = useAuth();
  const [jobId, setJobId] = useState<number | null>(null);
  const [jobStarted, setJobStarted] = useState(false);
  const [pollEnabled, setPollEnabled] = useState(false);

  const startCheck = trpc.citation.startCheck.useMutation({
    onSuccess: (data) => {
      setJobId(data.jobId);
      setPollEnabled(true);
    },
    onError: (err) => {
      console.error("[AICitationPanel] startCheck failed:", err);
    },
  });

  const { data: citationData, isLoading: isPolling } = trpc.citation.getResults.useQuery(
    { auditId },
    {
      enabled: pollEnabled || jobStarted,
      refetchInterval: (query) => {
        const job = query.state.data?.job;
        if (!job) return 5000;
        if (job.status === "completed" || job.status === "failed") return false;
        return 5000; // poll every 5s while running
      },
      refetchIntervalInBackground: false,
    }
  );

  // Check if there's already a job for this audit on mount
  useEffect(() => {
    if (citationData?.job) {
      setJobStarted(true);
      setPollEnabled(citationData.job.status !== "completed" && citationData.job.status !== "failed");
    }
  }, [citationData?.job?.id]);

  const handleStartCheck = useCallback(() => {
    if (!user || jobStarted) return;
    setJobStarted(true);
    startCheck.mutate({
      auditId,
      url,
      pageTitle: pageTitle ?? url,
      pageTopics: pageTopics ?? [],
      pageType: pageType ?? "generic",
      // Pass Content Intelligence top_questions as citation queries (zero LLM cost, correct language)
      topQuestions: topQuestions ?? [],
      language: language ?? "en",
    });
  }, [user, jobStarted, auditId, url, pageTitle, pageTopics, pageType, topQuestions, language]);

  const job = citationData?.job;
  const checks = (citationData?.checks ?? []) as CitationCheck[];
  const isRunning = job?.status === "pending" || job?.status === "running";
  const isCompleted = job?.status === "completed";

  // ── Not logged in ──
  if (!user) {
    return (
      <div className="rounded-2xl border border-zinc-700/50 bg-zinc-900/50 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/30 to-purple-500/20 flex items-center justify-center text-xl">
            🎯
          </div>
          <div>
            <h3 className="font-semibold text-zinc-100">AI Citation Check</h3>
            <p className="text-xs text-zinc-400">Sprawdź czy Twoja strona jest cytowana przez AI</p>
          </div>
          <Badge variant="outline" className="ml-auto border-violet-500/50 text-violet-400 text-xs">
            Pro
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4 opacity-50 blur-[2px] pointer-events-none select-none">
          {(["chatgpt", "perplexity", "google"] as const).map((engine) => (
            <div
              key={engine}
              className={`rounded-xl border ${ENGINE_CONFIG[engine].borderColor} bg-gradient-to-br ${ENGINE_CONFIG[engine].color} p-4`}
            >
              <div className="text-2xl mb-1">{ENGINE_CONFIG[engine].icon}</div>
              <div className="text-sm font-medium text-zinc-300">{ENGINE_CONFIG[engine].name}</div>
              <div className="text-2xl font-bold text-zinc-100 mt-2">—%</div>
            </div>
          ))}
        </div>

        <div className="text-center">
          <p className="text-sm text-zinc-400 mb-3">
            Zaloguj się, aby sprawdzić czy ChatGPT, Perplexity i Google AI cytują Twoją stronę
          </p>
          <Button
            size="sm"
            className="bg-violet-600 hover:bg-violet-500 text-white"
            onClick={() => (window.location.href = getLoginUrl())}
          >
            Zaloguj się i sprawdź →
          </Button>
        </div>
      </div>
    );
  }

  // ── Not started yet ──
  if (!jobStarted && !job) {
    return (
      <div className="rounded-2xl border border-zinc-700/50 bg-zinc-900/50 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/30 to-purple-500/20 flex items-center justify-center text-xl">
            🎯
          </div>
          <div>
            <h3 className="font-semibold text-zinc-100">AI Citation Check</h3>
            <p className="text-xs text-zinc-400">
              Sprawdź czy ChatGPT, Perplexity i Google AI cytują tę stronę
            </p>
          </div>
          <Badge variant="outline" className="ml-auto border-violet-500/50 text-violet-400 text-xs">
            Pro
          </Badge>
        </div>

        <p className="text-sm text-zinc-400 mb-4">
          Wygenerujemy 6 zapytań bliskoznacznych z treścią strony i sprawdzimy, czy każdy z 3 silników AI
          cytuje Twój URL w odpowiedziach. Wyniki pojawią się po 2–5 minutach.
        </p>

        <div className="grid grid-cols-3 gap-2 mb-4 text-center text-xs text-zinc-500">
          <div className="rounded-lg bg-zinc-800/50 p-2">
            <div className="text-lg mb-1">🤖</div>
            ChatGPT Search
          </div>
          <div className="rounded-lg bg-zinc-800/50 p-2">
            <div className="text-lg mb-1">🔍</div>
            Perplexity
          </div>
          <div className="rounded-lg bg-zinc-800/50 p-2">
            <div className="text-lg mb-1">🌐</div>
            Google AI
          </div>
        </div>

        <Button
          onClick={handleStartCheck}
          disabled={startCheck.isPending}
          className="w-full bg-violet-600 hover:bg-violet-500 text-white"
        >
          {startCheck.isPending ? "Uruchamiam..." : "Sprawdź cytowania AI →"}
        </Button>
      </div>
    );
  }

  // ── Running ──
  if (isRunning || (jobStarted && !isCompleted && checks.length === 0)) {
    const queries = (job?.prompts as string[]) ?? [];
    return (
      <div className="rounded-2xl border border-zinc-700/50 bg-zinc-900/50 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/30 to-purple-500/20 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
          </div>
          <div>
            <h3 className="font-semibold text-zinc-100">AI Citation Check — trwa sprawdzanie...</h3>
            <p className="text-xs text-zinc-400">Odpytuję ChatGPT, Perplexity i Google AI</p>
          </div>
        </div>

        {queries.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-zinc-500 mb-2">Sprawdzane zapytania:</p>
            <div className="space-y-1">
              {queries.map((q, i) => (
                <div key={i} className="text-xs text-zinc-400 flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-zinc-700 flex items-center justify-center text-[10px]">
                    {i + 1}
                  </span>
                  "{q}"
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 opacity-40">
          {(["chatgpt", "perplexity", "google"] as const).map((engine) => (
            <div
              key={engine}
              className={`rounded-xl border ${ENGINE_CONFIG[engine].borderColor} bg-gradient-to-br ${ENGINE_CONFIG[engine].color} p-3 text-center`}
            >
              <div className="text-xl mb-1">{ENGINE_CONFIG[engine].icon}</div>
              <div className="text-xs text-zinc-400">{ENGINE_CONFIG[engine].name}</div>
              <div className="mt-2 w-6 h-6 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ))}
        </div>

        <p className="text-xs text-zinc-500 text-center mt-4">
          Wyniki pojawią się automatycznie za 2–5 minut...
        </p>
      </div>
    );
  }

  // ── Completed ──
  const citedByEngine = {
    chatgpt: checks.filter((c) => c.engine === "chatgpt" && c.isCited !== "no").length,
    perplexity: checks.filter((c) => c.engine === "perplexity" && c.isCited !== "no").length,
    google: checks.filter((c) => c.engine === "google" && c.isCited !== "no").length,
  };
  const totalCitations = Object.values(citedByEngine).reduce((a, b) => a + b, 0);
  const queriesPerEngine = checks.filter((c) => c.engine === "chatgpt").length;

  const uncitedQueries = (job?.prompts as string[] ?? []).filter((q) => {
    const forQuery = checks.filter((c) => c.query === q);
    return forQuery.every((c) => c.isCited === "no");
  });

  return (
    <div className="rounded-2xl border border-zinc-700/50 bg-zinc-900/50 p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/30 to-purple-500/20 flex items-center justify-center text-xl">
          🎯
        </div>
        <div>
          <h3 className="font-semibold text-zinc-100">AI Citation Check</h3>
          <p className="text-xs text-zinc-400">
            {totalCitations > 0
              ? `Cytowany w ${totalCitations} z ${queriesPerEngine * 3} sprawdzeń`
              : "Brak cytowań w sprawdzonych zapytaniach"}
          </p>
        </div>
        <Badge
          variant="outline"
          className={`ml-auto text-xs ${
            totalCitations > 0
              ? "border-green-500/50 text-green-400"
              : "border-zinc-600 text-zinc-400"
          }`}
        >
          {totalCitations > 0 ? "✅ Widoczny" : "❌ Niewidoczny"}
        </Badge>
      </div>

      {/* Engine cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {(["chatgpt", "perplexity", "google"] as const).map((engine) => (
          <EngineCard key={engine} engine={engine} checks={checks} />
        ))}
      </div>

      {/* Uncited queries — content gap signal */}
      {uncitedQueries.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-amber-400">💡</span>
            <span className="text-sm font-medium text-amber-300">
              Zapytania bez cytowań — potencjał do poprawy
            </span>
          </div>
          <p className="text-xs text-zinc-400 mb-2">
            Żaden silnik AI nie cytuje Twojej strony dla tych zapytań. Rozważ dodanie treści
            odpowiadającej na te pytania:
          </p>
          <div className="space-y-1">
            {uncitedQueries.map((q, i) => (
              <div key={i} className="text-xs text-zinc-300 flex items-center gap-2">
                <span className="text-amber-500">→</span>
                "{q}"
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Re-check button */}
      <div className="mt-4 flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="text-xs border-zinc-600 text-zinc-400 hover:text-zinc-200"
          onClick={() => {
            setJobStarted(false);
            setPollEnabled(false);
            setJobId(null);
          }}
        >
          Sprawdź ponownie
        </Button>
      </div>
    </div>
  );
}
