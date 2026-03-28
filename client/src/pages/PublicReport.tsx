import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Brain,
  ExternalLink,
  Share2,
  Copy,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Shield,
  Code2,
  FileText,
  Zap,
  Bot,
  BarChart3,
  AlertCircle,
  ArrowRight,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Eye,
} from "lucide-react";
import { useState } from "react";
import type {
  AuditResult,
  CategoryResult,
  AuditCheck,
  Recommendation,
  LLMRecommendation,
  LLMRecommendationsResult,
} from "../../../shared/auditTypes";

export default function PublicReport() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const auditId = parseInt(params.id ?? "0");

  const { data: audit, isLoading, error } = trpc.audit.getById.useQuery(
    { id: auditId },
    { enabled: !!auditId }
  );

  if (isLoading) return <LoadingState />;
  if (error || !audit) return <ErrorState message={error?.message ?? "Raport nie został znaleziony."} />;
  if (audit.status !== "completed") return <ErrorState message="Ten raport nie jest jeszcze dostępny." />;

  const findings = audit.findings as unknown as AuditResult["findings"];
  const recommendations = audit.recommendations as unknown as Recommendation[];
  const llmRecs = audit.llmRecommendations as unknown as LLMRecommendation[] | null;
  const llmAiInsight = audit.llmAiInsight as string | null;
  const llmTopPriority = audit.llmTopPriority as string | null;
  const llmScoreGain = (audit as unknown as { llmScoreGain?: number | null }).llmScoreGain ?? null;
  const llmDifficulty = (audit as unknown as { llmDifficulty?: string | null }).llmDifficulty as "easy" | "medium" | "hard" | null;
  const overallScore = audit.overallScore ?? 0;
  const scoreLabel = getScoreLabel(overallScore);
  const scoreColor = getScoreColor(overallScore);

  const llmResult: LLMRecommendationsResult | null =
    llmRecs && llmAiInsight
      ? { recommendations: llmRecs, aiInsight: llmAiInsight, topPriority: llmTopPriority ?? "", scoreGain: llmScoreGain ?? 5, difficulty: llmDifficulty ?? "medium" }
      : null;

  const reportUrl = `${window.location.origin}/report/${auditId}`;

  const handleShare = (platform: "linkedin" | "twitter" | "facebook" | "copy") => {
    const text = `Sprawdziłem AI-Readiness mojej strony z GEO-Auditor i uzyskałem ${Math.round(overallScore)}/100! Zobacz pełny raport:`;
    const encodedText = encodeURIComponent(text);
    const encodedUrl = encodeURIComponent(reportUrl);

    if (platform === "copy") {
      navigator.clipboard.writeText(reportUrl);
      toast.success("Link do raportu skopiowany do schowka!");
      return;
    }
    if (platform === "linkedin") {
      window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`, "_blank");
    } else if (platform === "twitter") {
      window.open(`https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`, "_blank");
    } else if (platform === "facebook") {
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`, "_blank");
    }
  };

  const badgeCode = `<a href="${reportUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;background:#1a1a2e;border:1px solid #3b3b6b;border-radius:8px;text-decoration:none;font-family:system-ui,sans-serif;font-size:13px;color:#e2e8f0;">
  <span style="font-weight:700;color:${scoreColor};">${Math.round(overallScore)}/100</span>
  <span style="color:#94a3b8;">AI-Ready</span>
  <span style="font-size:10px;color:#64748b;border-left:1px solid #3b3b6b;padding-left:8px;">GEO-Auditor</span>
</a>`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/90 backdrop-blur-xl">
        <div className="container flex items-center justify-between h-16">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <Brain className="w-4 h-4 text-primary" />
            </div>
            <span className="font-semibold text-foreground tracking-tight hidden sm:block">GEO-Auditor</span>
          </button>

          <div className="flex items-center gap-2 max-w-xs overflow-hidden">
            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <a
              href={audit.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground truncate hover:text-foreground transition-colors"
            >
              {audit.url}
            </a>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleShare("copy")}
              className="gap-1.5 text-xs"
            >
              <Share2 className="w-3.5 h-3.5" />
              Udostępnij
            </Button>
            <Button
              size="sm"
              onClick={() => navigate("/")}
              className="gap-1.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              Audytuj moją stronę
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container max-w-5xl mx-auto py-10 space-y-8">
        {/* Score Hero */}
        <ScoreHero
          score={overallScore}
          scoreLabel={scoreLabel}
          pageTitle={audit.pageTitle ?? audit.url}
          url={audit.url}
          findings={findings}
          auditDate={audit.completedAt ?? audit.createdAt}
        />

        {/* Share Panel */}
        <SharePanel
          score={overallScore}
          onShare={handleShare}
          badgeCode={badgeCode}
          reportUrl={reportUrl}
        />

        {/* AI Insight */}
        {llmResult && (
          <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/8 to-violet-500/5 p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-primary uppercase tracking-wide">Analiza AI</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium">Spersonalizowana</span>
                </div>
                <p className="text-sm leading-relaxed text-foreground/90">{llmResult.aiInsight}</p>
              </div>
            </div>
          </div>
        )}

        {/* Category Breakdown */}
        {findings && <CategoryBreakdown findings={findings} />}

        {/* Top Recommendations (first 3) */}
        {recommendations && recommendations.length > 0 && (
          <TopRecommendations recommendations={recommendations.slice(0, 3)} />
        )}

        {/* CTA — AI Visibility deep link */}
        <div
          className="rounded-2xl border border-primary/30 bg-primary/5 p-5 flex items-center gap-4 cursor-pointer hover:bg-primary/10 transition-colors group"
          onClick={() => navigate(`/results/${auditId}?tab=visibility`)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && navigate(`/results/${auditId}?tab=visibility`)}
        >
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <Eye className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">Czy ChatGPT i Perplexity cytują tę stronę?</div>
            <div className="text-xs text-muted-foreground mt-0.5">Zobacz pełną analizę widoczności AI — które silniki cytują tę stronę i kto ją wyprzedza.</div>
          </div>
          <div className="flex items-center gap-1 text-xs text-primary font-semibold group-hover:gap-2 transition-all shrink-0">
            Sprawdź <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* CTA — Audit your own site */}
        <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-violet-500/5 border border-primary/20 p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center mx-auto mb-4">
            <Brain className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-xl font-bold mb-2">Jak AI-Ready jest TWOJA strona?</h3>
          <p className="text-muted-foreground text-sm mb-6 max-w-md mx-auto">
            Uzyskaj bezpłatny wynik AI-Readiness dla dowolnego URL w mniej niż 60 sekund. Bez rejestracji.
          </p>
          <Button
            onClick={() => navigate("/")}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-2"
          >
              Audytuj moją stronę — bezpłatnie
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-6 mt-10">
        <div className="container text-center text-xs text-muted-foreground">
          Raport wygenerowany przez{" "}
          <a href="/" className="text-primary hover:underline">GEO-Auditor</a>
          {" "}· Narzędzie audytu widoczności w AI Search
        </div>
      </footer>
    </div>
  );
}

