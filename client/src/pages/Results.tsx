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
  ArrowRight,
  LogIn,
  Wrench,
  ChevronRight,
  Target,
  Lightbulb,
} from "lucide-react";
import { useState } from "react";
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
  ContentIntelligenceCheck,
} from "../../../shared/auditTypes";

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
  const overallScore = audit.overallScore ?? 0;
  const contentIntelligence = audit.contentIntelligence as unknown as ContentIntelligenceResult | null;
  const reportUrl = typeof window !== "undefined" ? `${window.location.origin}/report/${auditId}` : "";

  const llmResult: LLMRecommendationsResult | null =
    llmRecs && llmAiInsight
      ? { recommendations: llmRecs, aiInsight: llmAiInsight, topPriority: llmTopPriority ?? "" }
      : null;

  // Collect ALL issues (fail + warning) across all categories, sorted by impact
  const allIssues = collectIssues(findings);
  const criticalCount = allIssues.filter((i) => i.status === "fail" && i.impact === "high").length;
  const warningCount = allIssues.filter((i) => i.status === "warning" || (i.status === "fail" && i.impact !== "high")).length;
  const passCount = countPasses(findings);

  const handleShare = (platform: "linkedin" | "twitter" | "copy") => {
    const issueText = criticalCount > 0
      ? `Found ${criticalCount} critical issue${criticalCount > 1 ? "s" : ""} blocking AI visibility.`
      : "No critical issues found — well optimized for AI search.";
    const text = `${issueText} Full diagnostic by GEO-Auditor:`;
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
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/90 backdrop-blur-xl">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className="gap-2 text-muted-foreground hover:text-foreground"
            >
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
              <a
                href={audit.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground truncate hover:text-foreground transition-colors"
              >
                {audit.url}
              </a>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleShare("copy")}
              className="gap-1.5 text-xs"
            >
              <Share2 className="w-3.5 h-3.5" />
              Share
            </Button>
            {isAuthenticated ? (
              <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="gap-1.5 text-xs">
                <LayoutDashboard className="w-3.5 h-3.5" />
                Dashboard
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => (window.location.href = getLoginUrl())} className="gap-1.5 text-xs text-primary">
                <LogIn className="w-3.5 h-3.5" />
                Sign In
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container max-w-5xl mx-auto py-10 space-y-8">

        {/* ── Diagnostic Summary ── */}
        <DiagnosticSummary
          url={audit.url}
          pageTitle={audit.pageTitle ?? audit.url}
          criticalCount={criticalCount}
          warningCount={warningCount}
          passCount={passCount}
          overallScore={overallScore}
          findings={findings}
        />

        {/* ── Top Priority Fix (LLM) ── */}
        {llmResult?.topPriority && (
          <TopPriorityBanner topPriority={llmResult.topPriority} aiInsight={llmResult.aiInsight} />
        )}

        {/* ── Issues List (PageSpeed style) ── */}
        <IssuesList
          allIssues={allIssues}
          llmRecs={llmResult?.recommendations ?? null}
          recommendations={recommendations}
        />

        {/* ── Content Intelligence ── */}
        {contentIntelligence && (
          <ContentIntelligencePanel
            contentIntelligence={contentIntelligence}
            isAuthenticated={isAuthenticated}
          />
        )}

        {/* ── What's Working ── */}
        {findings && <PassingChecks findings={findings} />}

        {/* ── Share ── */}
        <SharePanel criticalCount={criticalCount} onShare={handleShare} reportUrl={reportUrl} />

        {/* ── PLG: Score History Teaser ── */}
        {!isAuthenticated && <ScoreHistoryTeaser />}

        {/* ── PLG: Upgrade CTA ── */}
        <PLGUpgradeBanner isAuthenticated={isAuthenticated} navigate={navigate} />

      </main>
    </div>
  );
}

// ─── Diagnostic Summary ───────────────────────────────────────────────────────

