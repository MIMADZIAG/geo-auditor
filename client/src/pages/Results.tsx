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
  Lightbulb,
  Target,
} from "lucide-react";
import { useState } from "react";
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
} from "../../../shared/auditTypes";

export default function Results() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const auditId = parseInt(params.id ?? "0");

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
  const scoreLabel = getScoreLabel(overallScore);

  const llmResult: LLMRecommendationsResult | null =
    llmRecs && llmAiInsight
      ? { recommendations: llmRecs, aiInsight: llmAiInsight, topPriority: llmTopPriority ?? "" }
      : null;

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
          <div className="flex items-center gap-2 max-w-sm overflow-hidden">
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
        />

        {/* AI Insight Banner — shown when LLM result is available */}
        {llmResult && (
          <AIInsightBanner
            aiInsight={llmResult.aiInsight}
            topPriority={llmResult.topPriority}
          />
        )}

        {/* LLM Personalized Recommendations */}
        {llmResult && llmResult.recommendations.length > 0 && (
          <LLMRecommendationsPanel recommendations={llmResult.recommendations} />
        )}

        {/* Category Breakdown */}
        {findings && <CategoryBreakdown findings={findings} />}

        {/* Standard Recommendations */}
        {recommendations && recommendations.length > 0 && (
          <RecommendationsPanel recommendations={recommendations} />
        )}

        {/* Detailed Checks */}
        {findings && <DetailedChecks findings={findings} />}

        {/* CTA */}
        <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-violet-500/5 border border-primary/20 p-8 text-center">
          <h3 className="text-xl font-bold mb-2">Want to track improvements over time?</h3>
          <p className="text-muted-foreground text-sm mb-6">
            Create a free account to save audit history, monitor multiple pages, and get weekly AI
            visibility reports.
          </p>
          <Button
            onClick={() => navigate("/")}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
          >
            Audit Another Page
          </Button>
        </div>
      </main>
    </div>
  );
}

// ─── AI Insight Banner ────────────────────────────────────────────────────────

