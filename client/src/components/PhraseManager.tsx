/**
 * PhraseManager — Monitoring Phrase Set UI
 *
 * Shows the stable set of monitoring phrases for a monitored page.
 * Allows users to:
 *   - View AI-generated phrases with rationale (why this phrase was selected)
 *   - Toggle phrases active/inactive
 *   - Add custom phrases (up to plan limit)
 *   - Delete user-added phrases
 *
 * Triggers phrase initialization if not yet done (first time a page is monitored).
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Sparkles,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Info,
  Loader2,
  ChevronDown,
  ChevronUp,
  Lock,
  Flame,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Phrase {
  id: number;
  phrase: string;
  source: "ai_generated" | "user_added" | "user_modified";
  aiRationale: string | null;
  intentType: "informational" | "navigational" | "commercial" | "transactional" | "comparative" | "how_to" | "problem_solving" | null;
  isActive: boolean;
  lastCitedEngines: number | null;
  citationStreakDays: number | null;
  lastCheckedAt: Date | string | null;
  // INTENT-MATRIX v4 fields
  engineAffinity: Array<"chatgpt" | "perplexity" | "gemini" | "google"> | null;
  citationProbability: "high" | "medium" | "low" | null;
}

interface PhraseManagerProps {
  monitoredPageId: number;
  plan: string;
  className?: string;
  /** If true, shows a compact inline version (for MonitoredPageCard) */
  compact?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ENGINE_ICONS: Record<string, { label: string; icon: string }> = {
  chatgpt: { label: "ChatGPT", icon: "C" },
  perplexity: { label: "Perplexity", icon: "P" },
  gemini: { label: "Gemini", icon: "G" },
  google: { label: "Google AI", icon: "A" },
};

