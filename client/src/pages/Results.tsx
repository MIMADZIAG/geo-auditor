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
} from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";
import SyntaxHighlighter from "react-syntax-highlighter";
import { atomOneDark } from "react-syntax-highlighter/dist/esm/styles/hljs";
import type {
  AuditResult,
  CategoryResult,
  AuditCheck,
  Recommendation,
  LLMRecommendation,
  LLMRecommendationsResult,
  ContentIntelligenceResult,
} from "../../../shared/auditTypes";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getScoreColor(score: number): string {
  if (score >= 80) return "oklch(0.72 0.18 145)";
  if (score >= 60) return "oklch(0.72 0.18 160)";
  if (score >= 40) return "oklch(0.78 0.18 75)";
  return "oklch(0.65 0.22 25)";
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "High";
  if (score >= 60) return "Moderate";
  if (score >= 40) return "Low";
  return "Very Low";
}

function getScoreSublabel(score: number): string {
  if (score >= 80) return "Your page is well-positioned for AI search visibility.";
  if (score >= 60) return "Your page has decent visibility — a few fixes will make a big difference.";
  if (score >= 40) return "AI search engines may struggle to find and cite your content.";
  return "Your page has significant barriers preventing AI search visibility.";
}

const CATEGORY_META = [
  { key: "technical", label: "Technical Access", icon: Shield },
  { key: "structuredData", label: "Structured Data", icon: Code2 },
  { key: "contentStructure", label: "Content Structure", icon: FileText },
  { key: "eeat", label: "Trust & Authority", icon: Zap },
  { key: "aiCrawlers", label: "AI Crawler Access", icon: Bot },
  { key: "metaTags", label: "Meta Tags", icon: BarChart3 },
  { key: "brandAuthority", label: "Brand Presence", icon: TrendingUp },
];

const CATEGORY_HUMAN_LABELS: Record<string, string> = {
  technical: "Technical Access",
  structuredData: "Structured Data",
  contentStructure: "Content Structure",
  eeat: "Trust & Authority",
  aiCrawlers: "AI Crawler Access",
  metaTags: "Meta Tags",
  brandAuthority: "Brand Presence",
};