// ─── Share Panel ──────────────────────────────────────────────────────────────

function SharePanel({
  score,
  onShare,
  badgeCode,
  reportUrl,
}: {
  score: number;
  onShare: (platform: "linkedin" | "twitter" | "facebook" | "copy") => void;
  badgeCode: string;
  reportUrl: string;
}) {
  const [showBadge, setShowBadge] = useState(false);
  const [badgeCopied, setBadgeCopied] = useState(false);

  const copyBadge = () => {
    navigator.clipboard.writeText(badgeCode);
    setBadgeCopied(true);
      toast.success("HTML badge'a skopiowany!");
    setTimeout(() => setBadgeCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl bg-card border border-border/50 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Share2 className="w-4 h-4 text-primary" />
        <h3 className="font-semibold">Udostępnij ten raport</h3>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onShare("linkedin")}
          className="gap-2 text-xs border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
          </svg>
          LinkedIn
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onShare("twitter")}
          className="gap-2 text-xs border-sky-500/30 text-sky-400 hover:bg-sky-500/10"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          X / Twitter
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onShare("facebook")}
          className="gap-2 text-xs border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>
          Facebook
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onShare("copy")}
          className="gap-2 text-xs"
        >
          <Copy className="w-3.5 h-3.5" />
          Kopiuj link
        </Button>
      </div>

      {/* Embeddable Badge — only for good scores */}
      {score >= 70 && (
        <div>
          <button
            onClick={() => setShowBadge(!showBadge)}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showBadge ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            Osadź badge AI-Ready na swojej stronie
          </button>
          {showBadge && (
            <div className="mt-3 space-y-3">
              <div className="p-3 rounded-xl bg-background border border-border/50">
                <div className="text-xs text-muted-foreground mb-2">Podgląd:</div>
                <div
                  dangerouslySetInnerHTML={{ __html: badgeCode }}
                  className="inline-block"
                />
              </div>
              <div className="relative">
                <pre className="text-[10px] bg-muted/30 rounded-xl p-3 overflow-x-auto text-muted-foreground leading-relaxed">
                  {badgeCode}
                </pre>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyBadge}
                  className="absolute top-2 right-2 h-7 gap-1 text-xs"
                >
                  <Copy className="w-3 h-3" />
                  {badgeCopied ? "Skopiowano!" : "Kopiuj"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Score Hero ───────────────────────────────────────────────────────────────

function ScoreHero({
  score,
  scoreLabel,
  pageTitle,
  url,
  findings,
  auditDate,
}: {
  score: number;
  scoreLabel: string;
  pageTitle: string;
  url: string;
  findings: AuditResult["findings"] | null;
  auditDate: Date;
}) {
  const scoreColor = getScoreColor(score);
  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="rounded-2xl bg-card border border-border/50 p-8">
      <div className="flex flex-col lg:flex-row items-center gap-8">
        <div className="shrink-0 relative">
          <svg width="140" height="140" viewBox="0 0 140 140" className="-rotate-90">
            <circle cx="70" cy="70" r="54" fill="none" stroke="oklch(0.22 0.015 250)" strokeWidth="10" />
            <circle
              cx="70" cy="70" r="54" fill="none"
              stroke={scoreColor} strokeWidth="10" strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
              style={{ transition: "stroke-dashoffset 1s ease-out" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-bold" style={{ color: scoreColor }}>{Math.round(score)}</span>
            <span className="text-xs text-muted-foreground mt-0.5">/ 100</span>
          </div>
        </div>

        <div className="flex-1 text-center lg:text-left">
          <div className="flex items-center justify-center lg:justify-start gap-2 mb-2 flex-wrap">
            <span className="text-sm font-bold px-3 py-1 rounded-full" style={{ color: scoreColor, background: `${scoreColor}20`, border: `1px solid ${scoreColor}40` }}>
              {scoreLabel}
            </span>
            <span className="text-xs text-muted-foreground px-2.5 py-1 rounded-full bg-muted/50">
              {getTierSubtitle(score)}
            </span>
          </div>
          <h1 className="text-xl font-bold mb-1 truncate">{pageTitle || url}</h1>
          <p className="text-sm text-muted-foreground mb-1 truncate">{url}</p>
          <p className="text-xs text-muted-foreground mb-6">
            Audyt z dnia {new Date(auditDate).toLocaleDateString("pl-PL", { year: "numeric", month: "long", day: "numeric" })}
          </p>

          {findings && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {CATEGORY_META.map((cat) => {
                const catData = findings[cat.key as keyof typeof findings] as CategoryResult;
                return (
                  <div key={cat.key} className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/40">
                    <cat.icon className="w-4 h-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[10px] text-muted-foreground truncate">{cat.label}</div>
                      <div className="text-sm font-semibold" style={{ color: getScoreColor(catData?.score ?? 0) }}>
                        {catData?.score ?? 0}
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

// ─── Category Breakdown ───────────────────────────────────────────────────────

function CategoryBreakdown({ findings }: { findings: AuditResult["findings"] }) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Szczegółowy wynik</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {CATEGORY_META.map((cat) => {
          const catData = findings[cat.key as keyof typeof findings] as CategoryResult;
          const score = catData?.score ?? 0;
          const color = getScoreColor(score);
          return (
            <div key={cat.key} className="p-5 rounded-2xl bg-card border border-border/50">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <cat.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{cat.label}</div>
                    <div className="text-xs text-muted-foreground">{cat.weight}% wyniku</div>
                  </div>
                </div>
                <span className="text-2xl font-bold" style={{ color }}>{score}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden mb-3">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${score}%`, backgroundColor: color }} />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{catData?.summary}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Top Recommendations ──────────────────────────────────────────────────────

function TopRecommendations({ recommendations }: { recommendations: Recommendation[] }) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Najważniejsze rekomendacje</h2>
      <div className="space-y-3">
        {recommendations.map((rec) => (
          <div key={rec.id} className="p-5 rounded-2xl bg-card border border-border/50">
            <div className="flex items-start gap-3">
              <PriorityBadge priority={rec.priority} />
              <div>
                <div className="font-semibold text-sm mb-1">{rec.title}</div>
                <p className="text-xs text-muted-foreground leading-relaxed">{rec.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-3 text-center">
        Pełny raport ze wszystkimi rekomendacjami dostępny na{" "}
        <a href="/" className="text-primary hover:underline">GEO-Auditor</a>
      </p>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: Recommendation["priority"] }) {
  const config = {
    critical: { label: "Krytyczne", classes: "bg-status-fail text-status-fail" },
    high: { label: "Wysokie", classes: "bg-status-warning text-status-warning" },
    medium: { label: "Średnio", classes: "bg-blue-500/15 text-blue-400" },
    low: { label: "Niskie", classes: "bg-muted text-muted-foreground" },
  };
  const c = config[priority];
  return (
    <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${c.classes}`}>
      {c.label}
    </span>
  );
}

function LoadingState() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <Brain className="w-8 h-8 text-primary animate-pulse" />
        </div>
        <h2 className="text-xl font-bold">Wczytywanie raportu...</h2>
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
        <h2 className="text-xl font-bold">Raport nie znaleziony</h2>
        <p className="text-muted-foreground text-sm">{message}</p>
        <Button onClick={() => navigate("/")} className="gap-2">
          Audytuj URL
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

const CATEGORY_META = [
  { key: "technical", label: "Dostęp techniczny", icon: Shield, weight: 25 },
  { key: "structuredData", label: "Dane strukturalne", icon: Code2, weight: 20 },
  { key: "contentStructure", label: "Struktura treści", icon: FileText, weight: 25 },
  { key: "eeat", label: "Sygnały E-E-A-T", icon: Zap, weight: 15 },
  { key: "aiCrawlers", label: "Dostęp crawlerów AI", icon: Bot, weight: 10 },
  { key: "metaTags", label: "Meta tagi", icon: BarChart3, weight: 5 },
];

function getScoreLabel(score: number): string {
  if (score >= 83) return "Dominujący";
  if (score >= 70) return "Widoczny";
  if (score >= 55) return "Rozwijający się";
  if (score >= 36) return "Startujący";
  return "Niewidoczny";
}

function getTierSubtitle(score: number): string {
  if (score >= 83) return "Czołówka AI Search";
  if (score >= 70) return "Dobra widoczność w AI";
  if (score >= 55) return "Widoczność w trakcie budowania";
  if (score >= 36) return "Niska widoczność w AI Search";
  return "Praktycznie niewidoczna dla AI";
}

function getScoreColor(score: number): string {
  if (score >= 80) return "oklch(0.72 0.18 145)";
  if (score >= 60) return "oklch(0.72 0.18 160)";
  if (score >= 40) return "oklch(0.78 0.18 75)";
  return "oklch(0.65 0.22 25)";
}