const PROB_CONFIG: Record<string, { label: string; color: string }> = {
  high: { label: "Wysoka szansa", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  medium: { label: "Średnia szansa", color: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
  low: { label: "Niska szansa", color: "bg-muted/30 text-muted-foreground border-border" },
};

const INTENT_LABELS: Record<string, { label: string; color: string }> = {
  informational: { label: "Info", color: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  commercial: { label: "Komercyjne", color: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
  transactional: { label: "Zakup", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  navigational: { label: "Nawigacja", color: "bg-violet-500/15 text-violet-400 border-violet-500/20" },
  comparative: { label: "Porównanie", color: "bg-orange-500/15 text-orange-400 border-orange-500/20" },
  how_to: { label: "Jak to zrobić", color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20" },
  problem_solving: { label: "Problem", color: "bg-red-500/15 text-red-400 border-red-500/20" },
};

const PLAN_CUSTOM_LIMITS: Record<string, number> = {
  free: 0,
  starter: 3,
  pro: 10,
  business: Infinity,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function CitationBadge({ engines, streak }: { engines: number | null; streak: number | null }) {
  if (engines == null) return null;
  if (engines === 0) return (
    <span className="text-xs text-muted-foreground tabular-nums">0/4 AI</span>
  );
  return (
    <div className="flex items-center gap-1">
      <span className={`text-xs font-semibold tabular-nums ${engines >= 3 ? "text-emerald-400" : engines >= 1 ? "text-amber-400" : "text-muted-foreground"}`}>
        {engines}/4 AI
      </span>
      {streak != null && streak >= 3 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-0.5 text-xs text-orange-400 cursor-help">
              <Flame className="w-3 h-3" />{streak}d
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Cytowana przez {streak} dni z rzędu
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PhraseManager({ monitoredPageId, plan, className = "", compact = false }: PhraseManagerProps) {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const [expanded, setExpanded] = useState(!compact);
  const [newPhrase, setNewPhrase] = useState("");
  const [addingPhrase, setAddingPhrase] = useState(false);
  const [expandedRationale, setExpandedRationale] = useState<number | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: phrases, isLoading: phrasesLoading } = trpc.monitoring.getPhrases.useQuery(
    { monitoredPageId },
    { enabled: !!user }
  );

  const initMutation = trpc.monitoring.initializePhrases.useMutation({
    onSuccess: () => {
      utils.monitoring.getPhrases.invalidate({ monitoredPageId });
      toast.success("Frazy monitoringowe zostały wygenerowane!");
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleMutation = trpc.monitoring.togglePhrase.useMutation({
    onSuccess: () => utils.monitoring.getPhrases.invalidate({ monitoredPageId }),
    onError: (e) => toast.error(e.message),
  });

  const addMutation = trpc.monitoring.addPhrase.useMutation({
    onSuccess: () => {
      utils.monitoring.getPhrases.invalidate({ monitoredPageId });
      setNewPhrase("");
      setAddingPhrase(false);
      toast.success("Fraza dodana do monitoringu.");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.monitoring.deletePhrase.useMutation({
    onSuccess: () => utils.monitoring.getPhrases.invalidate({ monitoredPageId }),
    onError: (e) => toast.error(e.message),
  });

  // ── Auto-initialize if no phrases yet ─────────────────────────────────────
  useEffect(() => {
    if (!phrasesLoading && phrases && phrases.length === 0 && !initMutation.isPending) {
      initMutation.mutate({ monitoredPageId });
    }
  }, [phrasesLoading, phrases]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const maxCustom = PLAN_CUSTOM_LIMITS[plan] ?? 0;
  const userAddedCount = (phrases ?? []).filter(
    (p) => p.source === "user_added" || p.source === "user_modified"
  ).length;
  const canAddMore = maxCustom === Infinity || userAddedCount < maxCustom;
  const activeCount = (phrases ?? []).filter((p) => p.isActive).length;

  // ── Loading state ──────────────────────────────────────────────────────────
  if (phrasesLoading || initMutation.isPending) {
    return (
      <div className={`rounded-lg border border-border bg-card/50 p-3 ${className}`}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
          <span>
            {initMutation.isPending
              ? "Generuję frazy z analizy treści…"
              : "Ładowanie fraz…"}
          </span>
        </div>
      </div>
    );
  }

  if (!phrases || phrases.length === 0) {
    return (
      <div className={`rounded-lg border border-dashed border-border p-3 ${className}`}>
        <p className="text-xs text-muted-foreground">Brak fraz. Uruchom audyt, aby wygenerować frazy z analizy treści.</p>
        <Button
          size="sm"
          variant="ghost"
          className="mt-2 h-7 text-xs gap-1 text-violet-400"
          onClick={() => initMutation.mutate({ monitoredPageId })}
        >
          <Sparkles className="w-3 h-3" /> Generuj frazy
        </Button>
      </div>
    );
  }

  // ── Compact header (collapsed) ─────────────────────────────────────────────
  const header = (
    <button
      className="w-full flex items-center justify-between text-left"
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0" />
        <span className="text-xs font-semibold text-foreground">
          Frazy monitoringowe
        </span>
        <Badge variant="secondary" className="text-xs h-4 px-1.5 bg-violet-500/15 text-violet-400 border-violet-500/20">
          {activeCount} aktywnych
        </Badge>
      </div>
      {compact && (
        expanded
          ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
          : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
      )}
    </button>
  );

  return (
    <TooltipProvider>
      <div className={`rounded-lg border border-border bg-card/50 ${className}`}>
        {/* Header */}
        <div className="px-3 pt-3 pb-2">
          {header}
        </div>

        {/* Phrase list */}
        {expanded && (
          <div className="px-3 pb-3 space-y-1.5">
            {(phrases as Phrase[]).map((phrase) => (
              <div
                key={phrase.id}
                className={`group rounded-md border transition-all ${
                  phrase.isActive
                    ? "border-border bg-background/50"
                    : "border-border/40 bg-muted/20 opacity-60"
                }`}
              >
                <div className="flex items-start gap-2 p-2">
                  {/* Toggle active */}
                  <button
                    className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => toggleMutation.mutate({ phraseId: phrase.id, isActive: !phrase.isActive })}
                    title={phrase.isActive ? "Dezaktywuj" : "Aktywuj"}
                  >
                    {phrase.isActive
                      ? <Eye className="w-3.5 h-3.5 text-violet-400" />
                      : <EyeOff className="w-3.5 h-3.5" />
                    }
                  </button>

                  {/* Phrase text + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-xs font-medium ${phrase.isActive ? "text-foreground" : "text-muted-foreground"}`}>
                        {phrase.phrase}
                      </span>
                      {phrase.intentType && INTENT_LABELS[phrase.intentType] && (
                        <span className={`text-[10px] px-1.5 py-0 rounded border font-medium ${INTENT_LABELS[phrase.intentType].color}`}>
                          {INTENT_LABELS[phrase.intentType].label}
                        </span>
                      )}
                      {phrase.source === "user_added" && (
                        <span className="text-[10px] px-1.5 py-0 rounded border bg-cyan-500/10 text-cyan-400 border-cyan-500/20 font-medium">
                          Twoja
                        </span>
                      )}
                    </div>

                    {/* INTENT-MATRIX metadata row: engine affinity + citation probability */}
                    {(phrase.engineAffinity?.length || phrase.citationProbability) && (
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {/* Engine affinity dots */}
                        {phrase.engineAffinity && phrase.engineAffinity.length > 0 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-0.5 cursor-help">
                                {phrase.engineAffinity.map((eng) => (
                                  <span
                                    key={eng}
                                    className="w-4 h-4 rounded-full bg-muted/50 border border-border flex items-center justify-center text-[8px] font-bold text-muted-foreground"
                                  >
                                    {ENGINE_ICONS[eng]?.icon ?? eng[0].toUpperCase()}
                                  </span>
                                ))}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              Najlepiej dla: {phrase.engineAffinity.map(e => ENGINE_ICONS[e]?.label ?? e).join(", ")}
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {/* Citation probability badge */}
                        {phrase.citationProbability && PROB_CONFIG[phrase.citationProbability] && (
                          <span className={`text-[10px] px-1.5 py-0 rounded border font-medium ${PROB_CONFIG[phrase.citationProbability].color}`}>
                            {PROB_CONFIG[phrase.citationProbability].label}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Citation metrics */}
                    {phrase.lastCheckedAt && (
                      <div className="mt-0.5">
                        <CitationBadge
                          engines={phrase.lastCitedEngines}
                          streak={phrase.citationStreakDays}
                        />
                      </div>
                    )}

                    {/* Rationale (expandable) */}
                    {phrase.aiRationale && (
                      <div className="mt-1">
                        {expandedRationale === phrase.id ? (
                          <div className="text-[11px] text-muted-foreground leading-relaxed bg-muted/30 rounded p-1.5">
                            {phrase.aiRationale}
                            <button
                              className="ml-1 text-violet-400 hover:underline"
                              onClick={() => setExpandedRationale(null)}
                            >
                              Zwiń
                            </button>
                          </div>
                        ) : (
                          <button
                            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-violet-400 transition-colors"
                            onClick={() => setExpandedRationale(phrase.id)}
                          >
                            <Info className="w-3 h-3" />
                            Dlaczego ta fraza?
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Delete (user-added only) */}
                  {(phrase.source === "user_added" || phrase.source === "user_modified") && (
                    <button
                      className="shrink-0 text-muted-foreground hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                      onClick={() => deleteMutation.mutate({ phraseId: phrase.id })}
                      title="Usuń frazę"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Add phrase row */}
            <div className="pt-1">
              {addingPhrase ? (
                <div className="flex gap-1.5">
                  <input
                    autoFocus
                    type="text"
                    value={newPhrase}
                    onChange={(e) => setNewPhrase(e.target.value)}
                    placeholder="Wpisz frazę do monitorowania…"
                    className="flex-1 text-xs bg-background border border-border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-500/50 text-foreground placeholder:text-muted-foreground"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newPhrase.trim().length >= 3) {
                        addMutation.mutate({ monitoredPageId, phrase: newPhrase.trim() });
                      }
                      if (e.key === "Escape") {
                        setAddingPhrase(false);
                        setNewPhrase("");
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-violet-600 hover:bg-violet-700 text-white px-2"
                    disabled={newPhrase.trim().length < 3 || addMutation.isPending}
                    onClick={() => addMutation.mutate({ monitoredPageId, phrase: newPhrase.trim() })}
                  >
                    {addMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Dodaj"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={() => { setAddingPhrase(false); setNewPhrase(""); }}
                  >
                    Anuluj
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {canAddMore ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs gap-1 text-muted-foreground hover:text-violet-400"
                      onClick={() => setAddingPhrase(true)}
                    >
                      <Plus className="w-3 h-3" /> Dodaj własną frazę
                    </Button>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground cursor-not-allowed">
                          <Lock className="w-3 h-3" />
                          <span>Limit fraz osiągnięty</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs max-w-52">
                        {plan === "free"
                          ? "Własne frazy dostępne od planu Starter."
                          : `Plan ${plan} pozwala na ${maxCustom} własne frazy per strona. Przejdź na wyższy plan.`}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {maxCustom !== Infinity && (
                    <span className="text-[11px] text-muted-foreground ml-auto">
                      {userAddedCount}/{maxCustom === Infinity ? "∞" : maxCustom} własnych
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