// Human-readable descriptions for non-technical users
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  technical: "Whether AI crawlers can access and read your page without technical barriers.",
  structuredData: "Machine-readable labels that help AI understand what your page is about.",
  contentStructure: "How well your content is organized for AI to extract and cite answers.",
  eeat: "Signals that tell AI your content is trustworthy and written by an expert.",
  aiCrawlers: "Whether specific AI bots (ChatGPT, Perplexity, Gemini) are allowed to index your page.",
  metaTags: "Page title and description that AI uses to understand your content at a glance.",
  brandAuthority: "How strongly your brand is recognized as an authority in its field by AI search engines.",
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Results() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const auditId = parseInt(params.id ?? "0");
  const { isAuthenticated } = useAuth();

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

  if (isLoading) return <LoadingState />;
  if (error || !audit) return <ErrorState message={error?.message ?? "Audit not found."} />;
  if (audit.status === "running" || audit.status === "pending") return <LoadingState />;
  if (audit.status === "failed") {
    return <ErrorState message={audit.errorMessage ?? "Audit failed. Please try again."} />;
  }

  const findings = audit.findings as unknown as AuditResult["findings"];
  const recommendations = audit.recommendations as unknown as Recommendation[];
  const llmRecs = audit.llmRecommendations as unknown as LLMRecommendation[] | null;
  const llmAiInsight = audit.llmAiInsight as string | null;
  const llmTopPriority = audit.llmTopPriority as string | null;
  const overallScore = Math.round(audit.overallScore ?? 0);
  const contentIntelligence = audit.contentIntelligence as unknown as ContentIntelligenceResult | null;
  const reportUrl = typeof window !== "undefined" ? `${window.location.origin}/report/${auditId}` : "";

  const llmResult: LLMRecommendationsResult | null =
    llmRecs && llmAiInsight
      ? { recommendations: llmRecs, aiInsight: llmAiInsight, topPriority: llmTopPriority ?? "" }
      : null;

  const handleShare = (platform: "linkedin" | "twitter" | "copy") => {
    const text = `I checked my page's AI search visibility with GEO-Auditor — scored ${overallScore}/100. See the full report:`;
    const encodedText = encodeURIComponent(text);
    const encodedUrl = encodeURIComponent(reportUrl);
    if (platform === "copy") {
      navigator.clipboard.writeText(reportUrl);
      toast.success("Report link copied!");
      return;
    }
    if (platform === "linkedin") window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`, "_blank");
    else if (platform === "twitter") window.open(`https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`, "_blank");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Sticky Header ── */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/90 backdrop-blur-xl">
        <div className="container flex items-center justify-between h-16">
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
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 max-w-xs overflow-hidden">
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <a href={audit.url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground transition-colors" style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'200px',display:'block'}}>
                {audit.url}
              </a>
            </div>
            <Button variant="outline" size="sm" onClick={() => handleShare("copy")} className="gap-1.5 text-xs">
              <Share2 className="w-3.5 h-3.5" /> Share
            </Button>
            {isAuthenticated ? (
              <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="gap-1.5 text-xs">
                <LayoutDashboard className="w-3.5 h-3.5" /> Dashboard
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => (window.location.href = getLoginUrl())} className="gap-1.5 text-xs text-primary">
                <LogIn className="w-3.5 h-3.5" /> Sign In
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container max-w-5xl mx-auto py-10 space-y-8">

        {/* ── 1. AI Visibility Score Hero ── */}
        <ScoreHero
          score={overallScore}
          pageTitle={audit.pageTitle ?? audit.url}
          url={audit.url}
          findings={findings}
        />

           {/* ── 2. Issues & Fixes — Critical first ── */}
        <IssuesAndFixes
          findings={findings}
          llmRecs={llmResult?.recommendations ?? null}
          recommendations={recommendations}
        />
        {/* ── 3. Top Priority Fix ── */}
        {llmResult?.topPriority && (
          <TopPriorityBanner topPriority={llmResult.topPriority} aiInsight={llmResult.aiInsight} />
        )}
        {/* ── 4. Monitor CTA — contextual after seeing issues ── */}
        <MonitorCTA isAuthenticated={isAuthenticated} navigate={navigate} />
        {/* ── 5. Content Intelligence — the "Aha!" section ── */}
        <ContentIntelligencePanel
          contentIntelligence={contentIntelligence}
          isAuthenticated={isAuthenticated}
        />
        {/* ── 6. AI Sandbox CTA — simulate how AI engines rank this page ── */}
        <AISandboxCTA url={audit.url} navigate={navigate} />
        {/* ── 7. Competitor Analysis Teaser (Pro) ── */}
        <CompetitorAnalysisTeaser navigate={navigate} />
        {/* ── 7. What's Working ── */}
        {findings && <PassingChecks findings={findings} />}
        {/* ── 8. Share ── */}
        <SharePanel score={overallScore} onShare={handleShare} reportUrl={reportUrl} />
        {/* ── 9. Score History Teaser ── */}
        {!isAuthenticated && <ScoreHistoryTeaser />}
        {/* ── 10. PLG Upgrade Banner ── */}
        <PLGUpgradeBanner isAuthenticated={isAuthenticated} navigate={navigate} />

      </main>
    </div>
  );
}

// ─── 1. Score Hero ────────────────────────────────────────────────────────────

function ScoreHero({
  score,
  pageTitle,
  url,
  findings,
}: {
  score: number;
  pageTitle: string;
  url: string;
  findings: AuditResult["findings"] | null;
}) {
  const [displayScore, setDisplayScore] = useState(0);
  const scoreColor = getScoreColor(score);
  const scoreLabel = getScoreLabel(score);
  const scoreSublabel = getScoreSublabel(score);
  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference - (displayScore / 100) * circumference;

  // Animate score count-up
  useEffect(() => {
    let start = 0;
    const duration = 1200;
    const step = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      setDisplayScore(Math.round(progress * score));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [score]);

  return (
    <div className="rounded-2xl bg-card border border-border/50 p-8">
      <div className="flex flex-col lg:flex-row items-center gap-8">
        {/* Score Ring */}
        <div className="shrink-0 relative">
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
        </div>

        {/* Info */}
        <div className="flex-1 text-center lg:text-left">
          <div className="flex items-center justify-center lg:justify-start gap-2 mb-3">
            <span className="text-sm font-semibold px-3 py-1 rounded-full" style={{ color: scoreColor, background: `${scoreColor}20` }}>
              {scoreLabel} AI Visibility
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold mb-1 break-words line-clamp-2 leading-tight" title={pageTitle || url}>{pageTitle || url}</h1>
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center lg:justify-start gap-1 mb-3 min-w-0" style={{wordBreak:'break-all'}}>
            <ExternalLink className="w-3 h-3 shrink-0" />{url}
          </a>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{scoreSublabel}</p>

          {/* Category mini-scores */}
          {findings && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {CATEGORY_META.map((cat) => {
                const catData = findings[cat.key as keyof typeof findings] as CategoryResult;
                const catScore = catData?.score ?? 0;
                const catColor = getScoreColor(catScore);
                return (
                  <div key={cat.key} className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/30 border border-border/30">
                    <cat.icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] text-muted-foreground truncate">{cat.label}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${catScore}%`, backgroundColor: catColor }} />
                        </div>
                        <span className="text-[10px] font-bold shrink-0" style={{ color: catColor }}>{catScore}</span>
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
}: {
  contentIntelligence: ContentIntelligenceResult | null;
  isAuthenticated: boolean;
}) {
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null);

  // Loading state — CI is computed async
  if (!contentIntelligence) {
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
            <Lock className="w-3.5 h-3.5" /> Available on Pro plan
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 3. Top Priority Banner ───────────────────────────────────────────────────

function TopPriorityBanner({ topPriority, aiInsight }: { topPriority: string; aiInsight: string }) {
  const [showInsight, setShowInsight] = useState(false);
  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
      <div className="flex items-start gap-4">
        <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
          <Target className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">Your #1 Priority Fix</div>
          <p className="text-sm font-medium leading-relaxed">{topPriority}</p>
          {aiInsight && (
            <>
              <button
                onClick={() => setShowInsight(!showInsight)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-2"
              >
                <Lightbulb className="w-3 h-3" />
                {showInsight ? "Hide" : "Show"} AI analysis
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
        <h3 className="font-semibold mb-1">No issues found</h3>
        <p className="text-sm text-muted-foreground">This page passes all AI visibility checks.</p>
      </div>
    );
  }

  const critical = issues.filter((i) => i.status === "fail" && i.impact === "high");
  const others = issues.filter((i) => !(i.status === "fail" && i.impact === "high"));
  const visibleOthers = showAll ? others : others.slice(0, 4);

  const copyFix = (issue: typeof issues[0]) => {
    const text = issue.llmFix ?? issue.description;
    navigator.clipboard.writeText(text);
    toast.success("Fix instructions copied!");
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
                {isCritical ? "Critical" : issue.impact === "medium" ? "Important" : "Minor"}
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
                  <Lightbulb className="w-3 h-3 text-primary" /> How to fix
                </div>
                <p className="text-sm leading-relaxed">{issue.llmFix}</p>
              </div>
            )}
            {issue.llmImpact && (
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Expected result</div>
                <p className="text-xs text-muted-foreground leading-relaxed">{issue.llmImpact}</p>
              </div>
            )}
            {issue.llmCodeSnippet && (
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{issue.llmCodeSnippet.label}</div>
                <div className="rounded-lg overflow-hidden text-xs">
                  <SyntaxHighlighter
                    language={issue.llmCodeSnippet.language}
                    style={atomOneDark}
                    customStyle={{ margin: 0, padding: "12px", fontSize: "11px", borderRadius: "8px" }}
                  >
                    {issue.llmCodeSnippet.code}
                  </SyntaxHighlighter>
                </div>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => copyFix(issue)} className="gap-2 text-xs h-7">
              <Copy className="w-3 h-3" /> Copy fix instructions
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Issues & Fixes</h2>
      {critical.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="w-4 h-4 text-red-400" />
            <span className="text-sm font-medium text-red-400">Critical — fix these first</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">{critical.length}</span>
          </div>
          <div className="space-y-2">{critical.map(renderIssue)}</div>
        </div>
      )}
      {others.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium text-amber-400">Improvements</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">{others.length}</span>
          </div>
          <div className="space-y-2">{visibleOthers.map(renderIssue)}</div>
          {others.length > 4 && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="mt-3 w-full py-2.5 rounded-xl border border-border/50 text-xs text-muted-foreground hover:text-foreground hover:border-border transition-colors flex items-center justify-center gap-1.5"
            >
              <ChevronDown className="w-3.5 h-3.5" /> Show {others.length - 4} more
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
            <div className="text-sm font-semibold">What's already working</div>
            <div className="text-xs text-muted-foreground">{passes.length} checks passed</div>
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
            <div className="text-sm font-semibold">Share your AI Visibility Score</div>
            <div className="text-xs text-muted-foreground">Show your team or clients how your page performs in AI search</div>
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
            {copied ? "Copied!" : "Copy Link"}
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
            <div className="text-sm font-semibold">Track your progress</div>
            <div className="text-xs text-muted-foreground">See how your fixes improve AI visibility over time</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Free account required</span>
        </div>
      </div>
      <div className="relative h-24 mx-5 mb-5 rounded-xl bg-muted/20 overflow-hidden">
        <div className="absolute inset-0 flex items-end px-4 pb-3 gap-2 opacity-30">
          {[45, 52, 48, 61, 58, 67, 72, 75].map((v, i) => (
            <div key={i} className="flex-1 rounded-t bg-primary" style={{ height: `${v}%` }} />
          ))}
        </div>
        <div className="absolute inset-0 backdrop-blur-sm bg-background/40 flex flex-col items-center justify-center gap-2">
          <p className="text-xs text-muted-foreground">Sign in to track improvements</p>
          <button onClick={() => (window.location.href = getLoginUrl())} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
            <LogIn className="w-3 h-3" /> Sign In — Free
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 8. PLG Upgrade Banner ────────────────────────────────────────────────────

function PLGUpgradeBanner({ isAuthenticated, navigate }: { isAuthenticated: boolean; navigate: (path: string) => void }) {
  const plans = [
    { name: "Free", price: "$0", features: ["5 audits/month", "1 monitored page", "Full report & CI"], cta: null, highlight: false },
    { name: "Starter", price: "$39", features: ["50 audits/month", "10 monitored pages", "Weekly alerts", "PDF export"], cta: "Start Starter", highlight: false },
    { name: "Pro", price: "$99", features: ["200 audits/month", "50 monitored pages", "Competitor analysis", "Advanced CI"], cta: "Go Pro", highlight: true },
  ];
  return (
    <div className="rounded-2xl bg-gradient-to-br from-primary/8 via-violet-500/4 to-background border border-primary/20 p-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-bold mb-1">Ready to fix these issues — and stay fixed?</h3>
        <p className="text-sm text-muted-foreground">One-time audits find problems. Monitoring keeps you ahead of AI search changes.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {plans.map((plan) => (
          <div key={plan.name} className={`rounded-xl p-4 border ${plan.highlight ? "border-primary/40 bg-primary/8" : "border-border/50 bg-card"}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold">{plan.name}</span>
              <span className="text-sm font-black text-primary">{plan.price}<span className="text-[10px] font-normal text-muted-foreground">/mo</span></span>
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
              <div className="text-[10px] text-center text-muted-foreground py-1">{isAuthenticated ? "Your current plan" : "Current plan"}</div>
            )}
          </div>
        ))}
      </div>
      {!isAuthenticated && (
        <div className="text-center">
          <Button onClick={() => (window.location.href = getLoginUrl())} variant="ghost" size="sm" className="text-xs gap-1.5 text-muted-foreground">
            <LogIn className="w-3 h-3" /> Sign in first — it's free
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── AI Sandbox CTA ──────────────────────────────────────────────────────────
function AISandboxCTA({ url, navigate }: { url: string; navigate: (path: string) => void }) {
  return (
    <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/5 via-indigo-500/5 to-transparent p-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-violet-500/15 border border-violet-500/25 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-violet-400" />
            </div>
            <span className="text-xs font-semibold text-violet-400 uppercase tracking-wider">AI Sandbox Simulator</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/10 border border-violet-500/20 text-violet-400">BETA</span>
          </div>
          <h3 className="text-base font-bold text-foreground mb-1">
            Predict your citation probability in ChatGPT, Perplexity &amp; Google AIO
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Our engine simulates how AI search algorithms rank your page using reverse-engineered models (RRF, L3 XGBoost, Query Fan-Out). Test content changes before publishing with the What-If Editor.
          </p>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <Button
            onClick={() => navigate(`/sandbox?url=${encodeURIComponent(url)}`)}
            className="gap-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold"
          >
            <Sparkles className="w-4 h-4" />
            Run AI Simulation
          </Button>
          <p className="text-xs text-center text-muted-foreground">Free for all users</p>
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-violet-500/10 grid grid-cols-3 gap-3">
        {[
          { label: "ChatGPT", sublabel: "RRF k=60 model", color: "text-blue-400" },
          { label: "Perplexity", sublabel: "L3 XGBoost", color: "text-green-400" },
          { label: "Google AIO", sublabel: "Query Fan-Out", color: "text-orange-400" },
        ].map(({ label, sublabel, color }) => (
          <div key={label} className="text-center p-2 rounded-lg bg-white/3 border border-white/5">
            <div className={`text-xs font-bold ${color}`}>{label}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{sublabel}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Loading / Error ──────────────────────────────────────────────────────────────────────────────────
function LoadingState() {
  const steps = ["Checking crawler access", "Analyzing structured data", "Scanning content quality", "Evaluating trust signals", "Running AI analysis"];
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
          <h2 className="text-xl font-bold mb-2">Analyzing your page…</h2>
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
          <h2 className="text-xl font-bold mb-2">Audit Failed</h2>
          <p className="text-muted-foreground text-sm">{message}</p>
        </div>
        <Button onClick={() => navigate("/")} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Try Another URL
        </Button>
      </div>
    </div>
  );
}
