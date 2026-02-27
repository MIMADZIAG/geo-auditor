import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, ArrowRight, Share2, RefreshCw, ChevronDown, ChevronUp,
  Search, Shield, Brain, CheckCircle2, XCircle, AlertTriangle, Info,
  Zap, Bot, Globe, Lock, Sparkles, Copy, Twitter, Linkedin, ExternalLink,
  TrendingUp, LayoutDashboard, LogIn, Mail, Star,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";
import type { AuditFindings, AuditCheck, ContentIntelligenceResult, LLMRecommendationsResult } from "@shared/auditTypes";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditData {
  id: number;
  url: string;
  status: string;
  overallScore: number | null;
  technicalScore: number | null;
  structuredDataScore: number | null;
  contentStructureScore: number | null;
  eeatScore: number | null;
  aiCrawlerScore: number | null;
  metaTagsScore: number | null;
  findings: AuditFindings | null;
  llmRecommendations: LLMRecommendationsResult["recommendations"] | null;
  llmAiInsight: string | null;
  llmTopPriority: string | null;
  contentIntelligence: ContentIntelligenceResult | null;
  contentIntelligenceScore: number | null;
  citeabilityScore: number | null;
  pageTitle: string | null;
  errorMessage: string | null;
  createdAt: Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGrade(score: number): { letter: string; color: string; bg: string; label: string } {
  if (score >= 85) return { letter: "A", color: "oklch(0.72 0.18 145)", bg: "oklch(0.72 0.18 145 / 0.12)", label: "Excellent" };
  if (score >= 70) return { letter: "B", color: "oklch(0.72 0.18 200)", bg: "oklch(0.72 0.18 200 / 0.12)", label: "Good" };
  if (score >= 50) return { letter: "C", color: "oklch(0.78 0.18 75)", bg: "oklch(0.78 0.18 75 / 0.12)", label: "Fair" };
  if (score >= 30) return { letter: "D", color: "oklch(0.72 0.18 30)", bg: "oklch(0.72 0.18 30 / 0.12)", label: "Poor" };
  return { letter: "F", color: "oklch(0.65 0.22 25)", bg: "oklch(0.65 0.22 25 / 0.12)", label: "Critical" };
}

function getPillarScore(audit: AuditData): { findability: number; trust: number; answerability: number } {
  const t = audit.technicalScore ?? 0;
  const ac = audit.aiCrawlerScore ?? 0;
  const mt = audit.metaTagsScore ?? 0;
  const ee = audit.eeatScore ?? 0;
  const sd = audit.structuredDataScore ?? 0;
  const cs = audit.contentStructureScore ?? 0;
  const ci = audit.contentIntelligenceScore ?? cs;
  return {
    findability: Math.round(t * 0.4 + ac * 0.35 + mt * 0.25),
    trust: Math.round(ee * 0.55 + sd * 0.45),
    answerability: Math.round(cs * 0.45 + ci * 0.55),
  };
}

function getTopIssues(audit: AuditData): Array<{ label: string; fix: string; pillar: string; color: string }> {
  const issues: Array<{ label: string; fix: string; pillar: string; color: string; priority: number }> = [];
  const findings = audit.findings;
  if (!findings) return [];

  const addIssues = (checks: AuditCheck[], pillar: string, color: string) => {
    checks.filter((c) => c.status === "fail" && c.impact === "high").slice(0, 2)
      .forEach((c) => issues.push({ label: humanLabel(c.id, c.label), fix: c.description, pillar, color, priority: 3 }));
    checks.filter((c) => c.status === "fail" && c.impact === "medium").slice(0, 1)
      .forEach((c) => issues.push({ label: humanLabel(c.id, c.label), fix: c.description, pillar, color, priority: 2 }));
  };

  addIssues(findings.aiCrawlers?.checks ?? [], "Findability", "oklch(0.72 0.18 200)");
  addIssues(findings.technical?.checks ?? [], "Findability", "oklch(0.72 0.18 200)");
  addIssues(findings.eeat?.checks ?? [], "Trustworthiness", "oklch(0.72 0.18 145)");
  addIssues(findings.structuredData?.checks ?? [], "Trustworthiness", "oklch(0.72 0.18 145)");
  addIssues(findings.contentStructure?.checks ?? [], "Answerability", "oklch(0.72 0.18 280)");

  return issues.sort((a, b) => b.priority - a.priority).slice(0, 3).map(({ priority: _p, ...rest }) => rest);
}

function humanLabel(id: string, label: string): string {
  const map: Record<string, string> = {
    robots_txt: "Robots.txt blocks AI crawlers",
    noindex: "Page is set to noindex",
    https: "Not using HTTPS",
    canonical: "Missing canonical URL",
    gptbot_allowed: "ChatGPT can't crawl your page",
    perplexitybot_allowed: "Perplexity can't crawl your page",
    claudebot_allowed: "Claude can't crawl your page",
    google_extended_allowed: "Google AI can't crawl your page",
    author_present: "No author information found",
    about_page: "No About page detected",
    contact_page: "No Contact page detected",
    faq_section: "No FAQ section found",
    tldr_section: "No summary / TL;DR section",
    heading_structure: "Poor heading structure",
    faq_schema: "Missing FAQ schema markup",
    product_schema: "Missing Product schema markup",
    article_schema: "Missing Article schema markup",
    organization_schema: "Missing Organization schema",
    meta_title: "Missing page title",
    meta_description: "Missing meta description",
    og_tags: "Missing social sharing tags",
  };
  return map[id] ?? label;
}

// ─── Animated Score Ring ──────────────────────────────────────────────────────

function AnimatedScoreRing({ score, size = 140, animate = true }: { score: number; size?: number; animate?: boolean }) {
  const [displayScore, setDisplayScore] = useState(animate ? 0 : score);
  const [progress, setProgress] = useState(animate ? 0 : score / 100);
  const grade = getGrade(displayScore);
  const r = size / 2 - 10;
  const circumference = 2 * Math.PI * r;

  useEffect(() => {
    if (!animate) return;
    const duration = 1800;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const p = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplayScore(Math.round(eased * score));
      setProgress((eased * score) / 100);
      if (p < 1) requestAnimationFrame(tick);
    };
    const timeout = setTimeout(() => requestAnimationFrame(tick), 400);
    return () => clearTimeout(timeout);
  }, [score, animate]);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="oklch(0.18 0.015 250)" strokeWidth="8" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={grade.color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-black text-white leading-none">{displayScore}</span>
        <span className="text-xs text-slate-400 mt-0.5">/ 100</span>
      </div>
    </div>
  );
}

