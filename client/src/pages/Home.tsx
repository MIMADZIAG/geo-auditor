import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Bot,
  Search,
  Zap,
  Shield,
  BarChart3,
  FileText,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Code2,
  Brain,
  LayoutDashboard,
  LogIn,
  ChevronRight,
  Target,
  TrendingUp,
  Sparkles,
} from "lucide-react";

export default function Home() {
  const [url, setUrl] = useState("");
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  const auditMutation = trpc.audit.run.useMutation({
    onSuccess: (data) => navigate(`/results/${data.auditId}`),
    onError: (err) => toast.error(err.message || "Audit failed. Please try again."),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) { toast.error("Please enter a URL to audit."); return; }
    let normalized = url.trim();
    if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) normalized = "https://" + normalized;
    auditMutation.mutate({ url: normalized });
  };

  const isLoading = auditMutation.isPending;

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">

      {/* ── Navigation ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Bot className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg tracking-tight">GEO-Auditor</span>
          </div>
          <div className="flex items-center gap-3">
            <a href="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block">Pricing</a>
            {isAuthenticated ? (
              <Button size="sm" onClick={() => navigate("/dashboard")} variant="outline" className="gap-1.5">
                <LayoutDashboard className="w-3.5 h-3.5" /> Dashboard
              </Button>
            ) : (
              <Button size="sm" onClick={() => { window.location.href = getLoginUrl(); }} variant="ghost" className="gap-1.5">
                <LogIn className="w-3.5 h-3.5" /> Sign In
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-32 pb-20 px-4">
        <div className="container max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary font-medium mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            Free AI Visibility Audit
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight mb-6 leading-[1.08]">
            Why is AI search<br />
            <span className="text-primary">ignoring your page?</span>
          </h1>

          <p className="text-lg text-muted-foreground mb-10 max-w-xl mx-auto leading-relaxed">
            Paste any URL. In 30 seconds you'll see exactly what's preventing ChatGPT, Perplexity, and Google AI Overviews from finding and citing your content — and how to fix it.
          </p>

          {/* URL Input */}
          <form onSubmit={handleSubmit} className="max-w-xl mx-auto">
            <div className="flex items-center gap-2 p-2 rounded-2xl bg-card border border-border/60 shadow-lg focus-within:border-primary/50 transition-colors">
              <div className="flex items-center pl-2 text-muted-foreground">
                <Search className="w-4 h-4" />
              </div>
              <Input
                type="url"
                placeholder="https://yourwebsite.com/page"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-base placeholder:text-muted-foreground/60"
                disabled={isLoading}
              />
              <Button type="submit" disabled={isLoading} className="gap-2 rounded-xl px-5">
                {isLoading ? (
                  <><div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />Scanning…</>
                ) : (
                  <>Audit Now <ArrowRight className="w-4 h-4" /></>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-3">Free · 5 audits/month · No credit card required</p>
          </form>

          {/* Loading steps */}
          {isLoading && (
            <div className="mt-8 max-w-sm mx-auto">
              <div className="space-y-2">
                {SCAN_STEPS.map((step, i) => (
                  <div key={step} className="flex items-center gap-3 text-sm text-muted-foreground animate-pulse" style={{ animationDelay: `${i * 0.3}s` }}>
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />{step}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── What you get — Score + Content Intelligence preview ── */}
      <section className="py-16 px-4 border-t border-border/30">
        <div className="container max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">What you get in 30 seconds</h2>
            <p className="text-muted-foreground text-sm max-w-lg mx-auto">Not just a checklist — a full AI visibility analysis with scores, explanations, and copy-paste fixes.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Score card */}
            <div className="rounded-2xl bg-card border border-border/50 p-6 flex flex-col items-center text-center">
              <div className="relative mb-4">
                <svg width="100" height="100" viewBox="0 0 100 100" className="-rotate-90">
                  <circle cx="50" cy="50" r="38" fill="none" stroke="oklch(0.22 0.015 250)" strokeWidth="7" />
                  <circle cx="50" cy="50" r="38" fill="none" stroke="oklch(0.72 0.18 145)" strokeWidth="7" strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 38}`}
                    strokeDashoffset={`${2 * Math.PI * 38 * (1 - 0.74)}`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-black text-emerald-400">74</span>
                  <span className="text-[9px] text-muted-foreground">/100</span>
                </div>
              </div>
              <h3 className="font-semibold mb-1">AI Visibility Score</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">A single number that shows how visible your page is to AI search engines — across 6 technical and content dimensions.</p>
            </div>

            {/* Content Intelligence card */}
            <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/5 to-background p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center">
                  <Brain className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Content Intelligence</div>
                  <div className="text-[10px] text-violet-400 font-medium">AI-Powered</div>
                </div>
              </div>
              <div className="space-y-2 mb-4">
                {CONTENT_INTEL_PREVIEW.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${item.score}%`, backgroundColor: item.score >= 70 ? "oklch(0.72 0.18 145)" : item.score >= 40 ? "oklch(0.78 0.18 75)" : "oklch(0.65 0.22 25)" }} />
                      </div>
                      <span className="text-[10px] font-bold w-5 text-right" style={{ color: item.score >= 70 ? "oklch(0.72 0.18 145)" : item.score >= 40 ? "oklch(0.78 0.18 75)" : "oklch(0.65 0.22 25)" }}>{item.score}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1.5 p-2.5 rounded-lg bg-violet-500/8 border border-violet-500/15">
                <Target className="w-3 h-3 text-violet-400 shrink-0" />
                <p className="text-[10px] text-violet-300/80 leading-relaxed">Citeability Score: <strong className="text-violet-300">61/100</strong> — Add specific stats and dates to increase citation probability.</p>
              </div>
            </div>

            {/* Issues card */}
            <div className="rounded-2xl bg-card border border-border/50 p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <Target className="w-4 h-4 text-red-400" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Issues & Fixes</div>
                  <div className="text-[10px] text-muted-foreground">Prioritized action list</div>
                </div>
              </div>
              <div className="space-y-2">
                {MOCK_ISSUES_SHORT.map((issue, i) => (
                  <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-muted/20 border border-border/30">
                    <div className={`mt-0.5 shrink-0 ${issue.color}`}>
                      {issue.status === "fail" ? <XCircle className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{issue.label}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{issue.fix}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-16 px-4 border-t border-border/30">
        <div className="container max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">How it works</h2>
            <p className="text-muted-foreground text-sm">Three steps. Thirty seconds.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {STEPS.map((step, i) => (
              <div key={i} className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
                  <span className="text-lg font-black text-primary">{i + 1}</span>
                </div>
                <h3 className="font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What we check ── */}
      <section className="py-16 px-4 border-t border-border/30">
        <div className="container max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">40+ checks across 6 areas</h2>
            <p className="text-muted-foreground text-sm max-w-lg mx-auto">Every check is mapped to a specific AI search behavior — not just best practices.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {AUDIT_CATEGORIES.map((cat) => (
              <div key={cat.title} className="rounded-xl bg-card border border-border/50 p-5 hover:border-primary/30 transition-colors">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                    <cat.icon className="w-4 h-4 text-primary" />
                  </div>
                  <h3 className="font-semibold text-sm">{cat.title}</h3>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed mb-3">{cat.description}</p>
                <div className="flex flex-wrap gap-1">
                  {cat.checks.map((c) => (
                    <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground border border-border/40">{c}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Content Intelligence highlight ── */}
      <section className="py-16 px-4 border-t border-border/30">
        <div className="container max-w-4xl mx-auto">
          <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/8 via-indigo-500/4 to-background p-8 sm:p-10">
            <div className="flex flex-col sm:flex-row items-start gap-6">
              <div className="w-12 h-12 rounded-2xl bg-violet-500/15 flex items-center justify-center shrink-0">
                <Brain className="w-6 h-6 text-violet-400" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-xl sm:text-2xl font-bold">Content Intelligence</h2>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 font-semibold uppercase tracking-wide">AI-Powered</span>
                </div>
                <p className="text-muted-foreground leading-relaxed mb-5">
                  Beyond technical checks — our LLM analyzes your content across 5 dimensions that determine whether AI models will cite your page as a source. You get a <strong className="text-foreground">Citeability Score</strong> and specific improvements for each dimension.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
                  {CONTENT_INTEL_DIMS.map((dim) => (
                    <div key={dim} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CheckCircle2 className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                      {dim}
                    </div>
                  ))}
                </div>
                <Button onClick={() => document.querySelector("input")?.focus()} variant="outline" className="gap-2 border-violet-500/30 text-violet-400 hover:bg-violet-500/10">
                  <Sparkles className="w-3.5 h-3.5" /> Try it free
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Monitoring teaser ── */}
      <section className="py-16 px-4 border-t border-border/30">
        <div className="container max-w-4xl mx-auto">
          <div className="rounded-2xl bg-card border border-border/50 p-8 flex flex-col sm:flex-row items-center gap-6">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <TrendingUp className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h3 className="text-lg font-bold mb-2">Track your improvements over time</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Fix an issue, run the audit again, watch your score climb. Free accounts get 1 monitored page with weekly re-audits and score history.</p>
            </div>
            <Button onClick={() => { window.location.href = getLoginUrl(); }} className="gap-2 shrink-0">
              <LogIn className="w-3.5 h-3.5" /> Sign In Free
            </Button>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-20 px-4 border-t border-border/30 text-center">
        <div className="container max-w-xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">Ready to see your AI Visibility Score?</h2>
          <p className="text-muted-foreground mb-8 leading-relaxed">Paste any URL. Free. No signup required. Results in 30 seconds.</p>
          <Button size="lg" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="gap-2 px-8">
            <Search className="w-4 h-4" /> Start free audit
          </Button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border/30 py-10 px-4">
        <div className="container max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">GEO-Auditor</span>
          </div>
          <p className="text-xs text-muted-foreground text-center">Helping websites get found in the age of AI Search.</p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <a href="/pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />Free to use</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const SCAN_STEPS = [
  "Fetching page content…",
  "Checking AI crawler access…",
  "Analyzing structured data…",
  "Evaluating content quality…",
  "Running LLM analysis…",
];

const CONTENT_INTEL_PREVIEW = [
  { label: "Answer Density", score: 58 },
  { label: "Factual Density", score: 72 },
  { label: "Citation Readiness", score: 44 },
  { label: "Query Coverage", score: 65 },
  { label: "Duplicate Risk", score: 81 },
];

const MOCK_ISSUES_SHORT = [
  {
    status: "fail",
    color: "text-red-400",
    label: "GPTBot blocked in robots.txt",
    fix: "ChatGPT can't access your page — remove the block",
  },
  {
    status: "fail",
    color: "text-red-400",
    label: "No structured data (JSON-LD)",
    fix: "Add Product schema so AI knows what your page is about",
  },
  {
    status: "warning",
    color: "text-amber-400",
    label: "No author or publication date",
    fix: "AI prefers content with clear authorship signals",
  },
];

const STEPS = [
  {
    title: "Paste your URL",
    description: "Any page — product, blog post, landing page, or homepage. No signup needed.",
  },
  {
    title: "We run 40+ checks",
    description: "Our engine scans for every known reason AI models skip or cite content — technical and content-level.",
  },
  {
    title: "Fix what matters",
    description: "Get a prioritized list of issues with specific, copy-paste-ready instructions and expected impact.",
  },
];

const CONTENT_INTEL_DIMS = [
  "Answer Density",
  "Factual Density",
  "Citation Readiness",
  "Query Coverage",
  "Duplicate Risk",
];

const AUDIT_CATEGORIES = [
  {
    title: "AI Crawler Access",
    icon: Bot,
    description: "Verify GPTBot, PerplexityBot, ClaudeBot, and Google-Extended are not blocked in robots.txt.",
    checks: ["GPTBot", "PerplexityBot", "ClaudeBot", "Google-Extended"],
  },
  {
    title: "Structured Data",
    icon: Code2,
    description: "JSON-LD schema detection and validation — Article, Product, FAQ, Organization, BreadcrumbList.",
    checks: ["JSON-LD", "FAQPage", "Article", "Organization", "dateModified"],
  },
  {
    title: "Content Structure",
    icon: FileText,
    description: "Heading hierarchy, TL;DR presence, FAQ sections, content length, lists, and citation-ready patterns.",
    checks: ["H1/H2/H3", "TL;DR", "FAQ section", "Word count", "Lists"],
  },
  {
    title: "E-E-A-T Signals",
    icon: Zap,
    description: "Author bylines, credentials, About page, contact info, external citations, and publication dates.",
    checks: ["Author", "Citations", "About page", "Contact", "Dates"],
  },
  {
    title: "Technical Crawlability",
    icon: Shield,
    description: "HTTPS, HTTP status, canonical tags, noindex/nosnippet directives, response time, and mobile viewport.",
    checks: ["HTTPS", "Canonical", "noindex", "nosnippet", "robots.txt"],
  },
  {
    title: "Meta Tags",
    icon: BarChart3,
    description: "Title tag, meta description, Open Graph tags, Twitter Cards, language declaration, and charset.",
    checks: ["Title", "Description", "OG tags", "Twitter Card", "lang"],
  },
];