function AIInsightBanner({
  aiInsight,
  topPriority,
}: {
  aiInsight: string;
  topPriority: string;
}) {
  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/8 to-violet-500/5 p-6">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-primary uppercase tracking-wide">
              AI Analysis
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
              Personalized
            </span>
          </div>
          <p className="text-sm leading-relaxed text-foreground/90 mb-4">{aiInsight}</p>
          {topPriority && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-background/50 border border-border/40">
              <Target className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
                  Top Priority
                </span>
                <p className="text-xs text-foreground/80 mt-0.5 leading-relaxed">{topPriority}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── LLM Recommendations Panel ───────────────────────────────────────────────

function LLMRecommendationsPanel({ recommendations }: { recommendations: LLMRecommendation[] }) {
  const [expanded, setExpanded] = useState<string | null>(recommendations[0]?.id ?? null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyCode = (id: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    toast.success("Code copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyFix = (rec: LLMRecommendation) => {
    const text = `${rec.title}\n\n${rec.howToFix}${rec.codeSnippet ? `\n\n${rec.codeSnippet.code}` : ""}`;
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">AI-Powered Recommendations</h2>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full bg-primary/15 text-primary font-medium border border-primary/20">
          Personalized for this page
        </span>
      </div>

      <div className="space-y-3">
        {recommendations.map((rec) => (
          <div
            key={rec.id}
            className="rounded-2xl bg-card border border-primary/20 overflow-hidden hover:border-primary/40 transition-colors"
          >
            <button
              className="w-full flex items-center gap-4 p-5 text-left hover:bg-accent/20 transition-colors"
              onClick={() => setExpanded(expanded === rec.id ? null : rec.id)}
            >
              <PriorityBadge priority={rec.priority} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs text-muted-foreground">{rec.category}</span>
                  {rec.codeSnippet && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 font-medium">
                      {rec.codeSnippet.language.toUpperCase()} snippet
                    </span>
                  )}
                </div>
                <div className="font-semibold text-sm">{rec.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {rec.description}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Lightbulb className="w-3.5 h-3.5 text-primary/60" />
                {expanded === rec.id ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </button>

            {expanded === rec.id && (
              <div className="border-t border-border/40 px-5 pb-5 pt-4 space-y-4">
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    What to Do
                  </div>
                  <p className="text-sm leading-relaxed">{rec.howToFix}</p>
                </div>

                {rec.codeSnippet && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {rec.codeSnippet.label}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyCode(rec.id, rec.codeSnippet!.code)}
                        className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="w-3 h-3" />
                        {copiedId === rec.id ? "Copied!" : "Copy"}
                      </Button>
                    </div>
                    <div className="rounded-xl overflow-hidden border border-border/50 text-xs">
                      <SyntaxHighlighter
                        language={rec.codeSnippet.language === "json" ? "json" : rec.codeSnippet.language === "html" ? "html" : "plaintext"}
                        style={atomOneDark}
                        customStyle={{
                          margin: 0,
                          padding: "1rem",
                          background: "oklch(0.10 0.012 250)",
                          fontSize: "0.75rem",
                          lineHeight: "1.5",
                          maxHeight: "400px",
                          overflowY: "auto",
                        }}
                        wrapLongLines={true}
                      >
                        {rec.codeSnippet.code}
                      </SyntaxHighlighter>
                    </div>
                  </div>
                )}

                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Expected Impact
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{rec.impact}</p>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyFix(rec)}
                  className="gap-2 text-xs"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy Full Instructions
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
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
}: {
  score: number;
  scoreLabel: string;
  pageTitle: string;
  url: string;
  findings: AuditResult["findings"] | null;
}) {
  const scoreColor = getScoreColor(score);
  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="rounded-2xl bg-card border border-border/50 p-8">
      <div className="flex flex-col lg:flex-row items-center gap-8">
        {/* Score Ring */}
        <div className="shrink-0 relative">
          <svg width="140" height="140" viewBox="0 0 140 140" className="-rotate-90">
            <circle
              cx="70"
              cy="70"
              r="54"
              fill="none"
              stroke="oklch(0.22 0.015 250)"
              strokeWidth="10"
            />
            <circle
              cx="70"
              cy="70"
              r="54"
              fill="none"
              stroke={scoreColor}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: "stroke-dashoffset 1s ease-out" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-bold" style={{ color: scoreColor }}>
              {score}
            </span>
            <span className="text-xs text-muted-foreground mt-0.5">/ 100</span>
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 text-center lg:text-left">
          <div className="flex items-center justify-center lg:justify-start gap-2 mb-2">
            <span
              className="text-sm font-semibold px-3 py-1 rounded-full"
              style={{ color: scoreColor, background: `${scoreColor}20` }}
            >
              {scoreLabel} AI-Readiness
            </span>
          </div>
          <h1 className="text-xl font-bold mb-1 truncate">{pageTitle || url}</h1>
          <p className="text-sm text-muted-foreground mb-6 truncate">{url}</p>

          {/* Mini category scores */}
          {findings && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {CATEGORY_META.map((cat) => {
                const catData = findings[cat.key as keyof typeof findings] as CategoryResult;
                return (
                  <div key={cat.key} className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/40">
                    <cat.icon className="w-4 h-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[10px] text-muted-foreground truncate">{cat.label}</div>
                      <div
                        className="text-sm font-semibold"
                        style={{ color: getScoreColor(catData?.score ?? 0) }}
                      >
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
      <h2 className="text-lg font-semibold mb-4">Score Breakdown</h2>
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
                    <div className="text-xs text-muted-foreground">{cat.weight}% of total score</div>
                  </div>
                </div>
                <span className="text-2xl font-bold" style={{ color }}>
                  {score}
                </span>
              </div>
              {/* Progress bar */}
              <div className="h-2 bg-muted rounded-full overflow-hidden mb-3">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${score}%`, backgroundColor: color }}
                />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{catData?.summary}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Standard Recommendations Panel ──────────────────────────────────────────

function RecommendationsPanel({ recommendations }: { recommendations: Recommendation[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const copyFix = (rec: Recommendation) => {
    navigator.clipboard.writeText(`${rec.title}\n\n${rec.howToFix}`);
    toast.success("Copied to clipboard!");
  };

  const priorityCounts = {
    critical: recommendations.filter((r) => r.priority === "critical").length,
    high: recommendations.filter((r) => r.priority === "high").length,
    medium: recommendations.filter((r) => r.priority === "medium").length,
    low: recommendations.filter((r) => r.priority === "low").length,
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Technical Recommendations</h2>
        <div className="flex items-center gap-2 text-xs">
          {priorityCounts.critical > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-status-fail text-status-fail font-medium">
              {priorityCounts.critical} critical
            </span>
          )}
          {priorityCounts.high > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-status-warning text-status-warning font-medium">
              {priorityCounts.high} high
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {recommendations.map((rec) => (
          <div
            key={rec.id}
            className="rounded-2xl bg-card border border-border/50 overflow-hidden"
          >
            <button
              className="w-full flex items-center gap-4 p-5 text-left hover:bg-accent/20 transition-colors"
              onClick={() => setExpanded(expanded === rec.id ? null : rec.id)}
            >
              <PriorityBadge priority={rec.priority} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs text-muted-foreground">{rec.category}</span>
                </div>
                <div className="font-semibold text-sm">{rec.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">{rec.description}</div>
              </div>
              {expanded === rec.id ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
            </button>

            {expanded === rec.id && (
              <div className="px-5 pb-5 border-t border-border/40 pt-4 space-y-4">
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    How to Fix
                  </div>
                  <p className="text-sm leading-relaxed">{rec.howToFix}</p>
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Expected Impact
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{rec.impact}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyFix(rec)}
                  className="gap-2 text-xs"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy Fix Instructions
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Detailed Checks ──────────────────────────────────────────────────────────

function DetailedChecks({ findings }: { findings: AuditResult["findings"] }) {
  const [openCategory, setOpenCategory] = useState<string | null>(null);

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Detailed Checks</h2>
      <div className="space-y-3">
        {CATEGORY_META.map((cat) => {
          const catData = findings[cat.key as keyof typeof findings] as CategoryResult;
          const checks = catData?.checks ?? [];
          const passCount = checks.filter((c) => c.status === "pass").length;
          const isOpen = openCategory === cat.key;

          return (
            <div
              key={cat.key}
              className="rounded-2xl bg-card border border-border/50 overflow-hidden"
            >
              <button
                className="w-full flex items-center gap-4 p-5 text-left hover:bg-accent/20 transition-colors"
                onClick={() => setOpenCategory(isOpen ? null : cat.key)}
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <cat.icon className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-sm">{cat.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {passCount} / {checks.length} checks passed
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className="text-xl font-bold"
                    style={{ color: getScoreColor(catData?.score ?? 0) }}
                  >
                    {catData?.score ?? 0}
                  </span>
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-border/40">
                  {checks.map((check) => (
                    <CheckRow key={check.id} check={check} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CheckRow({ check }: { check: AuditCheck }) {
  const { icon: StatusIcon, colorClass } = STATUS_CONFIG[check.status];
  return (
    <div className="flex items-start gap-4 px-5 py-3.5 border-b border-border/20 last:border-0 hover:bg-accent/10 transition-colors">
      <StatusIcon className={`w-4 h-4 mt-0.5 shrink-0 ${colorClass}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium">{check.label}</span>
          <ImpactBadge impact={check.impact} />
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{check.description}</p>
      </div>
    </div>
  );
}

// ─── Helpers & Sub-components ─────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: Recommendation["priority"] }) {
  const config = {
    critical: { label: "Critical", classes: "bg-status-fail text-status-fail" },
    high: { label: "High", classes: "bg-status-warning text-status-warning" },
    medium: { label: "Medium", classes: "bg-blue-500/15 text-blue-400" },
    low: { label: "Low", classes: "bg-muted text-muted-foreground" },
  };
  const c = config[priority];
  return (
    <span
      className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${c.classes}`}
    >
      {c.label}
    </span>
  );
}

function ImpactBadge({ impact }: { impact: AuditCheck["impact"] }) {
  if (impact === "low") return null;
  const config = {
    high: "text-[9px] text-status-fail bg-status-fail px-1.5 py-0.5 rounded uppercase font-bold",
    medium:
      "text-[9px] text-status-warning bg-status-warning px-1.5 py-0.5 rounded uppercase font-bold",
    low: "",
  };
  return <span className={config[impact]}>{impact}</span>;
}

function LoadingState() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <Brain className="w-8 h-8 text-primary animate-pulse" />
        </div>
        <div>
          <h2 className="text-xl font-bold mb-2">Analyzing your page...</h2>
          <p className="text-muted-foreground text-sm">Running 40+ AI-readiness checks</p>
        </div>
        <div className="flex justify-center gap-3 pt-2">
          {["Technical", "Schema", "Content", "E-E-A-T", "AI Insight"].map((step, i) => (
            <div key={step} className="flex flex-col items-center gap-1">
              <div
                className="w-2 h-2 rounded-full bg-primary"
                style={{ animation: `pulse 1.5s ease-in-out ${i * 0.2}s infinite` }}
              />
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
          <h2 className="text-xl font-bold mb-2">Audit Failed</h2>
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

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pass: { icon: CheckCircle2, colorClass: "text-status-pass" },
  fail: { icon: XCircle, colorClass: "text-status-fail" },
  warning: { icon: AlertTriangle, colorClass: "text-status-warning" },
  info: { icon: Info, colorClass: "text-status-info" },
};

const CATEGORY_META = [
  { key: "technical", label: "Technical", icon: Shield, weight: 25 },
  { key: "structuredData", label: "Structured Data", icon: Code2, weight: 20 },
  { key: "contentStructure", label: "Content Structure", icon: FileText, weight: 25 },
  { key: "eeat", label: "E-E-A-T Signals", icon: Zap, weight: 15 },
  { key: "aiCrawlers", label: "AI Crawler Access", icon: Bot, weight: 10 },
  { key: "metaTags", label: "Meta Tags", icon: BarChart3, weight: 5 },
];

function getScoreLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  return "Poor";
}

function getScoreColor(score: number): string {
  if (score >= 80) return "oklch(0.72 0.18 145)";
  if (score >= 60) return "oklch(0.72 0.18 160)";
  if (score >= 40) return "oklch(0.78 0.18 75)";
  return "oklch(0.65 0.22 25)";
}