// ─── Pillar Card ──────────────────────────────────────────────────────────────

function PillarCard({
  icon: Icon, label, score, desc, color, checks, expanded, onToggle,
}: {
  icon: React.ElementType; label: string; score: number; desc: string; color: string;
  checks: AuditCheck[]; expanded: boolean; onToggle: () => void;
}) {
  const fails = checks.filter((c) => c.status === "fail").length;
  const passes = checks.filter((c) => c.status === "pass").length;
  const grade = getGrade(score);

  return (
    <div className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden">
      <button onClick={onToggle} className="w-full p-5 flex items-center gap-4 hover:bg-white/3 transition-colors text-left">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}20` }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-white">{label}</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ backgroundColor: grade.bg, color: grade.color }}>
              {grade.letter}
            </span>
          </div>
          <div className="text-xs text-slate-400">{desc}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xl font-black" style={{ color }}>{score}</div>
          <div className="text-xs text-slate-500">{passes}✓ {fails}✗</div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-white/8 p-5 space-y-2">
          {checks.map((check) => {
            const statusIcon =
              check.status === "pass" ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> :
              check.status === "fail" ? <XCircle className="w-4 h-4 text-red-400 shrink-0" /> :
              check.status === "warning" ? <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" /> :
              <Info className="w-4 h-4 text-blue-400 shrink-0" />;
            return (
              <div key={check.id} className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0">
                {statusIcon}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-white">{humanLabel(check.id, check.label)}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{check.description}</div>
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0 border-white/10"
                  style={{ color: check.impact === "high" ? "oklch(0.65 0.22 25)" : check.impact === "medium" ? "oklch(0.78 0.18 75)" : "oklch(0.72 0.18 200)" }}>
                  {check.impact}
                </Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Email Gate ───────────────────────────────────────────────────────────────

function EmailGate({ auditId, onUnlock }: { auditId: number; onUnlock: () => void }) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const captureEmail = trpc.audit.captureEmail.useMutation({
    onSuccess: () => { setSubmitted(true); setTimeout(onUnlock, 800); },
    onError: (err) => toast.error(err.message),
  });

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
          <CheckCircle2 className="w-6 h-6 text-emerald-400" />
        </div>
        <div className="text-sm font-semibold text-white">Unlocking your full report...</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-b from-violet-500/8 to-transparent p-6 text-center">
      <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center mx-auto mb-4">
        <Mail className="w-5 h-5 text-violet-400" />
      </div>
      <h3 className="text-base font-bold text-white mb-2">Get your full AI improvement plan</h3>
      <p className="text-xs text-slate-400 mb-5 leading-relaxed">
        Enter your email to unlock the complete 40-check report, AI-powered recommendations, and your personalized action plan. Free, no spam.
      </p>
      <form
        onSubmit={(e) => { e.preventDefault(); if (!email.trim()) return; captureEmail.mutate({ email: email.trim(), auditId, source: "results_gate" }); }}
        className="flex gap-2 max-w-sm mx-auto"
      >
        <Input
          type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className="bg-white/8 border-white/15 text-white placeholder:text-slate-500 text-sm"
          required
        />
        <Button type="submit" disabled={captureEmail.isPending} className="bg-violet-600 hover:bg-violet-500 text-white shrink-0 gap-1.5">
          {captureEmail.isPending
            ? <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            : <><span>Unlock</span><ArrowRight className="w-3.5 h-3.5" /></>}
        </Button>
      </form>
      <p className="text-[10px] text-slate-600 mt-3">No spam. Unsubscribe anytime.</p>
    </div>
  );
}

// ─── Share Section ────────────────────────────────────────────────────────────

function ShareSection({ audit, domain }: { audit: AuditData; domain: string }) {
  const score = audit.overallScore ?? 0;
  const grade = getGrade(score);
  const reportUrl = `${window.location.origin}/report/${audit.id}`;
  const shareText = `My page "${domain}" scored ${score}/100 (Grade ${grade.letter}) for AI Search visibility. Is your page invisible to ChatGPT & Perplexity? Check for free →`;

  const copyLink = () => { navigator.clipboard.writeText(reportUrl); toast.success("Report link copied!"); };
  const shareLinkedIn = () => window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(reportUrl)}`, "_blank");
  const shareTwitter = () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(reportUrl)}`, "_blank");

  return (
    <div className="rounded-2xl border border-white/8 bg-white/3 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Share2 className="w-4 h-4 text-violet-400" />
        <span className="text-sm font-semibold text-white">Share your score</span>
      </div>
      <div className="rounded-xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-800 p-4 mb-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-20 h-20 rounded-full blur-2xl" style={{ backgroundColor: `${grade.color}25` }} />
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] text-slate-500 mb-0.5">AI Search Report Card</div>
            <div className="text-xs font-semibold text-white truncate max-w-[160px]">{domain}</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black" style={{ color: grade.color }}>{score}</div>
            <div className="text-xs font-bold" style={{ color: grade.color }}>Grade {grade.letter}</div>
          </div>
        </div>
        <div className="mt-2 text-[9px] text-slate-600">GEO-Auditor.com</div>
      </div>
      <div className="flex gap-2">
        <Button onClick={shareLinkedIn} size="sm" variant="ghost" className="flex-1 bg-[#0A66C2]/15 hover:bg-[#0A66C2]/25 text-[#0A66C2] border border-[#0A66C2]/30 gap-1.5 text-xs">
          <Linkedin className="w-3.5 h-3.5" /> LinkedIn
        </Button>
        <Button onClick={shareTwitter} size="sm" variant="ghost" className="flex-1 bg-white/5 hover:bg-white/10 text-white border border-white/10 gap-1.5 text-xs">
          <Twitter className="w-3.5 h-3.5" /> X / Twitter
        </Button>
        <Button onClick={copyLink} size="sm" variant="ghost" className="bg-white/5 hover:bg-white/10 text-slate-400 border border-white/10">
          <Copy className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── LLM Recommendations ─────────────────────────────────────────────────────

function LLMRecommendationsSection({ recommendations, topPriority }: {
  recommendations: LLMRecommendationsResult["recommendations"];
  topPriority?: string | null;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const priorityColors: Record<string, string> = {
    critical: "oklch(0.65 0.22 25)",
    high: "oklch(0.72 0.18 30)",
    medium: "oklch(0.78 0.18 75)",
    low: "oklch(0.72 0.18 200)",
  };

  return (
    <div className="space-y-3">
      {topPriority && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-4 flex items-start gap-3">
          <Star className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-semibold text-amber-300 mb-0.5">Top Priority</div>
            <div className="text-xs text-slate-300">{topPriority}</div>
          </div>
        </div>
      )}
      {recommendations.slice(0, 5).map((rec) => (
        <div key={rec.id} className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
          <button
            onClick={() => setExpanded(expanded === rec.id ? null : rec.id)}
            className="w-full p-4 flex items-start gap-3 hover:bg-white/3 transition-colors text-left"
          >
            <div className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: priorityColors[rec.priority] ?? "oklch(0.72 0.18 200)" }} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-white">{rec.title}</div>
              <div className="text-xs text-slate-400 mt-0.5 line-clamp-2">{rec.description}</div>
            </div>
            <Badge variant="outline" className="text-[10px] shrink-0 border-white/10" style={{ color: priorityColors[rec.priority] }}>
              {rec.priority}
            </Badge>
            {expanded === rec.id ? <ChevronUp className="w-3.5 h-3.5 text-slate-500 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
          </button>
          {expanded === rec.id && (
            <div className="border-t border-white/8 p-4 space-y-3">
              <div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">How to fix</div>
                <div className="text-xs text-slate-300 leading-relaxed">{rec.howToFix}</div>
              </div>
              {rec.codeSnippet && (
                <div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">{rec.codeSnippet.label}</div>
                  <pre className="text-[10px] bg-black/40 rounded-lg p-3 overflow-x-auto text-emerald-300 leading-relaxed whitespace-pre-wrap">
                    {rec.codeSnippet.code}
                  </pre>
                </div>
              )}
              <div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Expected impact</div>
                <div className="text-xs text-slate-400">{rec.impact}</div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main Results Page ────────────────────────────────────────────────────────

export default function Results() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const [fullReportUnlocked, setFullReportUnlocked] = useState(false);
  const [expandedPillar, setExpandedPillar] = useState<string | null>(null);
  const [scoreAnimated, setScoreAnimated] = useState(false);

  const auditId = parseInt(id ?? "0", 10);

  const { data: audit, isLoading, error } = trpc.audit.getById.useQuery(
    { id: auditId },
    {
      enabled: !!auditId,
      refetchInterval: (query) => {
        const data = query.state.data as AuditData | undefined;
        if (!data) return 2000;
        return data.status === "pending" || data.status === "running" ? 2000 : false;
      },
    }
  );

  useEffect(() => {
    if ((audit as unknown as AuditData)?.status === "completed" && !scoreAnimated) {
      setScoreAnimated(true);
    }
  }, [(audit as unknown as AuditData)?.status, scoreAnimated]);

  useEffect(() => {
    if (isAuthenticated) setFullReportUnlocked(true);
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[oklch(0.08_0.015_250)] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-2 border-violet-500/30 border-t-violet-500 animate-spin mx-auto mb-4" />
          <div className="text-sm text-slate-400">Loading audit...</div>
        </div>
      </div>
    );
  }

  if (error || !audit) {
    return (
      <div className="min-h-screen bg-[oklch(0.08_0.015_250)] flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-white mb-2">Audit not found</h2>
          <p className="text-sm text-slate-400 mb-6">This audit may have expired or doesn't exist.</p>
          <Button onClick={() => navigate("/")} className="bg-violet-600 hover:bg-violet-500 text-white gap-2">
            <ArrowLeft className="w-4 h-4" /> Run New Audit
          </Button>
        </div>
      </div>
    );
  }

  const typedAudit = audit as unknown as AuditData;

  if (typedAudit.status === "pending" || typedAudit.status === "running") {
    const runningSteps = [
      { label: "Fetching page content", done: true },
      { label: "Checking AI crawler access", done: typedAudit.status === "running" },
      { label: "Analyzing content structure", done: false },
      { label: "Evaluating trust signals", done: false },
      { label: "Running AI content analysis", done: false },
      { label: "Generating recommendations", done: false },
    ];
    const doneCount = runningSteps.filter((s) => s.done).length;
    return (
      <div className="min-h-screen bg-[oklch(0.08_0.015_250)] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center mx-auto mb-6">
            <Bot className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-black text-white mb-2">Analyzing your page...</h2>
          <p className="text-sm text-slate-400 mb-8">Running 40+ AI visibility checks. This takes about 30 seconds.</p>
          <div className="space-y-3 text-left">
            {runningSteps.map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                {step.done ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : i === doneCount ? (
                  <div className="w-4 h-4 rounded-full border-2 border-violet-500/30 border-t-violet-500 animate-spin shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-white/15 shrink-0" />
                )}
                <span className={`text-sm ${step.done ? "text-white" : i === doneCount ? "text-violet-300" : "text-slate-600"}`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (typedAudit.status === "failed") {
    return (
      <div className="min-h-screen bg-[oklch(0.08_0.015_250)] flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-white mb-2">Audit failed</h2>
          <p className="text-sm text-slate-400 mb-2">{typedAudit.errorMessage ?? "Unable to analyze this page."}</p>
          <p className="text-xs text-slate-500 mb-6">The page may be blocking crawlers or be temporarily unavailable.</p>
          <Button onClick={() => navigate("/")} className="bg-violet-600 hover:bg-violet-500 text-white gap-2">
            <ArrowLeft className="w-4 h-4" /> Try Another URL
          </Button>
        </div>
      </div>
    );
  }

  const score = typedAudit.overallScore ?? 0;
  const grade = getGrade(score);
  const pillars = getPillarScore(typedAudit);
  const topIssues = getTopIssues(typedAudit);
  const domain = (() => { try { return new URL(typedAudit.url).hostname; } catch { return typedAudit.url; } })();

  const pillarDefs = [
    {
      key: "findability", icon: Search, label: "Findability", score: pillars.findability,
      color: "oklch(0.72 0.18 200)",
      desc: "Can AI search engines find and crawl your page?",
      checks: [
        ...(typedAudit.findings?.aiCrawlers?.checks ?? []),
        ...(typedAudit.findings?.technical?.checks ?? []),
        ...(typedAudit.findings?.metaTags?.checks ?? []),
      ],
    },
    {
      key: "trust", icon: Shield, label: "Trustworthiness", score: pillars.trust,
      color: "oklch(0.72 0.18 145)",
      desc: "Does AI trust your page as a credible source?",
      checks: [
        ...(typedAudit.findings?.eeat?.checks ?? []),
        ...(typedAudit.findings?.structuredData?.checks ?? []),
      ],
    },
    {
      key: "answerability", icon: Brain, label: "Answerability", score: pillars.answerability,
      color: "oklch(0.72 0.18 280)",
      desc: "Can AI use your content to answer user questions?",
      checks: typedAudit.findings?.contentStructure?.checks ?? [],
    },
  ];

  return (
    <div className="min-h-screen bg-[oklch(0.08_0.015_250)] text-white">
      {/* Nav */}
      <nav className="sticky top-0 z-40 flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[oklch(0.08_0.015_250)]/90 backdrop-blur-xl">
        <button onClick={() => navigate("/")} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">New audit</span>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
            <Bot className="w-3 h-3 text-white" />
          </div>
          <span className="text-sm font-bold text-white hidden sm:block">GEO-Auditor</span>
        </div>
        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <Button size="sm" onClick={() => navigate("/dashboard")} variant="ghost" className="bg-white/8 hover:bg-white/15 text-white border border-white/10 gap-1.5 text-xs">
              <LayoutDashboard className="w-3.5 h-3.5" /> Dashboard
            </Button>
          ) : (
            <Button size="sm" onClick={() => (window.location.href = getLoginUrl())} variant="ghost" className="bg-white/8 hover:bg-white/15 text-white border border-white/10 gap-1.5 text-xs">
              <LogIn className="w-3.5 h-3.5" /> Sign In Free
            </Button>
          )}
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Score Hero */}
        <div className="rounded-2xl border border-white/8 bg-gradient-to-br from-slate-900 via-slate-800/50 to-slate-900 p-6 relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full blur-3xl pointer-events-none" style={{ backgroundColor: `${grade.color}10` }} />
          <div className="flex items-center gap-2 mb-5">
            <Globe className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="text-xs text-slate-400 truncate">{typedAudit.url}</span>
            <a href={typedAudit.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
              <ExternalLink className="w-3 h-3 text-slate-600 hover:text-slate-400" />
            </a>
          </div>
          <div className="flex items-center gap-6 mb-4">
            <AnimatedScoreRing score={score} animate={scoreAnimated} />
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-4xl font-black" style={{ color: grade.color }}>Grade {grade.letter}</span>
              </div>
              <div className="text-sm text-slate-300 mb-2">{grade.label} AI Search Visibility</div>
              <div className="text-xs text-slate-500 leading-relaxed max-w-xs">
                {score >= 85 && "Your page is well-optimized for AI search. Keep monitoring for changes."}
                {score >= 70 && score < 85 && "Your page is mostly visible to AI. A few targeted fixes will push you to excellent."}
                {score >= 50 && score < 70 && "Your page has moderate AI visibility. Several important issues need attention."}
                {score >= 30 && score < 50 && "Your page is hard to find in AI answers. Multiple critical issues detected."}
                {score < 30 && "Your page is nearly invisible to AI search engines. Urgent action required."}
              </div>
            </div>
          </div>
          {typedAudit.pageTitle && (
            <div className="text-xs text-slate-500 border-t border-white/8 pt-3">
              <span className="text-slate-600">Page: </span>{typedAudit.pageTitle}
            </div>
          )}
        </div>

        {/* Top 3 Issues */}
        {topIssues.length > 0 && (
          <div className="rounded-2xl border border-white/8 bg-white/3 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-semibold text-white">Top 3 things to fix</span>
            </div>
            <div className="space-y-3">
              {topIssues.map((issue, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/3 border border-white/5">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5" style={{ backgroundColor: issue.color }}>
                    {i + 1}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">{issue.label}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{issue.fix}</div>
                    <div className="text-[10px] mt-1" style={{ color: issue.color }}>{issue.pillar}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3 Pillars */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-white">Score breakdown</span>
          </div>
          <div className="space-y-3">
            {pillarDefs.map((p) => (
              <PillarCard
                key={p.key} icon={p.icon} label={p.label} score={p.score}
                desc={p.desc} color={p.color} checks={p.checks}
                expanded={expandedPillar === p.key}
                onToggle={() => setExpandedPillar(expandedPillar === p.key ? null : p.key)}
              />
            ))}
          </div>
        </div>

        {/* Share */}
        <ShareSection audit={typedAudit} domain={domain} />

        {/* Full Report Gate */}
        {!fullReportUnlocked ? (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Lock className="w-4 h-4 text-violet-400" />
              <span className="text-sm font-semibold text-white">Full AI Improvement Plan</span>
            </div>
            <EmailGate auditId={auditId} onUnlock={() => setFullReportUnlocked(true)} />
            <div className="mt-3 text-center">
              <span className="text-xs text-slate-500">Already have an account? </span>
              <button onClick={() => (window.location.href = getLoginUrl())} className="text-xs text-violet-400 hover:text-violet-300 underline">
                Sign in to unlock
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* AI Recommendations */}
            {typedAudit.llmRecommendations && typedAudit.llmRecommendations.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-violet-400" />
                  <span className="text-sm font-semibold text-white">AI-Powered Recommendations</span>
                  <Badge className="text-[10px] bg-violet-500/20 text-violet-300 border-violet-500/30">AI</Badge>
                </div>
                <LLMRecommendationsSection
                  recommendations={typedAudit.llmRecommendations}
                  topPriority={typedAudit.llmTopPriority}
                />
              </div>
            )}

            {/* Content Intelligence */}
            {typedAudit.contentIntelligence && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Brain className="w-4 h-4 text-violet-400" />
                  <span className="text-sm font-semibold text-white">Content Intelligence</span>
                  <Badge className="text-[10px] bg-violet-500/20 text-violet-300 border-violet-500/30">AI</Badge>
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/3 p-5">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="text-center">
                      <div className="text-3xl font-black" style={{ color: getGrade(typedAudit.contentIntelligence.citeabilityScore).color }}>
                        {typedAudit.contentIntelligence.citeabilityScore}
                      </div>
                      <div className="text-[10px] text-slate-500">Citeability</div>
                    </div>
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-white mb-1">AI Citeability Score</div>
                      <div className="text-xs text-slate-400">{typedAudit.contentIntelligence.summary}</div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {typedAudit.contentIntelligence.checks.map((check) => (
                      <div key={check.id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${getGrade(check.score).color}15` }}>
                          <span className="text-xs font-bold" style={{ color: getGrade(check.score).color }}>{check.score}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-white">{check.label}</div>
                          <div className="text-xs text-slate-500 truncate">{check.recommendation}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* PLG Upsell */}
            {!isAuthenticated && (
              <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-b from-violet-500/8 to-transparent p-5 text-center">
                <TrendingUp className="w-8 h-8 text-violet-400 mx-auto mb-3" />
                <h3 className="text-sm font-bold text-white mb-2">Track your progress over time</h3>
                <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                  Create a free account to monitor this page, track score improvements, and get notified when your AI visibility changes.
                </p>
                <Button onClick={() => (window.location.href = getLoginUrl())} className="bg-violet-600 hover:bg-violet-500 text-white gap-2 text-sm">
                  <LogIn className="w-4 h-4" /> Create Free Account
                </Button>
              </div>
            )}
          </>
        )}

        {/* Run Another */}
        <div className="text-center pt-4 pb-8">
          <Button onClick={() => navigate("/")} variant="ghost" className="text-slate-400 hover:text-white gap-2 text-sm">
            <RefreshCw className="w-4 h-4" /> Audit another page
          </Button>
        </div>
      </div>
    </div>
  );
}
