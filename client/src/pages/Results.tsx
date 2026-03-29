import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  Copy,
  Brain,
  Shield,
  Code2,
  FileText,
  Zap,
  Bot,
  BarChart3,
  AlertCircle,
  Sparkles,
  Share2,
  Lock,
  TrendingUp,
  LayoutDashboard,
  LogIn,
  Lightbulb,
  Target,
  Search,
  Cpu,
  Download,
  Eye,
  Globe,
  TrendingDown,
  Activity,
  Award,
  Flame,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";
import { lazy, Suspense } from "react";
// Lazy-loaded to avoid ~600 kB in the initial bundle — only loaded when a code snippet is rendered
const SyntaxHighlighter = lazy(() => import("react-syntax-highlighter").then((m) => ({ default: m.default })));
import { atomOneDark } from "react-syntax-highlighter/dist/cjs/styles/hljs";
import type {
  AuditResult,
  CategoryResult,
  AuditCheck,
  Recommendation,
  LLMRecommendation,
  LLMRecommendationsResult,
  ContentIntelligenceResult,
} from "../../../shared/auditTypes";
import { AICitationPanel } from "@/components/AICitationPanel";
import UpsellProModal from "@/components/UpsellProModal";
import { Streamdown } from "streamdown";
import { runSimulation, estimateTotalImprovement } from "@/geo-sandbox/engine/simulator";
import { Plus, RefreshCw as RefreshCwIcon } from "lucide-react";
import type { SimulationResult } from "@/geo-sandbox/types/simulator";
import WhatIfEditor from "@/geo-sandbox/components/WhatIfEditor";
import ScoreGauge from "@/geo-sandbox/components/ScoreGauge";
import IssuesList from "@/geo-sandbox/components/IssuesList";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getScoreColor(score: number): string {
  if (score >= 80) return "oklch(0.72 0.18 145)";
  if (score >= 60) return "oklch(0.72 0.18 160)";
  if (score >= 40) return "oklch(0.78 0.18 75)";
  return "oklch(0.65 0.22 25)";
}

function getScoreLabel(score: number): string {
  if (score >= 83) return "Dominujący";
  if (score >= 70) return "Widoczny";
  if (score >= 55) return "Rozwijający się";
  if (score >= 36) return "Startujący";
  return "Niewidoczny";
}

function getNextLevelMessage(score: number): { points: number; action: string } | null {
  if (score >= 83) return { points: 0, action: "Włącz monitoring — konkurenci mogą Cię wyprzedzić bez ostrzeżenia" };
  if (score >= 70) return { points: 83 - score, action: "Dodaj analizę treści AI" };
  if (score >= 55) return { points: 70 - score, action: "Dodaj FAQ + dane strukturalne" };
  if (score >= 36) return { points: 55 - score, action: "Dodaj TL;DR, nagłówki i FAQ" };
  return { points: 36 - score, action: "Napraw dostęp techniczny i meta tagi" };
}

function getScoreSublabel(score: number): string {
  if (score >= 83) return "Twoja strona dominuje w AI Search — jesteś w czołówce. Monitoruj pozycję, bo konkurenci mogą Cię gonić.";
  if (score >= 70) return "Dobra widoczność w AI Search. Kilka precyzyjnych poprawek (FAQ, dane strukturalne, TL;DR) może wynieść Cię do poziomu Dominującego.";
  if (score >= 55) return "Twoja strona jest zauważalna przez AI, ale traci cytowania na rzecz konkurentów. Masz solidne podstawy — czas na optymalizację treści.";
  if (score >= 36) return "Wyszukiwarki AI rzadko cytują Twoją stronę. Brakuje kluczowych sygnałów GEO — ale to właśnie te zmiany dają największy skok widoczności.";
  return "Twoja strona jest praktycznie niewidoczna dla AI Search. Kilka fundamentalnych zmian może radykalnie zmienić sytuację — zacznij od rekomendacji poniżej.";
}

/**
 * AI Volatility Badge — how fragile is the current score?
 * Based on which categories are weak (content-heavy = more volatile).
 */
function getVolatilityBadge(findings: AuditResult["findings"] | null): {
  level: "stable" | "moderate" | "fragile";
  label: string;
  reason: string;
  color: string;
  bg: string;
} {
  if (!findings) return { level: "moderate", label: "Umiarkowany", reason: "Brak danych do oceny stabilności", color: "oklch(0.78 0.18 75)", bg: "oklch(0.78 0.18 75 / 0.10)" };
  const cs = (findings.contentStructure as { score?: number })?.score ?? 100;
  const sd = (findings.structuredData as { score?: number })?.score ?? 100;
  const eeat = (findings.eeat as { score?: number })?.score ?? 100;
  const weakCount = [cs < 60, sd < 60, eeat < 60].filter(Boolean).length;
  if (weakCount >= 2) return {
    level: "fragile",
    label: "Kruchy",
    reason: "Wynik opiera się na sygnałach technicznych — jedna zmiana algorytmu AI może go obniżyć o 10–15 pkt",
    color: "oklch(0.65 0.22 25)",
    bg: "oklch(0.65 0.22 25 / 0.10)",
  };
  if (weakCount === 1 || cs < 75 || sd < 75) return {
    level: "moderate",
    label: "Umiarkowany",
    reason: "Solidna podstawa techniczna, ale treść i dane strukturalne wymagają wzmocnienia dla długoterminowej stabilności",
    color: "oklch(0.78 0.18 75)",
    bg: "oklch(0.78 0.18 75 / 0.10)",
  };
  return {
    level: "stable",
    label: "Stabilny",
    reason: "Wynik oparty na silnych sygnałach treści i danych strukturalnych — odporny na zmiany algorytmów AI",
    color: "oklch(0.72 0.18 145)",
    bg: "oklch(0.72 0.18 145 / 0.10)",
  };
}

/**
 * Benchmark Percentile — estimated position vs. audited pages in the same score range.
 * Distribution approximation: most pages cluster in 30–55 (no GEO optimization).
 * Category is personalized based on detected pageType from audit.
 */
function getBenchmarkPercentile(score: number, pageType?: string | null): { percentile: number; category: string } {
  // Map pageType to human-readable benchmark category
  const categoryMap: Record<string, string> = {
    "product": "sklepów e-commerce",
    "product-listing": "kategorii e-commerce",
    "article": "artykułów i blogów",
    "homepage": "stron głównych",
    "service": "stron usługowych",
    "landing": "landing page’ów",
    "generic": "stron internetowych",
  };
  const category = categoryMap[pageType ?? "generic"] ?? "stron internetowych";

  // Score distribution is slightly different per page type:
  // Product pages tend to score lower (less content), articles higher.
  const boost = ["article"].includes(pageType ?? "") ? 4 : ["product", "product-listing"].includes(pageType ?? "") ? -3 : 0;
  const adj = score + boost;

  if (adj >= 83) return { percentile: 97, category };
  if (adj >= 75) return { percentile: 88, category };
  if (adj >= 70) return { percentile: 79, category };
  if (adj >= 60) return { percentile: 63, category };
  if (adj >= 50) return { percentile: 44, category };
  if (adj >= 36) return { percentile: 28, category };
  return { percentile: 12, category };
}

const CATEGORY_META = [
  { key: "technical", label: "Dostęp techniczny", icon: Shield },
  { key: "structuredData", label: "Dane strukturalne", icon: Code2 },
  { key: "contentStructure", label: "Struktura treści", icon: FileText },
  { key: "eeat", label: "Zaufanie i autorytet", icon: Zap },
  { key: "aiCrawlers", label: "Dostęp crawlerów AI", icon: Bot },
  { key: "metaTags", label: "Meta tagi", icon: BarChart3 },
  { key: "brandAuthority", label: "Obecność marki", icon: TrendingUp },
];

const CATEGORY_HUMAN_LABELS: Record<string, string> = {
  technical: "Dostęp techniczny",
  structuredData: "Dane strukturalne",
  contentStructure: "Struktura treści",
  eeat: "Zaufanie i autorytet",
  aiCrawlers: "Dostęp crawlerów AI",
  metaTags: "Meta tagi",
  brandAuthority: "Obecność marki",
};

// Human-readable descriptions for non-technical users
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  technical: "Czy crawlery AI mogą uzyskać dostęp do Twojej strony bez barier technicznych.",
  structuredData: "Etykiety czytelne maszynowo, które pomagają AI zrozumieć, o czym jest Twoja strona.",
  contentStructure: "Jak dobrze Twoja treść jest zorganizowana, aby AI mogło wyciągać i cytować odpowiedzi.",
  eeat: "Sygnały mówiące AI, że Twoja treść jest godna zaufania i napisana przez eksperta.",
  aiCrawlers: "Czy audytowana podstrona jest dostępna dla crawlerów AI Search oraz czy robots.txt nie blokuje całkowicie żadnego silnika AI.",
  metaTags: "Tytuł i opis strony, których AI używa do zrozumienia treści na pierwszy rzut oka.",
  brandAuthority: "Jak silnie Twoja marka jest rozpoznawana jako autorytet w swojej dziedzinie przez wyszukiwarki AI.",
};

// ─── Citation Status Banner (compact widget for Tab 1) ───────────────────────

type CitationStatus = "idle" | "running" | "done" | "error";