function DiagnosticSummary({
  url,
  pageTitle,
  criticalCount,
  warningCount,
  passCount,
  overallScore,
  findings,
}: {
  url: string;
  pageTitle: string;
  criticalCount: number;
  warningCount: number;
  passCount: number;
  overallScore: number;
  findings: AuditResult["findings"] | null;
}) {
  // Determine overall health status
  const status = criticalCount > 0 ? "issues" : warningCount > 2 ? "warnings" : "good";

  const statusConfig = {
    issues: {
      label: "Issues found",
      sublabel: `${criticalCount} critical issue${criticalCount !== 1 ? "s" : ""} need${criticalCount === 1 ? "s" : ""} your attention`,
      barColor: "bg-red-500",
      dotColor: "bg-red-500",
      textColor: "text-red-400",
    },
    warnings: {
      label: "Improvements available",
      sublabel: `${warningCount} areas can be improved for better AI visibility`,
      barColor: "bg-amber-500",
      dotColor: "bg-amber-500",
      textColor: "text-amber-400",
    },
    good: {
      label: "Well optimized",
      sublabel: "No critical issues found — keep it up",
      barColor: "bg-emerald-500",
      dotColor: "bg-emerald-500",
      textColor: "text-emerald-400",
    },
  };

  const cfg = statusConfig[status];

  return (
    <div className="rounded-2xl bg-card border border-border/50 overflow-hidden">
      {/* Top bar */}
      <div className="h-1 w-full bg-muted">
        <div
          className={`h-full ${cfg.barColor} transition-all duration-700`}
          style={{ width: `${overallScore}%` }}
        />
      </div>

      <div className="p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left: page info + status */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-2 h-2 rounded-full ${cfg.dotColor}`} />
              <span className={`text-sm font-semibold ${cfg.textColor}`}>{cfg.label}</span>
            </div>
            <h1 className="text-xl font-bold truncate mb-1">{pageTitle || url}</h1>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 truncate"
            >
              <ExternalLink className="w-3 h-3 shrink-0" />
              {url}
            </a>
            <p className="text-sm text-muted-foreground mt-3">{cfg.sublabel}</p>
          </div>

          {/* Right: issue counts */}
          <div className="flex items-center gap-4 lg:gap-6 shrink-0">
            <div className="text-center">
              <div className="text-3xl font-black text-red-400">{criticalCount}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Critical</div>
            </div>
            <div className="w-px h-10 bg-border" />
            <div className="text-center">
              <div className="text-3xl font-black text-amber-400">{warningCount}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Warnings</div>
            </div>
            <div className="w-px h-10 bg-border" />
            <div className="text-center">
              <div className="text-3xl font-black text-emerald-400">{passCount}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Passed</div>
            </div>
          </div>
        </div>

        {/* Category health bars — compact, like Core Web Vitals */}
        {findings && (
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {CATEGORY_META.map((cat) => {
              const catData = findings[cat.key as keyof typeof findings] as CategoryResult;
              const score = catData?.score ?? 0;
              const catStatus = score >= 70 ? "good" : score >= 40 ? "warn" : "fail";
              const barColor = catStatus === "good" ? "bg-emerald-500" : catStatus === "warn" ? "bg-amber-500" : "bg-red-500";
              const textColor = catStatus === "good" ? "text-emerald-400" : catStatus === "warn" ? "text-amber-400" : "text-red-400";
              return (
                <div key={cat.key} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <cat.icon className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground truncate">{cat.label}</span>
                    </div>
                    <span className={`text-[10px] font-bold ${textColor}`}>{score}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${barColor} transition-all duration-700`} style={{ width: `${score}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Top Priority Banner ──────────────────────────────────────────────────────

function TopPriorityBanner({ topPriority, aiInsight }: { topPriority: string; aiInsight: string }) {
  const [showInsight, setShowInsight] = useState(false);
  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
      <div className="flex items-start gap-4">
        <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
          <Target className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">Top Priority Fix</div>
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

// ─── Issues List ──────────────────────────────────────────────────────────────

interface FlatIssue {
  id: string;
  label: string;
  status: "fail" | "warning";
  impact: "high" | "medium" | "low";
  description: string;
  category: string;
  llmFix?: string;
  llmCodeSnippet?: LLMRecommendation["codeSnippet"];
  standardFix?: string;
}

function IssuesList({
  allIssues,
  llmRecs,
  recommendations,
}: {
  allIssues: FlatIssue[];
  llmRecs: LLMRecommendation[] | null;
  recommendations: Recommendation[];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  if (allIssues.length === 0) {
    return (
      <div className="rounded-2xl bg-card border border-border/50 p-8 text-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
        <h3 className="font-semibold mb-1">No issues found</h3>
        <p className="text-sm text-muted-foreground">This page passes all AI visibility checks. Well done!</p>
      </div>
    );
  }

  // Enrich issues with LLM fixes
  const enriched = allIssues.map((issue) => {
    const llmRec = llmRecs?.find((r) =>
      r.title.toLowerCase().includes(issue.label.toLowerCase().slice(0, 20)) ||
      issue.label.toLowerCase().includes(r.title.toLowerCase().slice(0, 20))
    );
    const stdRec = recommendations.find((r) =>
      r.title.toLowerCase().includes(issue.label.toLowerCase().slice(0, 20)) ||
      issue.label.toLowerCase().includes(r.title.toLowerCase().slice(0, 20))
    );
    return {
      ...issue,
      llmFix: llmRec?.howToFix ?? stdRec?.howToFix,
      llmCodeSnippet: llmRec?.codeSnippet,
      llmImpact: llmRec?.impact ?? stdRec?.impact,
    };
  });

  const critical = enriched.filter((i) => i.status === "fail" && i.impact === "high");
  const others = enriched.filter((i) => !(i.status === "fail" && i.impact === "high"));
  const visibleOthers = showAll ? others : others.slice(0, 3);

  const copyFix = (issue: typeof enriched[0]) => {
    const text = issue.llmFix ?? issue.description;
    navigator.clipboard.writeText(text);
    toast.success("Fix instructions copied!");
  };

  const renderIssue = (issue: typeof enriched[0]) => {
    const isOpen = expanded === issue.id;
    const isCritical = issue.status === "fail" && issue.impact === "high";
    const isWarning = issue.status === "warning" || (issue.status === "fail" && issue.impact !== "high");

    return (
      <div key={issue.id} className={`rounded-xl border overflow-hidden transition-colors ${isCritical ? "border-red-500/30 bg-red-500/3" : "border-amber-500/20 bg-amber-500/3"}`}>
        <button
          className="w-full flex items-start gap-4 p-4 text-left hover:bg-white/3 transition-colors"
          onClick={() => setExpanded(isOpen ? null : issue.id)}
        >
          <div className="mt-0.5 shrink-0">
            {isCritical ? (
              <XCircle className="w-4 h-4 text-red-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span className="text-sm font-medium">{issue.label}</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${isCritical ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"}`}>
                {isCritical ? "Critical" : issue.impact === "medium" ? "High" : "Medium"}
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{issue.category}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{issue.description}</p>
            {!isOpen && issue.llmFix && (
              <p className="text-xs text-primary mt-1 flex items-center gap-1">
                <ChevronRight className="w-3 h-3" />
                {issue.llmFix.slice(0, 80)}{issue.llmFix.length > 80 ? "…" : ""}
              </p>
            )}
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
                  <Wrench className="w-3 h-3" /> How to fix
                </div>
                <p className="text-sm leading-relaxed">{issue.llmFix}</p>
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyFix(issue)}
              className="gap-2 text-xs h-7"
            >
              <Copy className="w-3 h-3" />
              Copy fix instructions
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Critical issues */}
      {critical.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <XCircle className="w-4 h-4 text-red-400" />
            <h2 className="text-base font-semibold">Critical issues</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 font-medium">{critical.length}</span>
          </div>
          <div className="space-y-2">
            {critical.map(renderIssue)}
          </div>
        </div>
      )}

      {/* Warnings & improvements */}
      {others.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h2 className="text-base font-semibold">Improvements</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-medium">{others.length}</span>
          </div>
          <div className="space-y-2">
            {visibleOthers.map(renderIssue)}
          </div>
          {others.length > 3 && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="mt-3 w-full py-2.5 rounded-xl border border-border/50 text-xs text-muted-foreground hover:text-foreground hover:border-border transition-colors flex items-center justify-center gap-1.5"
            >
              <ChevronDown className="w-3.5 h-3.5" />
              Show {others.length - 3} more improvements
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Content Intelligence Panel ───────────────────────────────────────────────

function ContentIntelligencePanel({
  contentIntelligence,
  isAuthenticated,
}: {
  contentIntelligence: ContentIntelligenceResult | null;
  isAuthenticated: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!contentIntelligence) return null;

  const { checks, citeabilityScore, summary, topOpportunity, pageTopics } = contentIntelligence;

  const scoreColor =
    citeabilityScore >= 70 ? "text-emerald-400" : citeabilityScore >= 45 ? "text-amber-400" : "text-red-400";
  const barColor =
    citeabilityScore >= 70 ? "bg-emerald-500" : citeabilityScore >= 45 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="rounded-2xl bg-card border border-border/50 overflow-hidden">
      <div className="p-5 border-b border-border/40">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <Brain className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">Content Intelligence</h2>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 font-bold uppercase">AI-Powered</span>
              </div>
              <p className="text-xs text-muted-foreground">How likely AI models are to cite your content</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className={`text-2xl font-black ${scoreColor}`}>{citeabilityScore}</div>
            <div className="text-[10px] text-muted-foreground">Citeability</div>
          </div>
        </div>
        <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${barColor} transition-all duration-700`} style={{ width: `${citeabilityScore}%` }} />
        </div>
      </div>

      {/* Top opportunity */}
      {topOpportunity && (
        <div className="px-5 py-3 bg-violet-500/5 border-b border-border/30 flex items-start gap-2">
          <Target className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed"><span className="text-foreground font-medium">Top opportunity: </span>{topOpportunity}</p>
        </div>
      )}

      {/* Checks */}
      <div className="divide-y divide-border/20">
        {checks.map((check) => {
          const isOpen = expanded === check.id;
          const checkColor = check.score >= 70 ? "text-emerald-400" : check.score >= 45 ? "text-amber-400" : "text-red-400";
          const checkBarColor = check.score >= 70 ? "bg-emerald-500" : check.score >= 45 ? "bg-amber-500" : "bg-red-500";
          return (
            <div key={check.id}>
              <button
                className="w-full flex items-center gap-4 px-5 py-3.5 text-left hover:bg-muted/10 transition-colors"
                onClick={() => setExpanded(isOpen ? null : check.id)}
              >
                <div className="w-8 h-8 rounded-lg bg-muted/30 flex items-center justify-center shrink-0">
                  <span className={`text-xs font-bold ${checkColor}`}>{check.score}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium mb-1">{check.label}</div>
                  <div className="h-1 bg-muted rounded-full overflow-hidden w-full max-w-xs">
                    <div className={`h-full rounded-full ${checkBarColor}`} style={{ width: `${check.score}%` }} />
                  </div>
                </div>
                {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
              </button>
              {isOpen && (
                <div className="px-5 pb-4 pt-1 space-y-2 bg-muted/5">
                  <p className="text-xs text-muted-foreground leading-relaxed">{check.description}</p>
                  {check.recommendation && (
                    <div className="flex items-start gap-2">
                      <ChevronRight className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                      <p className="text-xs text-primary leading-relaxed">{check.recommendation}</p>
                    </div>
                  )}
                  {check.examples && check.examples.length > 0 && (
                    <div className="space-y-1 pt-1">
                      {check.examples.map((ex, i) => (
                        <div key={i} className="text-[10px] text-muted-foreground bg-muted/30 rounded px-2.5 py-1.5 font-mono">{ex}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Topics */}
      {pageTopics && pageTopics.length > 0 && (
        <div className="px-5 py-3 border-t border-border/30 flex flex-wrap gap-1.5">
          <span className="text-[10px] text-muted-foreground mr-1">Topics:</span>
          {pageTopics.map((t) => (
            <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{t}</span>
          ))}
        </div>
      )}

      {/* PLG nudge for non-auth */}
      {!isAuthenticated && (
        <div className="px-5 py-3 border-t border-border/30 bg-primary/3 flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            <span className="text-foreground font-medium">Sign in free</span> to track your Citeability Score over time and get alerts when it drops.
          </p>
          <Button size="sm" onClick={() => (window.location.href = getLoginUrl())} className="gap-1.5 text-xs shrink-0">
            <LogIn className="w-3 h-3" />
            Sign In
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Passing Checks ───────────────────────────────────────────────────────────

function PassingChecks({ findings }: { findings: AuditResult["findings"] }) {
  const [open, setOpen] = useState(false);

  const passes: { label: string; category: string }[] = [];
  for (const [catKey, catData] of Object.entries(findings)) {
    const cat = CATEGORY_META.find((c) => c.key === catKey);
    if (!cat) continue;
    const checks = (catData as CategoryResult).checks ?? [];
    for (const check of checks) {
      if (check.status === "pass") {
        passes.push({ label: check.label, category: cat.label });
      }
    }
  }

  if (passes.length === 0) return null;

  return (
    <div className="rounded-2xl bg-card border border-border/50 overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-5 hover:bg-muted/10 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold">What's working</div>
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

// ─── Share Panel ──────────────────────────────────────────────────────────────

function SharePanel({
  criticalCount,
  onShare,
  reportUrl,
}: {
  criticalCount: number;
  onShare: (platform: "linkedin" | "twitter" | "copy") => void;
  reportUrl: string;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    onShare("copy");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="rounded-2xl bg-card border border-border/50 p-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Share2 className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="text-sm font-semibold">Share this diagnostic</div>
            <div className="text-xs text-muted-foreground">
              {criticalCount > 0
                ? `Show your team the ${criticalCount} issue${criticalCount > 1 ? "s" : ""} that need fixing`
                : "Share your clean diagnostic report"}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            onClick={() => onShare("linkedin")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors border border-blue-500/20"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
            LinkedIn
          </button>
          <button
            onClick={() => onShare("twitter")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 transition-colors border border-sky-500/20"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            X
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted/50 text-muted-foreground hover:bg-muted transition-colors border border-border/50"
          >
            <Copy className="w-3.5 h-3.5" />
            {copied ? "Copied!" : "Copy Link"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Score History Teaser ─────────────────────────────────────────────────────

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
          <button
            onClick={() => (window.location.href = getLoginUrl())}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <LogIn className="w-3 h-3" />
            Sign In — Free
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PLG Upgrade Banner ───────────────────────────────────────────────────────

function PLGUpgradeBanner({
  isAuthenticated,
  navigate,
}: {
  isAuthenticated: boolean;
  navigate: (path: string) => void;
}) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-violet-500/5 to-indigo-500/5 border border-primary/20 p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          {isAuthenticated ? (
            <>
              <h3 className="font-semibold mb-1">Monitor this page automatically</h3>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-400" />Weekly re-audits</span>
                <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-400" />Score change alerts</span>
                <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-400" />Track improvements over time</span>
              </div>
            </>
          ) : (
            <>
              <h3 className="font-semibold mb-1">Want to track improvements over time?</h3>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-400" />Free account — 1 monitored page</span>
                <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-400" />Score history & weekly alerts</span>
                <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-400" />5 audits/month</span>
              </div>
            </>
          )}
        </div>
        {isAuthenticated ? (
          <Button onClick={() => navigate("/dashboard")} className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0 gap-2">
            <LayoutDashboard className="w-3.5 h-3.5" />
            Go to Dashboard
          </Button>
        ) : (
          <Button onClick={() => (window.location.href = getLoginUrl())} className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0 gap-2">
            <LogIn className="w-3.5 h-3.5" />
            Sign In — Free
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Loading / Error ──────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <Brain className="w-8 h-8 text-primary animate-pulse" />
        </div>
        <div>
          <h2 className="text-xl font-bold mb-2">Scanning your page...</h2>
          <p className="text-muted-foreground text-sm">Running 40+ AI visibility checks</p>
        </div>
        <div className="flex justify-center gap-3 pt-2">
          {["Crawlers", "Schema", "Content", "E-E-A-T", "AI Analysis"].map((step, i) => (
            <div key={step} className="flex flex-col items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-primary" style={{ animation: `pulse 1.5s ease-in-out ${i * 0.2}s infinite` }} />
              <span className="text-[10px] text-muted-foreground">{step}</span>
            </div>
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
          <h2 className="text-xl font-bold mb-2">Diagnostic Failed</h2>
          <p className="text-muted-foreground text-sm">{message}</p>
        </div>
        <Button onClick={() => navigate("/")} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Try Another URL
        </Button>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_META = [
  { key: "technical", label: "Technical", icon: Shield },
  { key: "structuredData", label: "Schema", icon: Code2 },
  { key: "contentStructure", label: "Content", icon: FileText },
  { key: "eeat", label: "E-E-A-T", icon: Zap },
  { key: "aiCrawlers", label: "AI Crawlers", icon: Bot },
  { key: "metaTags", label: "Meta Tags", icon: BarChart3 },
];

const CATEGORY_LABELS: Record<string, string> = {
  technical: "Technical",
  structuredData: "Structured Data",
  contentStructure: "Content Structure",
  eeat: "E-E-A-T",
  aiCrawlers: "AI Crawlers",
  metaTags: "Meta Tags",
};

function collectIssues(findings: AuditResult["findings"] | null): FlatIssue[] {
  if (!findings) return [];
  const issues: FlatIssue[] = [];
  for (const [catKey, catData] of Object.entries(findings)) {
    const checks = (catData as CategoryResult).checks ?? [];
    for (const check of checks) {
      if (check.status === "fail" || check.status === "warning") {
        issues.push({
          id: `${catKey}-${check.id}`,
          label: check.label,
          status: check.status as "fail" | "warning",
          impact: check.impact,
          description: check.description,
          category: CATEGORY_LABELS[catKey] ?? catKey,
        });
      }
    }
  }
  // Sort: critical (fail+high) first, then by impact
  const impactOrder = { high: 0, medium: 1, low: 2 };
  return issues.sort((a, b) => {
    const aScore = (a.status === "fail" ? 0 : 10) + impactOrder[a.impact];
    const bScore = (b.status === "fail" ? 0 : 10) + impactOrder[b.impact];
    return aScore - bScore;
  });
}

function countPasses(findings: AuditResult["findings"] | null): number {
  if (!findings) return 0;
  let count = 0;
  for (const catData of Object.values(findings)) {
    const checks = (catData as CategoryResult).checks ?? [];
    count += checks.filter((c) => c.status === "pass").length;
  }
  return count;
}