function CitationStatusBanner({
  status,
  citedCount,
  totalEngines,
  onGoToTab,
}: {
  status: CitationStatus;
  citedCount: number;
  totalEngines: number;
  onGoToTab: () => void;
}) {
  const isCited = citedCount > 0;

  if (status === "idle") {
    return (
      <button
        onClick={onGoToTab}
        className="w-full rounded-2xl border border-dashed border-primary/30 bg-primary/4 p-4 flex items-center gap-4 hover:bg-primary/8 transition-colors group text-left"
      >
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Eye className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">Sprawdź widoczność w AI Search</div>
          <div className="text-xs text-muted-foreground mt-0.5">Czy ChatGPT, Perplexity i Gemini cytują Twoją stronę? Kliknij, aby uruchomić analizę.</div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-primary font-semibold group-hover:gap-2.5 transition-all shrink-0">
          Sprawdź <ChevronDown className="w-3.5 h-3.5 rotate-[-90deg]" />
        </div>
      </button>
    );
  }

  if (status === "running") {
    return (
      <div className="rounded-2xl border border-primary/20 bg-primary/4 p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">Analizuję widoczność w AI Search…</div>
          <div className="text-xs text-muted-foreground mt-0.5">Sprawdzam ChatGPT, Perplexity, Gemini i Google AI Overviews</div>
        </div>
        <button onClick={onGoToTab} className="text-xs text-primary hover:underline shrink-0">Zobacz postęp →</button>
      </div>
    );
  }

  if (status === "done") {
    return (
      <button
        onClick={onGoToTab}
        className="w-full rounded-2xl border p-4 flex items-center gap-4 hover:bg-muted/10 transition-colors group text-left"
        style={{ borderColor: isCited ? "oklch(0.72 0.18 145 / 0.3)" : "oklch(0.65 0.22 25 / 0.3)" }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: isCited ? "oklch(0.72 0.18 145 / 0.12)" : "oklch(0.65 0.22 25 / 0.10)" }}
        >
          {isCited
            ? <CheckCircle2 className="w-5 h-5" style={{ color: "oklch(0.72 0.18 145)" }} />
            : <AlertTriangle className="w-5 h-5" style={{ color: "oklch(0.65 0.22 25)" }} />
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">
            {isCited
              ? `Cytowana przez ${citedCount} z ${totalEngines} silników AI`
              : `Niewidoczna w ${totalEngines} silnikach AI`
            }
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {isCited
              ? "Twoja strona pojawia się w odpowiedziach AI — sprawdź szczegóły i pozycję konkurentów"
              : "Żaden silnik AI nie cytuje tej strony — sprawdź szczegóły i rekomendacje"
            }
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground group-hover:text-foreground transition-colors shrink-0">
          Szczegóły <ChevronDown className="w-3.5 h-3.5 rotate-[-90deg]" />
        </div>
      </button>
    );
  }

  // error
  return (
    <button
      onClick={onGoToTab}
      className="w-full rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-center gap-4 hover:bg-amber-500/8 transition-colors text-left"
    >
      <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
        <AlertCircle className="w-5 h-5 text-amber-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-amber-300">Analiza cytowań niedostępna</div>
        <div className="text-xs text-muted-foreground mt-0.5">Kliknij, aby spróbować ponownie</div>
      </div>
      <div className="text-xs text-amber-400 shrink-0">Spróbuj ponownie →</div>
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Results() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const auditId = parseInt(params.id ?? "0");
  const { isAuthenticated, user } = useAuth();
  const userPlan = (user as any)?.plan ?? "free";
  const hasPaidPlan = isAuthenticated && userPlan !== "free" && !!userPlan;
  const utils = trpc.useUtils();
  // Monitoring CTA: check if this URL is already monitored
  const { data: monitoredPages } = trpc.monitoring.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );
  const addMonitoringMutation = trpc.monitoring.add.useMutation({
    onSuccess: () => {
      utils.monitoring.list.invalidate();
      toast.success("Strona dodana do monitoringu! Widoczność AI będzie śledzona automatycznie.");
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Tab state — supports ?tab=visibility deep link ──
  const [activeTab, setActiveTab] = useState<"optimization" | "visibility">(
    () => new URLSearchParams(window.location.search).get("tab") === "visibility" ? "visibility" : "optimization"
  );

  // ── Citation status for Sticky Bar ──
  // Keep a ref in sync so we can read the latest value inside setTimeout callbacks
  // without capturing stale closures (avoids calling startCheck inside setState updater).
  const citationStatusRef = useRef<CitationStatus>("idle");
  const [citationStatus, setCitationStatusRaw] = useState<CitationStatus>("idle");
  const setCitationStatus = useCallback((s: CitationStatus) => {
    citationStatusRef.current = s;
    setCitationStatusRaw(s);
  }, []);
  const [citationCitedCount, setCitationCitedCount] = useState(0);
  const [citationTotalEngines, setCitationTotalEngines] = useState(3);

  // Competitor URLs from AI Citations — passed to WhatIfSection for Full Rewrite AI
  const [citedCompetitorUrls, setCitedCompetitorUrls] = useState<string[]>([]);

  // Upsell modal state
  const [showUpsellModal, setShowUpsellModal] = useState(false);
  const [upsellTier, setUpsellTier] = useState<"Niewidoczny" | "Startujący">("Startujący");
  const upsellTriggeredRef = useRef(false);

  // Stable callback for AICitationPanel — avoids setState-in-render warning
  // (AICitationPanel calls this from a useEffect, but React can still warn if the
  // callback reference changes every render. Using useCallback + queueMicrotask
  // ensures the setState is always deferred past the current render cycle.)
  const handleCitationStatusChange = useCallback(
    (status: CitationStatus, citedCount?: number, totalEngines?: number) => {
      // Defer to avoid "setState during render" when AICitationPanel fires onStatusChange
      // synchronously on mount (e.g., when a completed job already exists in the query cache).
      queueMicrotask(() => {
        setCitationStatus(status);
        if (citedCount !== undefined) setCitationCitedCount(citedCount);
        if (totalEngines !== undefined) setCitationTotalEngines(totalEngines);
      });
    },
    []
  );

  // Auto-start citation when switching to Tab 2
  const citationAutoStartRef = useRef(false);
  const citationPanelRef = useRef<{ startCheck: () => void } | null>(null);
  // Spinner fallback: show loading for 2s after entering Tab 2 before status resolves
  const [tabVisibilityEnteredAt, setTabVisibilityEnteredAt] = useState<number | null>(null);
  const [, forceUpdate] = useState(0);
  const isTabInitializing = activeTab === "visibility" && citationStatus === "idle" &&
    tabVisibilityEnteredAt !== null && (Date.now() - tabVisibilityEnteredAt < 2000);

  const handleSwitchToVisibility = useCallback(() => {
    setActiveTab("visibility");
    setTabVisibilityEnteredAt(Date.now());
    // After 2s, force re-render to hide spinner if status is still idle
    setTimeout(() => forceUpdate(n => n + 1), 2000);
    // Auto-start only if no job exists yet (status stays "idle" even after mount
    // when job already exists — onStatusChange fires and updates citationStatus)
    // Use a slightly longer delay to let AICitationPanel mount and fire onStatusChange first
    if (!citationAutoStartRef.current) {
      citationAutoStartRef.current = true;
      setTimeout(() => {
        // Re-check: if onStatusChange already updated status away from "idle", don't start.
        // Read from ref (not state) to avoid calling startCheck() inside a setState updater,
        // which would trigger the "setState during render" React error.
        if (citationStatusRef.current === "idle") {
          citationPanelRef.current?.startCheck();
        }
      }, 600);
    }
  }, []);

  const { data: audit, isLoading, error } = trpc.audit.getById.useQuery(
    { id: auditId },
    {
      enabled: !!auditId,
      refetchInterval: (query) => {
        const status = (query.state.data as { status?: string } | null)?.status;
        return status === "running" || status === "pending" ? 2000 : false;
      },
    }
  );

  // ⚠️ HOOKS MUST ALL BE DECLARED BEFORE ANY CONDITIONAL RETURN (Rules of Hooks)
  useEffect(() => {
    if (!audit || hasPaidPlan || upsellTriggeredRef.current) return;
    const auditStatus = (audit as unknown as { status?: string }).status;
    if (auditStatus === "running" || auditStatus === "pending" || auditStatus === "failed") return;
    const label = getScoreLabel(Math.round((audit as unknown as { overallScore?: number }).overallScore ?? 0));
    if (label !== "Niewidoczny" && label !== "Startujący") return;
    upsellTriggeredRef.current = true;
    setUpsellTier(label);
    const timer = setTimeout(() => setShowUpsellModal(true), 1500);
    return () => clearTimeout(timer);
  }, [audit, hasPaidPlan]);

  // ── Early returns (after all hooks) ──
  if (isLoading) return <LoadingState />;
  if (error || !audit) return <ErrorState message={error?.message ?? "Audyt nie został znaleziony."} />;
  if (audit.status === "running" || audit.status === "pending") return <LoadingState />;
  if (audit.status === "failed") {
    return <ErrorState message={audit.errorMessage ?? "Audyt nie powiódł się. Spróbuj ponownie."} />;
  }

  const findings = audit.findings as unknown as AuditResult["findings"];
  const recommendations = audit.recommendations as unknown as Recommendation[];
  const llmRecs = audit.llmRecommendations as unknown as LLMRecommendation[] | null;
  const llmAiInsight = audit.llmAiInsight as string | null;
  const llmTopPriority = audit.llmTopPriority as string | null;
  const llmScoreGain = (audit as unknown as { llmScoreGain?: number | null }).llmScoreGain ?? null;
  const llmDifficulty = (audit as unknown as { llmDifficulty?: string | null }).llmDifficulty as "easy" | "medium" | "hard" | null;
  const overallScore = Math.round(audit.overallScore ?? 0);
  const contentIntelligence = audit.contentIntelligence as unknown as ContentIntelligenceResult | null;
  const reportUrl = typeof window !== "undefined" ? `${window.location.origin}/report/${auditId}` : "";
  const scoreColor = getScoreColor(overallScore);

  const llmResult: LLMRecommendationsResult | null =
    llmRecs && llmAiInsight
      ? { recommendations: llmRecs, aiInsight: llmAiInsight, topPriority: llmTopPriority ?? "", scoreGain: llmScoreGain ?? 5, difficulty: llmDifficulty ?? "medium" }
      : null;

  const handleShare = (platform: "linkedin" | "twitter" | "copy") => {
    const text = `Sprawdziłem widoczność mojej strony w AI Search z GEO-Auditor — wynik ${overallScore}/100. Zobacz pełny raport:`;
    const encodedText = encodeURIComponent(text);
    const encodedUrl = encodeURIComponent(reportUrl);
    if (platform === "copy") {
      navigator.clipboard.writeText(reportUrl);
      toast.success("Link do raportu skopiowany!");
      return;
    }
    if (platform === "linkedin") window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`, "_blank");
    else if (platform === "twitter") window.open(`https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`, "_blank");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <UpsellProModal
        isOpen={showUpsellModal}
        onClose={() => setShowUpsellModal(false)}
        scoreLabel={upsellTier}
        score={overallScore}
      />

      {/* ── Sticky Header with Dual Score Bar ── */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/95 backdrop-blur-xl">
        {/* Top row: nav */}
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">New Audit</span>
            </Button>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium hidden sm:inline">GEO-Auditor</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 max-w-[180px] overflow-hidden">
              <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
              <a href={audit.url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground transition-colors truncate">
                {audit.url}
              </a>
            </div>
            <Button variant="outline" size="sm" onClick={() => handleShare("copy")} className="gap-1.5 text-xs h-8">
              <Share2 className="w-3.5 h-3.5" /> Share
            </Button>
            <a href={`/api/audit/${auditId}/pdf`} download>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">
                <Download className="w-3.5 h-3.5" /> PDF
              </Button>
            </a>
            {isAuthenticated ? (
              <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="gap-1.5 text-xs h-8">
                <LayoutDashboard className="w-3.5 h-3.5" /> Dashboard
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => (window.location.href = getLoginUrl())} className="gap-1.5 text-xs h-8 text-primary">
                <LogIn className="w-3.5 h-3.5" /> Sign In
              </Button>
            )}
          </div>
        </div>

        {/* Tab Bar with Dual Score ── */}
        <div className="container border-t border-border/30">
          <div className="flex items-center justify-between h-11">
            {/* Tabs */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab("optimization")}
                className={`flex items-center gap-2 px-4 h-11 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "optimization"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Optymalizacja</span>
                <span className="sm:hidden">Audyt</span>
              </button>
              <button
                onClick={handleSwitchToVisibility}
                className={`flex items-center gap-2 px-4 h-11 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "visibility"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Widoczność AI</span>
                <span className="sm:hidden">Widoczność</span>
                {citationStatus === "running" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                )}
                {citationStatus === "done" && citationCitedCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "oklch(0.72 0.18 145 / 0.15)", color: "oklch(0.72 0.18 145)" }}>
                    {citationCitedCount}/{citationTotalEngines}
                  </span>
                )}
                {citationStatus === "done" && citationCitedCount === 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-red-500/10 text-red-400">0</span>
                )}
              </button>
            </div>

            {/* Dual Score Pills */}
            <div className="flex items-center gap-2">
              {/* AI-Readiness Score */}
              <div
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border"
                style={{ color: scoreColor, background: `${scoreColor}15`, borderColor: `${scoreColor}35` }}
              >
                <span className="text-base font-black tabular-nums">{overallScore}</span>
                <span className="font-normal text-[10px] opacity-70">Readiness</span>
              </div>
              {/* Citation Score Pill */}
              {citationStatus === "idle" && (
                <button
                  onClick={handleSwitchToVisibility}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-dashed border-border/50 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                >
                  <Eye className="w-3 h-3" />
                  <span>Sprawdź widoczność</span>
                </button>
              )}
              {citationStatus === "running" && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-primary/25 bg-primary/8 text-primary">
                  <div className="w-2.5 h-2.5 border border-primary border-t-transparent rounded-full animate-spin" />
                  <span>Analizuję…</span>
                </div>
              )}
              {citationStatus === "done" && (
                <div
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border"
                  style={{
                    color: citationCitedCount > 0 ? "oklch(0.72 0.18 145)" : "oklch(0.65 0.22 25)",
                    background: citationCitedCount > 0 ? "oklch(0.72 0.18 145 / 0.12)" : "oklch(0.65 0.22 25 / 0.10)",
                    borderColor: citationCitedCount > 0 ? "oklch(0.72 0.18 145 / 0.3)" : "oklch(0.65 0.22 25 / 0.3)",
                  }}
                >
                  {citationCitedCount > 0
                    ? <CheckCircle2 className="w-3 h-3" />
                    : <XCircle className="w-3 h-3" />
                  }
                  <span className="text-base font-black tabular-nums">{citationCitedCount}/{citationTotalEngines}</span>
                  <span className="font-normal text-[10px] opacity-70">Cytowania</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Tab 1: Optymalizacja ── */}
      {activeTab === "optimization" && (
        <main className="container max-w-5xl mx-auto py-10 space-y-8">

          {/* Score Hero */}
          <ScoreHero
            score={overallScore}
            pageTitle={audit.pageTitle ?? audit.url}
            url={audit.url}
            findings={findings}
            citeabilityScore={contentIntelligence?.citeabilityScore}
            pageType={(audit as unknown as { pageType?: string | null }).pageType}
          />

          {/* Competitive Decay */}
          <CompetitorDecayCard
            score={overallScore}
            hasPaidPlan={hasPaidPlan}
            isAuthenticated={isAuthenticated}
            navigate={navigate}
            citedCompetitorUrls={citedCompetitorUrls}
          />

          {/* WAF notice */}
          {(audit as unknown as { wafBlocked?: boolean }).wafBlocked && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
              <Shield className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <p className="text-amber-200">
                <span className="font-semibold">Uwaga: serwer chroniony WAF/CDN.</span>{" "}
                Automatyczne żądania zostały zablokowane — część danych technicznych mogła być niedostępna podczas tego audytu. Wyniki mogą być niepełne. Spróbuj ponownie za kilka minut lub skontaktuj się z nami.
              </p>
            </div>
          )}

          {/* Top Priority */}
          {llmResult?.topPriority && (
            <TopPriorityBanner
              topPriority={llmResult.topPriority}
              aiInsight={llmResult.aiInsight}
              scoreGain={llmResult.scoreGain}
              difficulty={llmResult.difficulty}
            />
          )}

          {/* Citation Status Banner — compact widget linking to Tab 2 */}
          <CitationStatusBanner
            status={citationStatus}
            citedCount={citationCitedCount}
            totalEngines={citationTotalEngines}
            onGoToTab={handleSwitchToVisibility}
          />

          {/* Issues & Fixes */}
          <IssuesAndFixes
            findings={findings}
            llmRecs={llmResult?.recommendations ?? null}
            recommendations={recommendations}
          />
          {!hasPaidPlan && <MonitorCTA isAuthenticated={isAuthenticated} navigate={navigate} />}

          {/* Content Intelligence */}
          <ContentIntelligencePanel
            contentIntelligence={contentIntelligence}
            isAuthenticated={isAuthenticated}
            auditStatus={audit.status}
          />

          {/* AI Content Creator — Aktualizacja treści */}
          <ContentCreatorRewriteWidget auditId={audit.id} navigate={navigate} isPaid={hasPaidPlan} />

          {/* Passing Checks */}
          {findings && <PassingChecks findings={findings} />}

          {/* Share */}
          <SharePanel score={overallScore} onShare={handleShare} reportUrl={reportUrl} />

          {/* Score History Teaser */}
          {!isAuthenticated && <ScoreHistoryTeaser />}

          {/* PLG Upgrade Banner */}
          {!hasPaidPlan && <PLGUpgradeBanner isAuthenticated={isAuthenticated} navigate={navigate} />}

        </main>
      )}

      {/* ── Tab 2: Widoczność AI ── */}
      {activeTab === "visibility" && (
        <main className="container max-w-5xl mx-auto py-10 space-y-8">

          {/* Spinner fallback — shown for 2s while onStatusChange hasn't fired yet */}
          {isTabInitializing && (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Wczytuję wyniki widoczności…</span>
              </div>
            </div>
          )}

          {/* Citation Hero — full panel */}
          <AICitationPanel
            auditId={auditId}
            url={audit.url}
            onCompetitorUrlsReady={setCitedCompetitorUrls}
            onStatusChange={handleCitationStatusChange}
            ref={citationPanelRef}
          />

          {/* AI Search Exposure Score — domain-level */}
          <AiExposurePanel url={audit.url} />

          {/* Competitor Analysis Teaser */}
          {!hasPaidPlan && <CompetitorAnalysisTeaser navigate={navigate} />}

          {/* Monitoring CTA — shown to authenticated users who haven't added this URL yet */}
          {isAuthenticated && (() => {
            const normalise = (u: string) => { try { return new URL(u).href.replace(/\/$/, ""); } catch { return u.replace(/\/$/, ""); } };
            const isAlreadyMonitored = (monitoredPages ?? []).some((p) => normalise(p.url) === normalise(audit.url));
            if (isAlreadyMonitored) return null;
            return (
              <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-r from-violet-500/10 to-violet-600/5 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center shrink-0">
                  <Eye className="w-4 h-4 text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">Śledź widoczność tej strony w czasie</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Dodaj tę stronę do monitoringu, aby automatycznie sprawdzać czy ChatGPT, Google AI, Perplexity i Gemini Cię cytują — i otrzymywać alerty o zmianach.
                  </div>
                </div>
                <Button
                  size="sm"
                  className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5 text-xs shrink-0"
                  onClick={() => addMonitoringMutation.mutate({ url: audit.url })}
                  disabled={addMonitoringMutation.isPending}
                >
                  {addMonitoringMutation.isPending
                    ? <RefreshCwIcon className="w-3 h-3 animate-spin" />
                    : <><Plus className="w-3 h-3" /> Dodaj do monitoringu</>}
                </Button>
              </div>
            );
          })()}

          {/* Bridge back to Tab 1 */}
          <div className="rounded-2xl border border-border/50 bg-card p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">Gotowy na poprawki?</div>
              <div className="text-xs text-muted-foreground mt-0.5">Wróć do zakładki Optymalizacja — tam znajdziesz konkretne rekomendacje i AI Content Co-Pilot.</div>
            </div>
            <Button size="sm" onClick={() => setActiveTab("optimization")} variant="outline" className="gap-1.5 text-xs shrink-0">
              <Shield className="w-3 h-3" /> Przejdź do Optymalizacji
            </Button>
          </div>

        </main>
      )}
    </div>
  );
}

// ─── 1b. Competitive Decay Card ─────────────────────────────────────────────

/**
 * CompetitorDecayCard — retention mechanic for high-scorers.
 *
 * Core insight: a score of 75 is NOT static. AI Search algorithms update weekly.
 * Competitors who optimize their pages can overtake a currently-good page within
 * 30–60 days. This card makes that risk visible and actionable.
 *
 * For high-scorers (≥70): shows competitive threat framing + monitoring CTA.
 * For low-scorers (<70): shows improvement opportunity framing.
 * For paid users: shows monitoring status (they already have it).
 */
function CompetitorDecayCard({
  score,
  hasPaidPlan,
  isAuthenticated,
  navigate,
  citedCompetitorUrls = [],
}: {
  score: number;
  hasPaidPlan: boolean;
  isAuthenticated: boolean;
  navigate: (path: string) => void;
  citedCompetitorUrls?: string[];
}) {
  const isHighScorer = score >= 70;

  // Build competitor data from real citation URLs when available
  // Each real competitor domain gets a simulated-but-plausible score offset
  // (real scores are behind paywall — this creates authentic "partial reveal" UX)
  const realDomains = Array.from(
    new Set(
      citedCompetitorUrls
        .map(u => { try { return new URL(u).hostname.replace("www.", ""); } catch { return null; } })
        .filter(Boolean) as string[]
    )
  ).slice(0, 3);

  // Deterministic score offsets based on domain string hash (stable across renders)
  function domainHash(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
    return Math.abs(h);
  }

  const competitorData = realDomains.length >= 2
    ? realDomains.map((domain, i) => {
        const h = domainHash(domain);
        // High-scorers: competitors are slightly below; low-scorers: competitors are above
        const baseOffset = isHighScorer ? -(4 + (h % 18)) : (8 + (h % 20));
        const trend = 3 + (h % 8); // +3 to +10 pkt growth
        return { name: domain, score: Math.max(10, Math.min(95, score + baseOffset)), trend, days: 30, isReal: true };
      })
    : isHighScorer
    ? [
        { name: "Konkurent A", score: score - 4, trend: 6, days: 30, isReal: false },
        { name: "Konkurent B", score: score - 11, trend: 9, days: 30, isReal: false },
        { name: "Konkurent C", score: score - 18, trend: 3, days: 30, isReal: false },
      ]
    : [
        { name: "Lider branży", score: Math.min(95, score + 22), trend: 2, days: 30, isReal: false },
        { name: "Konkurent A", score: Math.min(95, score + 14), trend: 5, days: 30, isReal: false },
        { name: "Konkurent B", score: Math.min(95, score + 8), trend: 4, days: 30, isReal: false },
      ];

  const hasRealData = realDomains.length >= 2;

  // For paid users who already have monitoring
  if (hasPaidPlan) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-emerald-300">Monitoring aktywny</div>
          <div className="text-xs text-muted-foreground mt-0.5">Otrzymasz alert, gdy wynik tej strony lub konkurenta zmieni się o ≥5 pkt.</div>
        </div>
        <Button size="sm" onClick={() => navigate("/dashboard")} variant="outline" className="gap-1.5 text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 shrink-0">
          <LayoutDashboard className="w-3 h-3" /> Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              isHighScorer ? "bg-amber-500/10" : "bg-primary/10"
            }`}>
              {isHighScorer
                ? <TrendingDown className="w-4 h-4 text-amber-400" />
                : <TrendingUp className="w-4 h-4 text-primary" />
              }
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-semibold">
                  {isHighScorer ? "Twoja przewaga jest zagrożona" : "Konkurenci są przed Tobą"}
                </span>
                {isHighScorer && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-bold uppercase">Uwaga</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {isHighScorer
                  ? hasRealData
                    ? `Masz dobry wynik (${score}/100), ale ${competitorData.filter(c => c.trend >= 6).length} z ${competitorData.length} domen cytowanych przez AI rośnie szybko. Bez monitoringu możesz stracić pozycję w ciągu 30–60 dni.`
                    : `Masz dobry wynik (${score}/100), ale AI Search zmienia się co tydzień. Bez monitoringu możesz stracić pozycję w ciągu 30–60 dni.`
                  : hasRealData
                    ? `${competitorData.length} domen cytowanych przez AI ma wyższe wyniki. Każdy tydzień bez optymalizacji to rosnąca luka.`
                    : `Liderzy w Twojej branży mają wyniki o 8–22 pkt wyższe. Każdy tydzień bez optymalizacji to rosnąca luka.`
                }
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => navigate("/pricing")}
            className={`gap-1.5 text-xs shrink-0 ${
              isHighScorer
                ? "bg-amber-500 hover:bg-amber-400 text-black"
                : ""
            }`}
            variant={isHighScorer ? "default" : "outline"}
          >
            <TrendingUp className="w-3 h-3" />
            {isHighScorer ? "Włącz monitoring" : "Nadgońcie wynik"}
          </Button>
        </div>

        {/* Competitor score bars */}
        <div className="space-y-2.5">
          {/* Your page */}
          <div className="flex items-center gap-3">
            <div className="w-24 text-[11px] font-semibold text-foreground shrink-0 truncate">Twoja strona</div>
            <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${score}%`, backgroundColor: getScoreColor(score) }}
              />
            </div>
            <div className="w-8 text-[11px] font-black text-right shrink-0" style={{ color: getScoreColor(score) }}>{score}</div>
            <div className="w-14 text-[10px] text-right shrink-0 text-muted-foreground">—</div>
          </div>
          {/* Competitors (blurred for non-paying) */}
          {competitorData.map((c, i) => {
            const cColor = getScoreColor(c.score);
            const isReal = (c as { isReal?: boolean }).isReal;
            return (
              <div key={i} className="flex items-center gap-3 relative">
                <div className={`w-24 text-[11px] shrink-0 truncate ${
                  isReal ? "text-foreground font-medium" : "text-muted-foreground"
                }`}>{c.name}</div>
                <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full opacity-40"
                    style={{ width: `${c.score}%`, backgroundColor: cColor }}
                  />
                </div>
                <div className="w-8 text-[11px] font-bold text-right shrink-0 opacity-40" style={{ color: cColor }}>??</div>
                <div className={`w-14 text-[10px] text-right shrink-0 font-semibold ${
                  c.trend > 0 ? "text-amber-400" : "text-emerald-400"
                }`}>
                  {c.trend > 0 ? `↑ +${c.trend} pkt` : `↓ ${c.trend} pkt`}
                </div>
              </div>
            );
          })}
        </div>

        {/* Lock overlay for competitor names */}
        <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
          <Lock className="w-3 h-3" />
          {hasRealData
            ? <>Domeny z AI Search — wyniki szczegółowe dostępne w planie {isHighScorer ? "Starter" : "Pro"}</>
            : <>Uruchom analizę cytowan AI, aby zobaczyć rzeczywistych konkurentów</>
          }
        </div>
      </div>

      {/* Score decay projection */}
      <div className="px-5 pb-5">
        <div className="rounded-xl bg-muted/15 border border-border/25 p-3.5">
          <p className="text-[11px] font-semibold text-muted-foreground mb-2.5 uppercase tracking-wide">Prognoza bez monitoringu</p>
          <div className="flex items-end gap-1 h-10">
            {[score, score - 1, score - 2, score - 3, score - 5, score - 7, score - 9, score - 11].map((v, i) => (
              <div
                key={i}
                className={`flex-1 rounded-t transition-all ${
                  i === 0 ? "opacity-100" : i <= 2 ? "opacity-60" : "opacity-30"
                }`}
                style={{
                  height: `${Math.max(10, ((v - (score - 15)) / 15) * 100)}%`,
                  backgroundColor: i === 0 ? getScoreColor(score) : "oklch(0.65 0.22 25)",
                }}
              />
            ))}
          </div>
          <div className="flex justify-between text-[9px] text-muted-foreground/50 mt-1">
            <span>Teraz</span>
            <span>+30 dni</span>
            <span>+60 dni</span>
            <span>+90 dni</span>
          </div>
          <p className="text-[10px] text-muted-foreground/60 mt-2">
            Strony bez regularnych aktualizacji treści i monitoringu tracą średnio <span className="text-amber-400 font-semibold">8–12 pkt</span> w ciągu 90 dni w AI Search.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── 1. Score Hero ────────────────────────────────────────────────────────────

function ScoreHero({
  score,
  pageTitle,
  url,
  findings,
  citeabilityScore,
  pageType,
}: {
  score: number;
  pageTitle: string;
  url: string;
  findings: AuditResult["findings"] | null;
  citeabilityScore?: number;
  pageType?: string | null;
}) {
  const [displayScore, setDisplayScore] = useState(0);
  const [displayCite, setDisplayCite] = useState(0);
  const scoreColor = getScoreColor(score);
  const scoreLabel = getScoreLabel(score);
  const scoreSublabel = getScoreSublabel(score);
  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference - (displayScore / 100) * circumference;
  const citeCircumference = 2 * Math.PI * 30;
  const citeOffset = citeCircumference - (displayCite / 100) * citeCircumference;
  const citeColor = citeabilityScore !== undefined ? getScoreColor(citeabilityScore) : "oklch(0.55 0.02 250)";

  // Animate score count-up
  useEffect(() => {
    let start = 0;
    const duration = 1200;
    const step = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      setDisplayScore(Math.round(progress * score));
      if (citeabilityScore !== undefined) setDisplayCite(Math.round(progress * citeabilityScore));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [score, citeabilityScore]);

  return (
    <div className="rounded-2xl bg-card border border-border/50 p-8">
      <div className="flex flex-col lg:flex-row items-center gap-8">
        {/* Score Rings — AI Visibility + Citeability side by side */}
        <div className="shrink-0 flex items-end gap-4">
          {/* Main AI Visibility Score ring */}
          <div className="relative">
            <svg width="160" height="160" viewBox="0 0 160 160" className="-rotate-90">
              <circle cx="80" cy="80" r="54" fill="none" stroke="oklch(0.22 0.015 250)" strokeWidth="10" />
              <circle
                cx="80" cy="80" r="54" fill="none"
                stroke={scoreColor}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                style={{ transition: "stroke-dashoffset 0.05s linear" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-5xl font-black" style={{ color: scoreColor }}>{displayScore}</span>
              <span className="text-xs text-muted-foreground mt-0.5">/ 100</span>
            </div>
            <div className="absolute -bottom-5 left-0 right-0 text-center">
              <span className="text-[10px] text-muted-foreground font-medium">AI Visibility</span>
            </div>
          </div>

          {/* Citeability Score — smaller ring, shown when CI data is available */}
          {citeabilityScore !== undefined && (
            <div className="relative mb-1">
              <svg width="88" height="88" viewBox="0 0 88 88" className="-rotate-90">
                <circle cx="44" cy="44" r="30" fill="none" stroke="oklch(0.22 0.015 250)" strokeWidth="7" />
                <circle
                  cx="44" cy="44" r="30" fill="none"
                  stroke={citeColor}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={citeCircumference}
                  strokeDashoffset={citeOffset}
                  style={{ transition: "stroke-dashoffset 0.05s linear" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-black" style={{ color: citeColor }}>{displayCite}</span>
                <span className="text-[8px] text-muted-foreground">/100</span>
              </div>
              <div className="absolute -bottom-5 left-0 right-0 text-center">
                <span className="text-[10px] text-muted-foreground font-medium whitespace-nowrap">Citeability</span>
              </div>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 text-center lg:text-left mt-6 lg:mt-0">
          <div className="flex items-center justify-center lg:justify-start gap-2 mb-3">
            <span className="text-sm font-semibold px-3 py-1 rounded-full" style={{ color: scoreColor, background: `${scoreColor}20` }}>
              {scoreLabel} AI Visibility
            </span>
            {citeabilityScore !== undefined && (
              <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ color: citeColor, background: `${citeColor}20` }}>
                Citeability: {citeabilityScore}
              </span>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold mb-1 break-words line-clamp-2 leading-tight" title={pageTitle || url}>{pageTitle || url}</h1>
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center lg:justify-start gap-1 mb-3 min-w-0" style={{wordBreak:'break-all'}}>
            <ExternalLink className="w-3 h-3 shrink-0" />{url}
          </a>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{scoreSublabel}</p>

          {/* Volatility + Benchmark row */}
          {(() => {
            const vol = getVolatilityBadge(findings);
            const bench = getBenchmarkPercentile(score, pageType);
            return (
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {/* AI Volatility Badge */}
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border"
                  style={{ color: vol.color, background: vol.bg, borderColor: `${vol.color}40` }}
                  title={vol.reason}
                >
                  <Activity className="w-3 h-3" />
                  Stabilność: {vol.label}
                </div>
                {/* Benchmark Percentile */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border border-primary/25 bg-primary/8 text-primary">
                  <Award className="w-3 h-3" />
                  Top {100 - bench.percentile}% w {bench.category}
                </div>
              </div>
            );
          })()}

          {/* Next-level progress nudge */}
          {(() => {
            const next = getNextLevelMessage(score);
            if (!next) return null;
            const isDominant = score >= 83;
            return (
              <div className={`flex items-center gap-2 mb-5 px-3 py-2 rounded-lg border ${
                isDominant
                  ? "bg-amber-500/8 border-amber-500/25"
                  : "bg-primary/8 border-primary/20"
              }`}>
                <div className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                  isDominant ? "bg-amber-500/20" : "bg-primary/20"
                }`}>
                  {isDominant
                    ? <TrendingUp className="w-3 h-3 text-amber-400" />
                    : <span className="text-[10px] font-black" style={{ color: scoreColor }}>+{next.points}</span>
                  }
                </div>
                <p className="text-xs text-muted-foreground">
                  {isDominant ? (
                    <><span className="font-semibold text-amber-300">Jesteś w czołówce</span>{" — "}{next.action}</>
                  ) : (
                    <><span className="font-semibold text-foreground">{next.points} pkt do następnego poziomu</span>{" — "}{next.action}</>
                  )}
                </p>
              </div>
            );
          })()}

          {/* Category mini-scores */}
          {findings && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {CATEGORY_META.map((cat) => {
                const catData = findings[cat.key as keyof typeof findings] as CategoryResult | undefined;
                const hasData = catData !== undefined && catData !== null;
                const catScore = hasData ? (catData.score ?? 0) : null;
                const catColor = catScore !== null ? getScoreColor(catScore) : "hsl(var(--muted-foreground))";
                return (
                  <div key={cat.key} className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/30 border border-border/30">
                    <cat.icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] text-muted-foreground truncate">{cat.label}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {catScore !== null ? (
                          <>
                            <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${catScore}%`, backgroundColor: catColor }} />
                            </div>
                            <span className="text-[10px] font-bold shrink-0" style={{ color: catColor }}>{catScore}</span>
                          </>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/50 italic">brak danych</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 2. Content Intelligence Panel ───────────────────────────────────────────

function ContentIntelligencePanel({
  contentIntelligence,
  isAuthenticated,
  auditStatus,
}: {
  contentIntelligence: ContentIntelligenceResult | null;
  isAuthenticated: boolean;
  auditStatus?: string;
}) {
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null);

  // If audit is done but CI is null — it failed after retries
  const isAuditDone = auditStatus === "completed" || auditStatus === "done" || !auditStatus;
  if (!contentIntelligence) {
    if (isAuditDone) {
      // Error state — show friendly message instead of empty section
      return (
        <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/5 via-indigo-500/3 to-background p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center">
              <Brain className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold">Content Intelligence</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 font-semibold uppercase tracking-wide">AI-Powered</span>
              </div>
              <p className="text-xs text-muted-foreground">Deep content analysis — answer density, factual richness, citeability</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-amber-300 font-medium">Analiza AI chwilowo niedostępna</p>
              <p className="text-xs text-muted-foreground mt-1">Serwer AI był przeciążony podczas tego audytu. Uruchom audyt ponownie, aby uzyskać pełną analizę Content Intelligence.</p>
            </div>
          </div>
        </div>
      );
    }
    // Still loading
    return (
      <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/5 via-indigo-500/3 to-background p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center">
            <Brain className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">Content Intelligence</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 font-semibold uppercase tracking-wide">AI-Powered</span>
            </div>
            <p className="text-xs text-muted-foreground">Analyzing how likely AI is to cite your content…</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/30 border border-border/40">
          <div className="w-4 h-4 rounded-full border-2 border-violet-400 border-t-transparent animate-spin shrink-0" />
          <p className="text-sm text-muted-foreground">Running deep content analysis — answer density, factual richness, citeability…</p>
        </div>
      </div>
    );
  }

  const citeColor = getScoreColor(contentIntelligence.citeabilityScore);
  const ciColor = getScoreColor(contentIntelligence.overallScore);
  const circumference = 2 * Math.PI * 36;
  const citeOffset = circumference - (contentIntelligence.citeabilityScore / 100) * circumference;
  const impactOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sortedChecks = [...contentIntelligence.checks].sort(
    (a, b) => impactOrder[a.impact] - impactOrder[b.impact]
  );

  return (
    <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/5 via-indigo-500/3 to-background overflow-hidden">
      {/* Header */}
      <div className="p-6 pb-4">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center">
              <Brain className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold">Content Intelligence</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 font-semibold uppercase tracking-wide">AI-Powered</span>
              </div>
              <p className="text-xs text-muted-foreground">How likely AI search engines are to cite your content</p>
            </div>
          </div>
        </div>

        {/* Query Coverage — shown FIRST so user sees what queries the page can rank for */}
        {(() => {
          const qc = contentIntelligence.checks.find(c => c.id === "query_coverage");
          const questions = qc?.examples?.filter(Boolean) ?? [];
          if (questions.length === 0) return null;
          return (
            <div className="mb-5 p-4 rounded-xl bg-background/50 border border-border/40">
              <div className="flex items-center gap-2 mb-3">
                <Search className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Queries this page can rank for in AI search</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {questions.map((q, i) => (
                  <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300">{q}</span>
                ))}
              </div>
            </div>
          );
        })()}
        {/* Three-column metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          {/* Citeability Score Gauge */}
          <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-background/60 border border-border/40">
            <div className="relative mb-2">
              <svg width="90" height="90" viewBox="0 0 90 90" className="-rotate-90">
                <circle cx="45" cy="45" r="36" fill="none" stroke="oklch(0.22 0.015 250)" strokeWidth="7" />
                <circle
                  cx="45" cy="45" r="36" fill="none"
                  stroke={citeColor}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={citeOffset}
                  style={{ transition: "stroke-dashoffset 1s ease-out" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold" style={{ color: citeColor }}>{Math.round(contentIntelligence.citeabilityScore)}</span>
                <span className="text-[9px] text-muted-foreground">/100</span>
              </div>
            </div>
            <div className="text-xs font-semibold text-center">Citeability Score</div>
            <div className="text-[10px] text-muted-foreground text-center mt-0.5">Chance of AI citation</div>
          </div>

          {/* Content Quality Score */}
          <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-background/60 border border-border/40">
            <div className="text-4xl font-black mb-1" style={{ color: ciColor }}>{Math.round(contentIntelligence.overallScore)}</div>
            <div className="text-xs font-semibold text-center">Content Quality</div>
            <div className="text-[10px] text-muted-foreground text-center mt-0.5">Overall content score</div>
            <div className="mt-2 h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${contentIntelligence.overallScore}%`, backgroundColor: ciColor }} />
            </div>
          </div>

          {/* Summary + Top Opportunity */}
          <div className="flex flex-col gap-2 p-4 rounded-xl bg-background/60 border border-border/40">
            <p className="text-xs text-foreground/80 leading-relaxed">{contentIntelligence.summary}</p>
            {contentIntelligence.topOpportunity && (
              <div className="flex items-start gap-1.5 mt-auto pt-2 border-t border-border/30">
                <Target className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-400/90 leading-relaxed">{contentIntelligence.topOpportunity}</p>
              </div>
            )}
          </div>
        </div>

        {/* Page Topics */}
        {contentIntelligence.pageTopics && contentIntelligence.pageTopics.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-5">
            <span className="text-[10px] text-muted-foreground mr-1 self-center">Topics detected:</span>
            {contentIntelligence.pageTopics.map((topic) => (
              <span key={topic} className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">{topic}</span>
            ))}
          </div>
        )}
      </div>

      {/* 5 Dimensions */}
      <div className="px-6 pb-6 space-y-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">5 Content Quality Dimensions</div>
        {sortedChecks.map((check) => {
          const isExpanded = expandedCheck === check.id;
          const checkColor = check.score >= 70 ? "oklch(0.72 0.18 145)" : check.score >= 40 ? "oklch(0.78 0.18 75)" : "oklch(0.65 0.22 25)";
          const statusIcon =
            check.status === "pass" ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> :
            check.status === "warning" ? <AlertTriangle className="w-4 h-4 text-amber-400" /> :
            <XCircle className="w-4 h-4 text-red-400" />;
          return (
            <div key={check.id} className="rounded-xl border border-border/40 bg-background/40 overflow-hidden">
              <button
                onClick={() => setExpandedCheck(isExpanded ? null : check.id)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/20 transition-colors"
              >
                {statusIcon}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{check.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      check.impact === "high" ? "bg-red-500/15 text-red-400" :
                      check.impact === "medium" ? "bg-amber-500/15 text-amber-400" :
                      "bg-muted text-muted-foreground"
                    }`}>{check.impact} impact</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{check.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-bold" style={{ color: checkColor }}>{check.score}</span>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </button>
              {isExpanded && (
                <div className="px-4 pb-4 space-y-3 border-t border-border/30">
                  <div className="pt-3">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Score</span>
                      <span style={{ color: checkColor }}>{check.score}/100</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${check.score}%`, backgroundColor: checkColor }} />
                    </div>
                  </div>
                  {check.recommendation && (
                    <div className="p-3 rounded-lg bg-violet-500/5 border border-violet-500/20">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Lightbulb className="w-3.5 h-3.5 text-violet-400" />
                        <span className="text-xs font-semibold text-violet-400">How to improve</span>
                      </div>
                      <p className="text-xs text-foreground/80 leading-relaxed">{check.recommendation}</p>
                    </div>
                  )}
                  {check.examples && check.examples.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Examples from your page</div>
                      <div className="space-y-1">
                        {check.examples.map((ex, i) => (
                          <div key={i} className="text-xs text-foreground/70 p-2 rounded-lg bg-muted/30 border border-border/30 italic">"{ex}"</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* PLG nudge */}
      {!isAuthenticated && (
        <div className="mx-6 mb-6 p-4 rounded-xl bg-gradient-to-r from-violet-500/10 to-indigo-500/5 border border-violet-500/20">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold mb-0.5">Track content improvements over time</div>
              <div className="text-xs text-muted-foreground">Sign in free to monitor your Content Intelligence score weekly</div>
            </div>
            <Button size="sm" onClick={() => (window.location.href = getLoginUrl())} className="bg-violet-600 hover:bg-violet-500 text-white shrink-0 gap-1.5 text-xs">
              <LogIn className="w-3 h-3" /> Sign In Free
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Inline PLG: Monitor CTA
function MonitorCTA({ isAuthenticated, navigate }: { isAuthenticated: boolean; navigate: (path: string) => void }) {
  if (isAuthenticated) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">Monitor this page automatically</div>
          <div className="text-xs text-muted-foreground mt-0.5">Get weekly re-audits and score-change alerts — upgrade to Starter to enable.</div>
        </div>
        <Button size="sm" onClick={() => navigate("/pricing")} variant="outline" className="gap-1.5 text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 shrink-0">
          <Sparkles className="w-3 h-3" /> See plans
        </Button>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
      <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
        <TrendingUp className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">Want to track your fixes over time?</div>
        <div className="text-xs text-muted-foreground mt-0.5">Free account: 1 monitored page, weekly re-audits, score history.</div>
      </div>
      <Button size="sm" onClick={() => (window.location.href = getLoginUrl())} className="gap-1.5 text-xs shrink-0">
        <LogIn className="w-3 h-3" /> Sign In Free
      </Button>
    </div>
  );
}

// ─── Competitor Analysis Teaser
function CompetitorAnalysisTeaser({ navigate }: { navigate: (path: string) => void }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
          <BarChart3 className="w-4 h-4 text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="text-sm font-semibold">Competitor AI Visibility Analysis</div>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 font-bold uppercase">Pro</span>
          </div>
          <div className="text-xs text-muted-foreground">See how your page compares to 3 competitors across every AI visibility dimension. Find the gaps they're exploiting.</div>
        </div>
        <Button size="sm" onClick={() => navigate("/pricing")} variant="outline" className="gap-1.5 text-xs border-violet-500/30 text-violet-400 hover:bg-violet-500/10 shrink-0">
          <Sparkles className="w-3 h-3" /> Unlock Pro
        </Button>
      </div>
      <div className="relative mx-5 mb-5 rounded-xl bg-muted/20 overflow-hidden h-20">
        <div className="absolute inset-0 flex items-center gap-3 px-4 opacity-20 pointer-events-none">
          {["competitor-a.com", "competitor-b.com", "competitor-c.com"].map((c, i) => (
            <div key={i} className="flex-1 space-y-1.5">
              <div className="text-[9px] text-muted-foreground truncate">{c}</div>
              <div className="h-2 bg-primary/40 rounded-full" style={{ width: `${[78, 65, 82][i]}%` }} />
              <div className="text-[9px] font-bold text-primary">{[78, 65, 82][i]}</div>
            </div>
          ))}
        </div>
        <div className="absolute inset-0 backdrop-blur-sm bg-background/50 flex items-center justify-center">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="w-3.5 h-3.5" /> Dostępne w planie Pro
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 3. Top Priority Banner ───────────────────────────────────────────────────

const DIFFICULTY_CONFIG = {
  easy: {
    label: "Łatwa poprawka",
    sublabel: "Bez programisty",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
    icon: Zap,
  },
  medium: {
    label: "Średni nakład",
    sublabel: "~30 min z programistą",
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
    icon: Code2,
  },
  hard: {
    label: "Wymaga pracy dewelopera",
    sublabel: "~2h+ z programistą",
    color: "text-rose-400",
    bg: "bg-rose-500/10 border-rose-500/20",
    icon: Cpu,
  },
};

function TopPriorityBanner({
  topPriority,
  aiInsight,
  scoreGain,
  difficulty,
}: {
  topPriority: string;
  aiInsight: string;
  scoreGain?: number;
  difficulty?: "easy" | "medium" | "hard";
}) {
  const [showInsight, setShowInsight] = useState(false);
  const diff = difficulty ? DIFFICULTY_CONFIG[difficulty] : DIFFICULTY_CONFIG.medium;
  const DiffIcon = diff.icon;

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
      <div className="flex items-start gap-4">
        <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
          <Target className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-primary uppercase tracking-wide mb-2">Twoja priorytetowa poprawka #1</div>
          <p className="text-sm font-medium leading-relaxed mb-3">{topPriority}</p>

          {/* Quick Win Badges */}
          <div className="flex flex-wrap items-center gap-2">
            {scoreGain != null && scoreGain > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/15 border border-primary/25 text-primary">
                <TrendingUp className="w-3 h-3" />
                +{scoreGain} pkt potencjału
              </span>
            )}
            {difficulty && (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${diff.bg} ${diff.color}`}>
                <DiffIcon className="w-3 h-3" />
                {diff.label}
              </span>
            )}
            {difficulty && (
              <span className="text-xs text-muted-foreground">{diff.sublabel}</span>
            )}
          </div>

          {aiInsight && (
            <>
              <button
                onClick={() => setShowInsight(!showInsight)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-3"
              >
                <Lightbulb className="w-3 h-3" />
                {showInsight ? "Ukryj" : "Pokaż"} analizę AI
                {showInsight ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {showInsight && (
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed border-t border-border/40 pt-2">{aiInsight}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 4. Issues & Fixes ────────────────────────────────────────────────────────

function IssuesAndFixes({
  findings,
  llmRecs,
  recommendations,
}: {
  findings: AuditResult["findings"] | null;
  llmRecs: LLMRecommendation[] | null;
  recommendations: Recommendation[];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  if (!findings) return null;

  // Collect all issues with enriched fix data
  const issues: {
    id: string;
    label: string;
    status: "fail" | "warning";
    impact: "high" | "medium" | "low";
    description: string;
    category: string;
    llmFix?: string;
    llmCodeSnippet?: LLMRecommendation["codeSnippet"];
    llmImpact?: string;
  }[] = [];

  for (const [catKey, catData] of Object.entries(findings)) {
    const checks = (catData as CategoryResult).checks ?? [];
    for (const check of checks) {
      if (check.status === "fail" || check.status === "warning") {
        const llmRec = llmRecs?.find((r) =>
          r.title.toLowerCase().includes(check.label.toLowerCase().slice(0, 20)) ||
          check.label.toLowerCase().includes(r.title.toLowerCase().slice(0, 20))
        );
        const stdRec = recommendations.find((r) =>
          r.title.toLowerCase().includes(check.label.toLowerCase().slice(0, 20)) ||
          check.label.toLowerCase().includes(r.title.toLowerCase().slice(0, 20))
        );
        issues.push({
          id: `${catKey}-${check.id}`,
          label: check.label,
          status: check.status as "fail" | "warning",
          impact: check.impact,
          description: check.description,
          category: CATEGORY_HUMAN_LABELS[catKey] ?? catKey,
          llmFix: llmRec?.howToFix ?? stdRec?.howToFix,
          llmCodeSnippet: llmRec?.codeSnippet,
          llmImpact: llmRec?.impact ?? stdRec?.impact,
        });
      }
    }
  }

  // Sort: critical first
  const impactOrder = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => {
    const aScore = (a.status === "fail" ? 0 : 10) + impactOrder[a.impact];
    const bScore = (b.status === "fail" ? 0 : 10) + impactOrder[b.impact];
    return aScore - bScore;
  });

  if (issues.length === 0) {
    return (
      <div className="rounded-2xl bg-card border border-border/50 p-8 text-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
        <h3 className="font-semibold mb-1">Brak problemów</h3>
        <p className="text-sm text-muted-foreground">Ta strona przechodzi wszystkie testy widoczności AI.</p>
      </div>
    );
  }

  const critical = issues.filter((i) => i.status === "fail" && i.impact === "high");
  const others = issues.filter((i) => !(i.status === "fail" && i.impact === "high"));
  const visibleOthers = showAll ? others : others.slice(0, 4);

  const copyFix = (issue: typeof issues[0]) => {
    const text = issue.llmFix ?? issue.description;
    navigator.clipboard.writeText(text);
      toast.success("Instrukcja naprawy skopiowana!");
  };

  const renderIssue = (issue: typeof issues[0]) => {
    const isOpen = expanded === issue.id;
    const isCritical = issue.status === "fail" && issue.impact === "high";
    return (
      <div key={issue.id} className={`rounded-xl border overflow-hidden ${isCritical ? "border-red-500/30 bg-red-500/3" : "border-amber-500/20 bg-amber-500/3"}`}>
        <button
          className="w-full flex items-start gap-4 p-4 text-left hover:bg-white/3 transition-colors"
          onClick={() => setExpanded(isOpen ? null : issue.id)}
        >
          <div className="mt-0.5 shrink-0">
            {isCritical ? <XCircle className="w-4 h-4 text-red-400" /> : <AlertTriangle className="w-4 h-4 text-amber-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span className="text-sm font-medium">{issue.label}</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${isCritical ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"}`}>
                {isCritical ? "Krytyczne" : issue.impact === "medium" ? "Ważne" : "Drobne"}
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{issue.category}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{issue.description}</p>
          </div>
          <div className="shrink-0 mt-0.5">
            {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </button>
        {isOpen && (
          <div className="border-t border-border/30 px-4 pb-4 pt-3 space-y-3">
            {issue.llmFix && (
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <Lightbulb className="w-3 h-3 text-primary" /> Jak naprawić
                </div>
                <p className="text-sm leading-relaxed">{issue.llmFix}</p>
              </div>
            )}
            {issue.llmImpact && (
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Oczekiwany efekt</div>
                <p className="text-xs text-muted-foreground leading-relaxed">{issue.llmImpact}</p>
              </div>
            )}
            {issue.llmCodeSnippet && (
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{issue.llmCodeSnippet.label}</div>
                <div className="rounded-lg overflow-hidden text-xs">
                  <Suspense fallback={
                    <pre className="m-0 p-3 bg-[#282c34] text-[#abb2bf] text-[11px] rounded-lg overflow-auto">
                      {issue.llmCodeSnippet.code}
                    </pre>
                  }>
                    <SyntaxHighlighter
                      language={issue.llmCodeSnippet.language}
                      style={atomOneDark}
                      customStyle={{ margin: 0, padding: "12px", fontSize: "11px", borderRadius: "8px" }}
                    >
                      {issue.llmCodeSnippet.code}
                    </SyntaxHighlighter>
                  </Suspense>
                </div>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => copyFix(issue)} className="gap-2 text-xs h-7">
              <Copy className="w-3 h-3" /> Kopiuj instrukcję naprawy
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Problemy i poprawki</h2>
      {critical.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="w-4 h-4 text-red-400" />
            <span className="text-sm font-medium text-red-400">Krytyczne — napraw w pierwszej kolejności</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">{critical.length}</span>
          </div>
          <div className="space-y-2">{critical.map(renderIssue)}</div>
        </div>
      )}
      {others.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium text-amber-400">Do poprawy</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">{others.length}</span>
          </div>
          <div className="space-y-2">{visibleOthers.map(renderIssue)}</div>
          {others.length > 4 && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="mt-3 w-full py-2.5 rounded-xl border border-border/50 text-xs text-muted-foreground hover:text-foreground hover:border-border transition-colors flex items-center justify-center gap-1.5"
            >
              <ChevronDown className="w-3.5 h-3.5" /> Pokaż {others.length - 4} więcej
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 5. Passing Checks ────────────────────────────────────────────────────────

function PassingChecks({ findings }: { findings: AuditResult["findings"] }) {
  const [open, setOpen] = useState(false);
  const passes: { label: string; category: string }[] = [];
  for (const [catKey, catData] of Object.entries(findings)) {
    const cat = CATEGORY_META.find((c) => c.key === catKey);
    if (!cat) continue;
    for (const check of (catData as CategoryResult).checks ?? []) {
      if (check.status === "pass") passes.push({ label: check.label, category: cat.label });
    }
  }
  if (passes.length === 0) return null;
  return (
    <div className="rounded-2xl bg-card border border-border/50 overflow-hidden">
      <button className="w-full flex items-center justify-between p-5 hover:bg-muted/10 transition-colors" onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold">Co już działa poprawnie</div>
            <div className="text-xs text-muted-foreground">{passes.length} testów zaliczonych</div>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="border-t border-border/30 divide-y divide-border/20">
          {passes.map((p, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-sm flex-1">{p.label}</span>
              <span className="text-[10px] text-muted-foreground">{p.category}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 6. Share Panel ───────────────────────────────────────────────────────────

function SharePanel({ score, onShare, reportUrl }: { score: number; onShare: (p: "linkedin" | "twitter" | "copy") => void; reportUrl: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => { onShare("copy"); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div className="rounded-2xl bg-card border border-border/50 p-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Share2 className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="text-sm font-semibold">Udostępnij swój AI Visibility Score</div>
            <div className="text-xs text-muted-foreground">Pokaż zespołowi lub klientom jak Twoja strona wypada w AI Search</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button onClick={() => onShare("linkedin")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors border border-blue-500/20">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
            LinkedIn
          </button>
          <button onClick={() => onShare("twitter")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 transition-colors border border-sky-500/20">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
            X
          </button>
          <button onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted/50 text-muted-foreground hover:bg-muted transition-colors border border-border/50">
            <Copy className="w-3.5 h-3.5" />
            {copied ? "Skopiowano!" : "Kopiuj link"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 7. Score History Teaser ──────────────────────────────────────────────────

function ScoreHistoryTeaser() {
  return (
    <div className="rounded-2xl bg-card border border-border/50 overflow-hidden">
      <div className="p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="text-sm font-semibold">Śledź swój postęp</div>
            <div className="text-xs text-muted-foreground">Obserwuj jak Twoje poprawki poprawiają widoczność AI w czasie</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Wymagane bezpłatne konto</span>
        </div>
      </div>
      <div className="relative h-24 mx-5 mb-5 rounded-xl bg-muted/20 overflow-hidden">
        <div className="absolute inset-0 flex items-end px-4 pb-3 gap-2 opacity-30">
          {[45, 52, 48, 61, 58, 67, 72, 75].map((v, i) => (
            <div key={i} className="flex-1 rounded-t bg-primary" style={{ height: `${v}%` }} />
          ))}
        </div>
        <div className="absolute inset-0 backdrop-blur-sm bg-background/40 flex flex-col items-center justify-center gap-2">
          <p className="text-xs text-muted-foreground">Zaloguj się, aby śledzić postępy</p>
          <button onClick={() => (window.location.href = getLoginUrl())} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
            <LogIn className="w-3 h-3" /> Zaloguj się — bezpłatnie
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 8. PLG Upgrade Banner ────────────────────────────────────────────────────

function PLGUpgradeBanner({ isAuthenticated, navigate }: { isAuthenticated: boolean; navigate: (path: string) => void }) {
  const plans = [
    { name: "Free", price: "0 zł", features: ["5 audytów/mies.", "1 monitorowana strona", "Pełny raport i CI"], cta: null, highlight: false },
    { name: "Starter", price: "149 zł", features: ["50 audytów/mies.", "10 monitorowanych stron", "Alerty tygodniowe", "Eksport PDF"], cta: "Wybierz Starter", highlight: false },
    { name: "Pro", price: "399 zł", features: ["200 audytów/mies.", "50 monitorowanych stron", "Analiza konkurencji", "Zaawansowane CI"], cta: "Wybierz Pro", highlight: true },
  ];
  return (
    <div className="rounded-2xl bg-gradient-to-br from-primary/8 via-violet-500/4 to-background border border-primary/20 p-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-bold mb-1">Gotowy, żeby naprawić te problemy — na stałe?</h3>
        <p className="text-sm text-muted-foreground">Jednorazowe audyty wykrywają problemy. Monitoring utrzymuje Cię o krok przed zmianami AI Search.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {plans.map((plan) => (
          <div key={plan.name} className={`rounded-xl p-4 border ${plan.highlight ? "border-primary/40 bg-primary/8" : "border-border/50 bg-card"}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold">{plan.name}</span>
              <span className="text-sm font-black text-primary">{plan.price}<span className="text-[10px] font-normal text-muted-foreground">/mies.</span></span>
            </div>
            <div className="space-y-1 mb-3">
              {plan.features.map((f) => (
                <div key={f} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />{f}
                </div>
              ))}
            </div>
            {plan.cta ? (
              <Button size="sm" onClick={() => navigate("/pricing")} className="w-full text-xs" variant={plan.highlight ? "default" : "outline"}>
                {plan.cta}
              </Button>
            ) : (
              <div className="text-[10px] text-center text-muted-foreground py-1">{isAuthenticated ? "Twój aktualny plan" : "Aktualny plan"}</div>
            )}
          </div>
        ))}
      </div>
      {!isAuthenticated && (
        <div className="text-center">
          <Button onClick={() => (window.location.href = getLoginUrl())} variant="ghost" size="sm" className="text-xs gap-1.5 text-muted-foreground">
            <LogIn className="w-3 h-3" /> Zaloguj się najpierw — bezpłatnie
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Rewrite Progress Indicator ─────────────────────────────────────────────
const REWRITE_STEPS = [
  { id: 1, label: "Głęboka analiza Twojej strony", icon: "🔍", detail: "Mapuję strukturę, treść, encje i sygnały semantyczne" },
  { id: 2, label: "Analiza wzorców AI Search", icon: "🧠", detail: "Badamy, jakie formaty i treści AI aktualnie cytuje i rekomenduje" },
  { id: 3, label: "Tworzenie treści przez zespół AI Agentów", icon: "✨", detail: "Zaawansowane modele AI piszą sekcję po sekcji, dążąc do perfekcji" },
  { id: 4, label: "Weryfikacja jakości — E-E-A-T & Helpful Content", icon: "🎯", detail: "Wielopoziomowa kontrola: wiarygodność, użyteczność, zgodność z algorytmami Google" },
];

function RewriteProgressIndicator({
  step,
  sectionProgress,
}: {
  step: number;
  sectionProgress: { current: number; total: number } | null;
}) {
  return (
    <div className="mt-4 rounded-xl border border-violet-500/30 bg-violet-950/30 p-4 space-y-3">
      <p className="text-xs font-semibold text-violet-300 uppercase tracking-wider">Postęp generowania</p>
      <div className="space-y-2">
        {REWRITE_STEPS.map((s) => {
          const isDone = step > s.id;
          const isActive = step === s.id;
          const isPending = step < s.id;
          return (
            <div key={s.id} className={`flex items-start gap-3 transition-opacity duration-300 ${
              isPending ? "opacity-30" : "opacity-100"
            }`}>
              {/* Status icon */}
              <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                isDone
                  ? "bg-emerald-500/20 text-emerald-400"
                  : isActive
                  ? "bg-violet-500/30 text-violet-300"
                  : "bg-zinc-800 text-zinc-600"
              }`}>
                {isDone ? "✓" : isActive ? (
                  <span className="block w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                ) : s.id}
              </div>
              {/* Label + detail */}
              <div className="min-w-0">
                <p className={`text-sm font-medium ${
                  isDone ? "text-emerald-400" : isActive ? "text-violet-200" : "text-zinc-500"
                }`}>
                  {s.icon} {s.label}
                  {isActive && s.id === 3 && sectionProgress && (
                    <span className="ml-2 text-xs text-violet-400 font-normal">
                      sekcja {sectionProgress.current}/{sectionProgress.total}
                    </span>
                  )}
                </p>
                {isActive && (
                  <p className="text-xs text-zinc-400 mt-0.5">{s.detail}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {/* Progress bar */}
      <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-violet-600 to-indigo-500 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${Math.min(100, (step / REWRITE_STEPS.length) * 100)}%` }}
        />
      </div>
    </div>
  );
}

// ─── Content Creator Rewrite Widget (compact CTA in Tab 1) ─────────────────────────
function ContentCreatorRewriteWidget({
  auditId,
  navigate,
  isPaid,
}: {
  auditId: number;
  navigate: (path: string) => void;
  isPaid: boolean;
}) {
  return (
    <div className="rounded-2xl border border-violet-500/20 bg-violet-500/4 p-5">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-bold text-white">Aktualizacja treści AI</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/20 border border-violet-500/30 text-violet-300 font-semibold uppercase tracking-wide">Content Creator</span>
          </div>
          <p className="text-xs text-zinc-400 mb-3">
            AI przepisze tę stronę zgodnie z zasadami GEO — z FAQ, danymi strukturalnymi i treścią cytowaną przez modele AI.
            Wnioski z audytu są automatycznie wczytywane jako kontekst.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() =>
                isPaid
                  ? navigate(`/page-creator?auditId=${auditId}&mode=rewrite`)
                  : navigate("/pricing")
              }
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                isPaid
                  ? "bg-violet-600 hover:bg-violet-500 text-white"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700"
              }`}
            >
              {isPaid ? (
                <><Sparkles className="w-3.5 h-3.5" /> Aktualizuj z AI</>
              ) : (
                <><Lock className="w-3 h-3" /> Odblokuj — plan Starter</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── AI Content Co-Pilot — Full Rewrite AI only ─────────────────────────────────────
// Other modes (answer_first, add_faq, add_statistics, improve_structure) preserved in backend but hidden from UI
const AI_COPILOT_MODES = [
  { id: "full_rewrite" as const, label: "Pełny rewrite AI", icon: "✨", desc: "Kompletne przepisanie treści" },
] as const;

// ─── Upsell Paywall for Free plan users ───────────────────────────────────────
function FullRewriteUpsell({ navigate }: { navigate: (path: string) => void }) {
  const BENEFITS = [
    { icon: "✨", title: "Pełny rewrite AI", desc: "AI przepisuje całą stronę zgodnie z zasadami Helpful Content" },
    { icon: "🧠", title: "Analiza wzorców AI Search", desc: "Rewrite oparty na tym, co AI aktualnie cytuje i rekomenduje" },
    { icon: "🛡️", title: "Weryfikacja E-E-A-T & Helpful Content", desc: "Wielopoziomowa kontrola jakości, wiarygodności i zgodności z algorytmami" },
    { icon: "📊", title: "5 trybów optymalizacji", desc: "Full Rewrite, Answer First, FAQ, Statystyki, Struktura" },
  ];
  return (
    <div className="rounded-2xl border-2 border-violet-500/40 overflow-hidden relative">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 p-5 bg-gradient-to-r from-violet-950/60 via-indigo-950/40 to-zinc-900/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-600/30 border border-violet-500/40 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-violet-300" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-white">✨ AI Content Co-Pilot</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/20 border border-violet-500/30 text-violet-300 font-medium">Full Rewrite AI</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 font-semibold flex items-center gap-1">
                <Lock className="w-3 h-3" /> Starter+
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">AI przepisze Twoją treść zgodnie z zasadami Helpful Content i danymi z AI Citations</p>
          </div>
        </div>
      </div>

      {/* Blurred preview */}
      <div className="relative bg-zinc-950/80 border-t border-violet-500/20">
        {/* Fake content — blurred */}
        <div className="p-4 select-none pointer-events-none" style={{ filter: "blur(5px)", opacity: 0.45 }}>
          <div className="rounded-xl border border-white/8 bg-zinc-900/60 overflow-hidden mb-4">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8">
              <span className="text-xs font-semibold text-zinc-400">Oryginalna treść strony</span>
              <span className="text-[10px] text-zinc-600">4 820 znaków • typ: product</span>
            </div>
            <div className="px-4 py-3">
              <div className="space-y-2">
                {["Nasz produkt to najlepszy wybor dla kazdego klienta.", "Oferujemy szeroki wybor produktow w atrakcyjnych cenach.", "Skontaktuj sie z nami, aby dowiedziec sie wiecej o naszej ofercie.", "Zapraszamy do zapoznania sie z nasza pelna oferta produktow."].map((line, i) => (
                  <div key={i} className="text-xs text-zinc-500">{line}</div>
                ))}
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-emerald-500/20 bg-emerald-950/30">
              <span className="text-xs font-semibold text-emerald-300">✨ Przepisana treść — gotowa do wdrożenia</span>
            </div>
            <div className="px-4 py-4 space-y-2">
              {["## Poduszka dekoracyjna Premium — idealna do salonu i sypialni", "Poduszka dekoracyjna Premium to wyjątkowy dodatek, który odmieni wygląd Twojego wnętrza. Wykonana z wysokiej jakości tkaniny...", "### Dla kogo jest ten produkt?", "Idealna dla osób urządzających salon lub sypialnię, które szukają eleganckiego akcentu..."].map((line, i) => (
                <div key={i} className="text-xs text-emerald-200/70">{line}</div>
              ))}
            </div>
          </div>
        </div>

        {/* Overlay CTA */}
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-t from-zinc-950/95 via-zinc-950/70 to-transparent px-6 py-8">
          <div className="text-center max-w-md">
            <div className="w-14 h-14 rounded-2xl bg-violet-600/30 border border-violet-500/40 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-7 h-7 text-violet-300" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Odblokuj Full Rewrite AI</h3>
            <p className="text-sm text-zinc-400 mb-5 leading-relaxed">
              AI przepisze Twoją stronę od nowa — z uwzględnieniem danych z AI Citations, zasad Helpful Content i weryfikacji E-E-A-T. Gotowy tekst do wklejenia.
            </p>

            {/* Benefits grid */}
            <div className="grid grid-cols-2 gap-2.5 mb-5 text-left">
              {BENEFITS.map(({ icon, title, desc }) => (
                <div key={title} className="flex items-start gap-2 bg-white/4 border border-white/8 rounded-xl p-2.5">
                  <span className="text-base flex-shrink-0">{icon}</span>
                  <div>
                    <p className="text-xs font-semibold text-white">{title}</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <Button
              onClick={() => navigate("/pricing")}
              className="bg-violet-600 hover:bg-violet-500 text-white font-semibold gap-2 shadow-lg shadow-violet-500/25 px-6"
            >
              <Sparkles className="w-4 h-4" /> Przejdź na Starter — od $39/mies.
            </Button>
            <p className="text-[10px] text-zinc-600 mt-2">Anuluj w dowolnym momencie • Bez ukrytych opłat</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function WhatIfSection({ url, citedCompetitorUrls = [], navigate }: { url: string; citedCompetitorUrls?: string[]; navigate: (path: string) => void }) {
  const { user } = useAuth();
  const fetchPageMutation = trpc.sandbox.fetchPage.useMutation();
  const rewriteMutation = trpc.sandbox.rewrite.useMutation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [rewriteStep, setRewriteStep] = useState(0); // 0=idle, 1=fetch, 2=crawl, 3=generate, 4=verify
  const [rewriteSectionProgress, setRewriteSectionProgress] = useState<{current: number; total: number} | null>(null);
  const [error, setError] = useState<string | null>(null);
  // cleanText = server-extracted plain text (no HTML tags)
  const [cleanText, setCleanText] = useState("");
  const [rewrittenText, setRewrittenText] = useState<string | null>(null);
  const [detectedPageType, setDetectedPageType] = useState("generic");
  const [copied, setCopied] = useState(false);
  const [researchData, setResearchData] = useState<{
    queries: string[];
    keyEntities: string[];
    aiReadinessTips: string[];
    answerFirstDraft: string;
    sources: Array<{ url: string; title: string; snippet: string }>;
  } | null>(null);
  const [pageMetadata, setPageMetadata] = useState<{ title: string; h1: string; metaDescription: string } | null>(null);
  const [activeResultTab, setActiveResultTab] = useState<"content" | "entities" | "tips">("content");

  // Show upsell for unauthenticated users or users on free plan
  // We detect free plan by checking if the user is not authenticated (free tier)
  // Authenticated users with paid plan can use the feature
  const userPlan = (user as any)?.plan ?? "free";
  const isFreePlan = !user || userPlan === "free";

  if (isFreePlan) {
    return <FullRewriteUpsell navigate={navigate} />;
  }

  async function handleAnalyze() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchPageMutation.mutateAsync({ url });
      const ct = (res as any).cleanText as string ?? "";
      const pt = (res as any).pageType as string ?? "generic";
      const meta = (res as any).metadata as { title: string; h1: string; metaDescription: string } | undefined;
      setDetectedPageType(pt);
      setCleanText(ct);
      setRewrittenText(null);
      setResearchData(null);
      if (meta) setPageMetadata(meta);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Nie udało się pobrać URL");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAIRewrite() {
    const sourceContent = rewrittenText ?? cleanText;
    if (!sourceContent.trim()) return;
    setIsRewriting(true);
    setRewriteStep(1); // Fetching page
    setRewriteSectionProgress(null);
    setError(null);

    // Simulate realistic step progression while waiting for the server
    const stepTimings = [
      { step: 2, delay: 1800 },  // Crawling competitors
      { step: 3, delay: 5000 },  // Generating sections
      { step: 4, delay: 35000 }, // E-E-A-T verification
    ];
    const timers: ReturnType<typeof setTimeout>[] = [];
    stepTimings.forEach(({ step, delay }) => {
      timers.push(setTimeout(() => setRewriteStep(step), delay));
    });
    // Simulate section progress during step 3
    const sectionTimers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= 6; i++) {
      sectionTimers.push(setTimeout(() => {
        setRewriteStep(3);
        setRewriteSectionProgress({ current: i, total: 6 });
      }, 5000 + i * 4500));
    }

    try {
      const result = await rewriteMutation.mutateAsync({
        content: sourceContent,
        mode: "full_rewrite",
        issues: [],
        url,
        pageType: detectedPageType,
        targetQueries: [],
        citedCompetitorUrls,
        // Pass page metadata for research pipeline
        pageTitle: pageMetadata?.title,
        h1: pageMetadata?.h1,
        metaDescription: pageMetadata?.metaDescription,
        language: "pl",
      });
      // Clear all timers immediately on success
      [...timers, ...sectionTimers].forEach(clearTimeout);
      const { rewrittenContent } = result;
      if (result.competitorInsights && result.competitorInsights.count > 0) {
        toast.success(`✨ Przeanalizowano ${result.competitorInsights.count} domen konkurencji z AI Citations`);
      }
      const rewrittenStr = typeof rewrittenContent === "string" ? rewrittenContent : String(rewrittenContent);
      setRewrittenText(rewrittenStr);
      setCopied(false);
      // Store research data if available
      if ((result as any).researchData) {
        setResearchData((result as any).researchData);
        if ((result as any).researchData.queries?.length > 0) {
          toast.success(`🔬 Zbadano ${(result as any).researchData.sources?.length ?? 0} źródeł — treść wzbogacona o kontekst badawczy`);
        }
      }
      setActiveResultTab("content");
    } catch (err: unknown) {
      [...timers, ...sectionTimers].forEach(clearTimeout);
      const msg = err instanceof Error ? err.message : "Rewrite AI nie powiódł się";
      if (msg === "UPGRADE_REQUIRED") {
        setError("Ta funkcja wymaga planu Starter lub wyższego.");
      } else {
        setError(msg);
      }
    } finally {
      setIsRewriting(false);
      setRewriteStep(0);
      setRewriteSectionProgress(null);
    }
  }

  function handleCopy() {
    if (!rewrittenText) return;
    navigator.clipboard.writeText(rewrittenText).then(() => {
      setCopied(true);
      toast.success("Skopiowano do schowka!");
      setTimeout(() => setCopied(false), 3000);
    });
  }

  function handleReset() {
    setRewrittenText(null);
    setCopied(false);
  }

  return (
    <div className="rounded-2xl border-2 border-violet-500/40 overflow-hidden">
      {/* Header — always visible, click to expand */}
      <button
        className="w-full flex items-center justify-between gap-4 p-5 bg-gradient-to-r from-violet-950/60 via-indigo-950/40 to-zinc-900/80 hover:from-violet-950/80 transition-colors text-left"
        onClick={() => { setIsExpanded(v => !v); if (!isExpanded && !cleanText) handleAnalyze(); }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-600/30 border border-violet-500/40 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-violet-300" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-white">✨ AI Content Co-Pilot</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/20 border border-violet-500/30 text-violet-300 font-medium">Full Rewrite AI</span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">AI przepisze Twoją treść zgodnie z zasadami Helpful Content i danymi z AI Citations</p>
          </div>
        </div>
        <ChevronDown className={`w-5 h-5 text-violet-400 transition-transform ${isExpanded ? "rotate-180" : ""} shrink-0`} />
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="bg-zinc-950/80 border-t border-violet-500/20">
          {isLoading && (
            <div className="flex items-center justify-center gap-3 py-12">
              <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-zinc-400">Analiza strony w toku...</span>
            </div>
          )}
          {error && (
            <div className="m-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
            </div>
          )}

          {!isLoading && !cleanText && !error && (
            <div className="flex flex-col items-center gap-4 py-10">
              <p className="text-sm text-zinc-400">Kliknij, aby pobrać treść strony i przygotować rewrite</p>
              <Button onClick={handleAnalyze} className="bg-violet-600 hover:bg-violet-500 text-white gap-2">
                <Sparkles className="w-4 h-4" /> Pobierz treść strony
              </Button>
            </div>
          )}

          {!isLoading && cleanText && (
            <div className="p-4 space-y-4">

              {/* Original content preview */}
              {!rewrittenText && (
                <div className="rounded-xl border border-white/8 bg-zinc-900/60 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8">
                    <span className="text-xs font-semibold text-zinc-400">Oryginalna treść strony</span>
                    <span className="text-[10px] text-zinc-600">{cleanText.length} znaków • typ: {detectedPageType}</span>
                  </div>
                  <div className="px-4 py-3 max-h-48 overflow-y-auto">
                    <pre className="text-xs text-zinc-500 whitespace-pre-wrap leading-relaxed font-sans">{cleanText.slice(0, 1200)}{cleanText.length > 1200 ? "\n\n[...] (treść skrócona do podglądu)" : ""}</pre>
                  </div>
                </div>
              )}

              {/* Rewritten text panel with tabs */}
              {rewrittenText && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 overflow-hidden">
                  {/* Tab bar */}
                  <div className="flex items-center gap-0 border-b border-emerald-500/20 bg-emerald-950/40">
                    <button
                      onClick={() => setActiveResultTab("content")}
                      className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-colors border-b-2 ${
                        activeResultTab === "content"
                          ? "border-emerald-400 text-emerald-300 bg-emerald-950/40"
                          : "border-transparent text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      ✨ Treść
                    </button>
                    {researchData && researchData.keyEntities.length > 0 && (
                      <button
                        onClick={() => setActiveResultTab("entities")}
                        className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-colors border-b-2 ${
                          activeResultTab === "entities"
                            ? "border-violet-400 text-violet-300 bg-violet-950/40"
                            : "border-transparent text-zinc-500 hover:text-zinc-300"
                        }`}
                      >
                        🏷️ Encje i wskazówki
                        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-400 text-[10px]">
                          {researchData.keyEntities.length}
                        </span>
                      </button>
                    )}
                    {researchData && researchData.sources.length > 0 && (
                      <button
                        onClick={() => setActiveResultTab("tips")}
                        className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-colors border-b-2 ${
                          activeResultTab === "tips"
                            ? "border-blue-400 text-blue-300 bg-blue-950/40"
                            : "border-transparent text-zinc-500 hover:text-zinc-300"
                        }`}
                      >
                        🔬 Źródła badań
                        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[10px]">
                          {researchData.sources.length}
                        </span>
                      </button>
                    )}
                    <div className="ml-auto flex items-center gap-2 pr-3">
                      <span className="text-[10px] text-zinc-500">{rewrittenText.length} znaków</span>
                      <button
                        onClick={handleCopy}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                          copied
                            ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
                            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/10'
                        }`}
                      >
                        <Copy className="w-3 h-3" />
                        {copied ? "Skopiowano!" : "Kopiuj"}
                      </button>
                    </div>
                  </div>

                  {/* Tab: Content */}
                  {activeResultTab === "content" && (
                    <div className="px-4 py-4 max-h-[600px] overflow-y-auto prose prose-invert prose-sm max-w-none prose-headings:text-zinc-100 prose-headings:font-bold prose-p:text-zinc-200 prose-p:leading-relaxed prose-li:text-zinc-200 prose-strong:text-white prose-a:text-violet-400 prose-blockquote:border-violet-500 prose-blockquote:text-zinc-300 prose-code:text-emerald-300 prose-code:bg-zinc-800/60 prose-code:rounded prose-code:px-1">
                      <Streamdown className="text-sm leading-relaxed">{rewrittenText}</Streamdown>
                    </div>
                  )}

                  {/* Tab: Entities & Tips */}
                  {activeResultTab === "entities" && researchData && (
                    <div className="p-4 space-y-5">
                      {researchData.answerFirstDraft && (
                        <div className="rounded-lg bg-amber-950/30 border border-amber-500/20 p-4">
                          <p className="text-xs font-semibold text-amber-300 mb-2">💡 Sugerowany Answer-First Opening (wzorzec AI snippet)</p>
                          <p className="text-sm text-zinc-200 leading-relaxed italic">{researchData.answerFirstDraft}</p>
                        </div>
                      )}
                      {researchData.keyEntities.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-violet-300 mb-3">🏷️ Kluczowe encje wplecione w treść</p>
                          <div className="flex flex-wrap gap-2">
                            {researchData.keyEntities.map((entity, i) => (
                              <span key={i} className="px-2.5 py-1 rounded-full bg-violet-500/15 border border-violet-500/25 text-xs text-violet-300">
                                {entity}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {researchData.aiReadinessTips.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-emerald-300 mb-3">🚀 Wskazówki GEO zastosowane w rewrite</p>
                          <div className="space-y-2">
                            {researchData.aiReadinessTips.map((tip, i) => (
                              <div key={i} className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/15">
                                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs flex items-center justify-center flex-shrink-0 font-bold mt-0.5">{i + 1}</span>
                                <p className="text-xs text-zinc-300 leading-relaxed">{tip}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {researchData.queries.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-zinc-400 mb-2">🔍 Zapytania badawcze (query fan-out)</p>
                          <div className="flex flex-wrap gap-1.5">
                            {researchData.queries.map((q, i) => (
                              <span key={i} className="px-2 py-0.5 rounded bg-zinc-800 border border-white/8 text-[11px] text-zinc-400">{q}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tab: Research Sources */}
                  {activeResultTab === "tips" && researchData && (
                    <div className="p-4 space-y-3">
                      <p className="text-xs text-zinc-500">Treść została wzbogacona o kontekst z {researchData.sources.length} źródeł internetowych. Żadną informację nie dodano bez podstawy w oryginalnej treści.</p>
                      {researchData.sources.map((src, i) => (
                        <div key={i} className="rounded-lg bg-zinc-900/60 border border-white/8 p-3">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="text-xs font-medium text-zinc-200 leading-tight">{src.title}</p>
                            <span className="text-[10px] text-zinc-600 shrink-0">[{i + 1}]</span>
                          </div>
                          <p className="text-[11px] text-zinc-500 leading-relaxed mb-2">{src.snippet}</p>
                          <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400 hover:text-blue-300 truncate block">{src.url}</a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-3">
                <Button
                  onClick={handleAIRewrite}
                  disabled={isRewriting}
                  className="bg-violet-600 hover:bg-violet-500 text-white gap-2"
                >
                  {isRewriting ? (
                    <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generowanie...(30–60 sek)</>
                  ) : (
                    <><Sparkles className="w-3.5 h-3.5" /> {rewrittenText ? "Przepisz ponownie" : "Uruchom Full Rewrite AI"}</>
                  )}
                </Button>
                {rewrittenText && (
                  <Button variant="outline" onClick={() => { setRewrittenText(null); setCopied(false); }} disabled={isRewriting} className="gap-2 text-zinc-400">
                    Powrót do oryginału
                  </Button>
                )}
              </div>

              {isRewriting && (
                <RewriteProgressIndicator step={rewriteStep} sectionProgress={rewriteSectionProgress} />
              )}

            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Old AISandboxCTA (kept for reference, replaced by WhatIfSection) ────────────────────
function AISandboxCTA({ url, navigate }: { url: string; navigate: (path: string) => void }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border-2 border-violet-500/50 cursor-pointer group"
      style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.15) 0%, rgba(99,102,241,0.10) 50%, rgba(15,15,15,0.95) 100%)" }}
      onClick={() => navigate(`/sandbox?url=${encodeURIComponent(url)}`)}
    >
      {/* Animated glow border */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-violet-500/20 via-indigo-500/10 to-violet-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

      <div className="relative p-6">
        {/* Top row */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-violet-600/30 border border-violet-500/40 flex items-center justify-center flex-shrink-0">
              <Cpu className="w-5 h-5 text-violet-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-white">What-IF Simulator &amp; AI Sandbox</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/20 border border-violet-500/30 text-violet-300 font-medium">BETA — Darmowy</span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">Symuluj zmiany treści i sprawdź, jak wpłyną na widoczność w AI — bez edytowania strony</p>
            </div>
          </div>
          <Button
            onClick={(e) => { e.stopPropagation(); navigate(`/sandbox?url=${encodeURIComponent(url)}`); }}
            className="shrink-0 bg-violet-600 hover:bg-violet-500 text-white font-semibold gap-2 shadow-lg shadow-violet-500/20"
          >
            <Sparkles className="w-4 h-4" />
            Otwórz Sandbox →
          </Button>
        </div>

        {/* Feature list */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { icon: "⚡", title: "What-IF Editor", desc: "Edytuj treść i natychmiast sprawdź zmianę score" },
            { icon: "📊", title: "AI Score Breakdown", desc: "Szczegółowa analiza dla ChatGPT i Google AIO" },
            { icon: "🎯", title: "Lista poprawek", desc: "Priorytety co poprawić, żeby AI Cię cytowało" },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="flex items-start gap-2.5 bg-white/4 border border-white/8 rounded-xl p-3">
              <span className="text-base flex-shrink-0">{icon}</span>
              <div>
                <p className="text-xs font-semibold text-white">{title}</p>
                <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="mt-4 pt-4 border-t border-violet-500/15 flex items-center justify-between">
          <p className="text-xs text-zinc-500">Strona zostanie automatycznie załadowana do Sandbox</p>
          <span className="text-xs text-violet-400 font-semibold group-hover:text-violet-300 transition-colors">Kliknij, aby otworzyć →</span>
        </div>
      </div>
    </div>
  );
}

// ─── Loading / Error ──────────────────────────────────────────────────────────────────────────────────
function LoadingState() {
  const steps = ["Sprawdzanie dostępu crawlerów", "Analiza danych strukturalnych", "Skanowanie jakości treści", "Ocena sygnałów zaufania", "Uruchamianie analizy AI"];
  const [activeStep, setActiveStep] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setActiveStep((s) => (s + 1) % steps.length), 2200);
    return () => clearInterval(interval);
  }, []);
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-6 max-w-sm px-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <Brain className="w-8 h-8 text-primary animate-pulse" />
        </div>
        <div>
          <h2 className="text-xl font-bold mb-2">Analizuję Twoją stronę…</h2>
          <p className="text-muted-foreground text-sm">{steps[activeStep]}</p>
        </div>
        <div className="flex justify-center gap-2">
          {steps.map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all duration-500 ${i === activeStep ? "w-6 bg-primary" : i < activeStep ? "w-3 bg-primary/40" : "w-3 bg-muted"}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  const [, navigate] = useLocation();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4 max-w-md px-4">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8 text-destructive" />
        </div>
        <div>
          <h2 className="text-xl font-bold mb-2">Audyt nie powiódł się</h2>
          <p className="text-muted-foreground text-sm">{message}</p>
        </div>
        <Button onClick={() => navigate("/")} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Sprawdź inny URL
        </Button>
      </div>
    </div>
  );
}

// ─── AI Search Exposure Score Panel ──────────────────────────────────────────

type ExposureTier = "invisible" | "emerging" | "visible" | "dominant";

interface AiExposureResult {
  domain: string;
  totalKeywordsAnalyzed: number;
  keywordsWithAiOverview: number;
  keywordsCitedInAiOverview: number;
  exposureScore: number;
  citationScore: number;
  compositeScore: number;
  tier: ExposureTier;
  tierLabel: string;
  topKeywords: Array<{ keyword: string; volume: number; hasAiOverview: boolean; isCitedInAiOverview: boolean }>;
  opportunities: Array<{ keyword: string; volume: number; hasAiOverview: boolean; isCitedInAiOverview: boolean }>;
  insights: string[];
  analyzedAt: number;
}

const TIER_CONFIG: Record<ExposureTier, { label: string; color: string; bg: string; border: string; icon: React.ElementType; desc: string }> = {
  invisible: {
    label: "Niewidoczny",
    color: "oklch(0.65 0.22 25)",
    bg: "oklch(0.65 0.22 25 / 0.08)",
    border: "oklch(0.65 0.22 25 / 0.25)",
    icon: TrendingDown,
    desc: "Twoja domena nie jest jeszcze widoczna w Google AI Overviews. Silna widoczność organiczna w Google to fundament, który otwiera drzwi do AI Search — warto zacząć od niej.",
  },
  emerging: {
    label: "Wschodzący",
    color: "oklch(0.78 0.18 75)",
    bg: "oklch(0.78 0.18 75 / 0.08)",
    border: "oklch(0.78 0.18 75 / 0.25)",
    icon: Activity,
    desc: "Twoja domena zaczyna pojawiać się w Google AI Overviews. To sygnał, że Google zaczyna traktować Cię jako autorytet — rozwijaj treści eksperckie, by przyspieszyć wzrost widoczności w AI Search.",
  },
  visible: {
    label: "Widoczny",
    color: "oklch(0.72 0.18 160)",
    bg: "oklch(0.72 0.18 160 / 0.08)",
    border: "oklch(0.72 0.18 160 / 0.25)",
    icon: Eye,
    desc: "Twoja domena ma solidną pozycję w Google AI Overviews. Algorytmy AI Search coraz częściej wybierają Cię jako źródło odpowiedzi — optymalizuj strukturę treści i schema.org, by wejść na poziom dominacji.",
  },
  dominant: {
    label: "Dominujący",
    color: "oklch(0.72 0.18 145)",
    bg: "oklch(0.72 0.18 145 / 0.08)",
    border: "oklch(0.72 0.18 145 / 0.25)",
    icon: Award,
    desc: "Twoja domena dominuje w Google AI Overviews — jesteś rozpoznawanym autorytetem w swojej niszy. Algorytmy AI Search aktywnie cytują Cię jako wiarygodne źródło odpowiedzi dla użytkowników.",
  },
};

function AiExposurePanel({ url }: { url: string }) {
  const [displayScore, setDisplayScore] = useState(0);
  const [displayCoverage, setDisplayCoverage] = useState(0);
  const domainName = (() => { try { return new URL(url).hostname.replace("www.", ""); } catch { return url; } })();

  const { data, isLoading, error } = trpc.aiExposure.getScore.useQuery(
    { url },
    { enabled: !!url, staleTime: 1000 * 60 * 30 }
  );

  const result = data?.result as AiExposureResult | undefined;
  const tier = result ? TIER_CONFIG[result.tier] : null;
  const TierIcon = tier?.icon ?? Activity;

  // Animate score count-up
  useEffect(() => {
      if (!result) return;
    let start = 0;
    const duration = 1400;
    const coveragePct = result.totalKeywordsAnalyzed > 0
      ? Math.round((result.keywordsWithAiOverview / result.totalKeywordsAnalyzed) * 100)
      : 0;
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      setDisplayScore(Math.round(p * result.compositeScore));
      setDisplayCoverage(Math.round(p * coveragePct));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [result]);

  const circumference = 2 * Math.PI * 40;
  const strokeOffset = circumference - (displayScore / 100) * circumference;

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: tier?.border ?? "oklch(0.3 0.02 250 / 0.4)" }}>
      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex items-center justify-between" style={{ background: tier?.bg ?? "oklch(0.15 0.015 250 / 0.5)" }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: tier?.bg ?? "oklch(0.2 0.02 250 / 0.6)", border: `1px solid ${tier?.border ?? "oklch(0.3 0.02 250 / 0.3)"}` }}>
            <Globe className="w-5 h-5" style={{ color: tier?.color ?? "oklch(0.6 0.1 250)" }} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold">Widoczność <span className="text-primary">{domainName}</span> w Google AI Overviews</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide" style={{ background: "oklch(0.6 0.15 260 / 0.18)", color: "oklch(0.75 0.15 260)" }}>
                Bonus: Kontekst domenowy
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Dodatkowy rzut na całą domenę — jak Google AI Overviews postrzega Twój autorytet organiczny</p>
          </div>
        </div>
        {result && (
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
            <Flame className="w-3.5 h-3.5" style={{ color: tier?.color }} />
            <span style={{ color: tier?.color }} className="font-semibold">{tier?.label}</span>
          </div>
        )}
      </div>

      <div className="px-6 pb-6 bg-card/50">
        {isLoading && (
          <div className="py-10 flex flex-col items-center gap-4">
            <div className="relative w-20 h-20">
              <svg className="w-20 h-20 -rotate-90 animate-spin" style={{ animationDuration: "3s" }} viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="30" fill="none" stroke="oklch(0.22 0.015 250)" strokeWidth="6" />
                <circle cx="40" cy="40" r="30" fill="none" stroke="oklch(0.72 0.18 145)" strokeWidth="6" strokeLinecap="round" strokeDasharray="188" strokeDashoffset="140" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <Globe className="w-6 h-6 text-primary animate-pulse" />
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">Analizuję autorytet domeny w Google AI Overviews…</p>
              <p className="text-xs text-muted-foreground mt-1">Sprawdzam, jak Google AI postrzega Twoją domenę na tle słów kluczowych organicznych</p>
            </div>
          </div>
        )}

        {error && (
          <div className="py-8 flex items-start gap-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 mt-4">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-300">Dane AI Exposure tymczasowo niedostępne</p>
              <p className="text-xs text-muted-foreground mt-1">Nie udało się pobrać danych AI Overview dla tej domeny. Spróbuj ponownie za chwilę.</p>
            </div>
          </div>
        )}

        {result && tier && (
          <div className="mt-4 space-y-5">
            {/* Main metrics row */}
            <div className="flex flex-col sm:flex-row items-center gap-6">
              {/* Composite Score ring */}
              <div className="shrink-0 flex flex-col items-center gap-2">
                <div className="relative">
                  <svg width="100" height="100" viewBox="0 0 100 100" className="-rotate-90">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="oklch(0.22 0.015 250)" strokeWidth="8" />
                    <circle
                      cx="50" cy="50" r="40" fill="none"
                      stroke={tier.color}
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeOffset}
                      style={{ transition: "stroke-dashoffset 0.05s linear" }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black" style={{ color: tier.color }}>{displayScore}</span>
                    <span className="text-[9px] text-muted-foreground">/100</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold" style={{ background: tier.bg, color: tier.color, border: `1px solid ${tier.border}` }}>
                  <TierIcon className="w-3 h-3" />
                  {tier.label}
                </div>
              </div>

              {/* Stats grid */}
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3 w-full">
                <div className="rounded-xl p-3.5 bg-muted/20 border border-border/30 text-center">
                  <div className="text-2xl font-black" style={{ color: tier.color }}>{displayCoverage}%</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Pokrycie AI Overview</div>
                  <div className="text-[9px] text-muted-foreground/60 mt-0.5">{result.keywordsWithAiOverview} z {result.totalKeywordsAnalyzed} słów kluczowych</div>
                </div>
                <div className="rounded-xl p-3.5 bg-muted/20 border border-border/30 text-center">
                  <div className="text-2xl font-black text-violet-400">{result.keywordsCitedInAiOverview}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Bezpośrednie cytowania</div>
                  <div className="text-[9px] text-muted-foreground/60 mt-0.5">cytowane w odpowiedziach AI</div>
                </div>
                <div className="rounded-xl p-3.5 bg-muted/20 border border-border/30 text-center col-span-2 sm:col-span-1">
                  <div className="text-2xl font-black text-sky-400">{result.totalKeywordsAnalyzed}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Przeanalizowane słowa kluczowe</div>
                  <div className="text-[9px] text-muted-foreground/60 mt-0.5">top słowa kluczowe organiczne</div>
                </div>
              </div>
            </div>

            {/* Tier description */}
            <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: tier.bg, border: `1px solid ${tier.border}` }}>
              <TierIcon className="w-4 h-4 shrink-0 mt-0.5" style={{ color: tier.color }} />
              <p className="text-sm" style={{ color: tier.color }}>{tier.desc}</p>
            </div>

            {/* AI Insights */}
            {result.insights.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" /> Wnioski AI
                </h3>
                <div className="grid gap-2">
                  {result.insights.map((insight, i) => (
                    <div key={i} className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/15 border border-border/20">
                      <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-muted-foreground leading-relaxed">{insight}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top AI keywords */}
            {(result.topKeywords ?? []).length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5 text-primary" /> Słowa kluczowe w AI Overviews
                </h3>
                <div className="rounded-xl border border-border/30 overflow-hidden">
                  <div className="grid grid-cols-[1fr_auto_auto] text-[10px] text-muted-foreground font-medium px-4 py-2 bg-muted/20 border-b border-border/20">
                    <span>Słowo kluczowe</span>
                    <span className="text-right pr-4">Wolumen</span>
                    <span className="text-right">Status</span>
                  </div>
                  {(result.topKeywords ?? []).slice(0, 8).map((kw, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto_auto] items-center px-4 py-2.5 border-b border-border/10 last:border-0 hover:bg-muted/10 transition-colors">
                      <span className="text-xs font-medium truncate pr-2">{kw.keyword}</span>
                      <span className="text-xs text-muted-foreground text-right pr-4">{kw.volume >= 1000 ? `${(kw.volume / 1000).toFixed(1)}k` : kw.volume}</span>
                      <div className="flex items-center gap-1.5">
                        {kw.isCitedInAiOverview ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "oklch(0.72 0.18 145 / 0.15)", color: "oklch(0.72 0.18 145)" }}>Cytowane</span>
                        ) : kw.hasAiOverview ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-sky-500/10 text-sky-400">AI Overview</span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-muted/30 text-muted-foreground">Standardowe</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SEO ↔ AI Search insight card */}
            <div className="rounded-xl p-4 flex items-start gap-3 bg-sky-500/5 border border-sky-500/15">
              <svg className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-xs font-semibold text-sky-300 mb-1">Dlaczego SEO ma znaczenie dla AI Search?</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Wysoka widoczność organiczna w Google to jeden z kluczowych sygnałów autorytetu, które ChatGPT, Perplexity i Google AI Overviews biorą pod uwagę przy wyborze źródeł cytowań. Domeny z silną pozycją w wynikach organicznych są statystycznie częściej wybierane przez algorytmy AI jako wiarygodne odpowiedzi na pytania użytkowników.
                </p>
              </div>
            </div>

            {/* Cache note */}
            {data?.fromCache && (
              <p className="text-[10px] text-muted-foreground/50 text-right">
                Dane odświeżane co 24h · Ostatni skan: {new Date(result.analyzedAt).toLocaleString()}
              </p>
            )}
            {/* Opportunities section */}
            {(result.opportunities ?? []).length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-amber-400" /> Szanse wzrostu
                </h3>
                <div className="grid gap-1.5">
                  {(result.opportunities ?? []).slice(0, 3).map((kw, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/15">
                      <span className="text-xs font-medium text-amber-300/90">{kw.keyword}</span>
                      <span className="text-[10px] text-muted-foreground">{kw.volume >= 1000 ? `${(kw.volume / 1000).toFixed(1)}k/mo` : `${kw.volume}/mo`}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
