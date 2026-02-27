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
  Wrench,
} from "lucide-react";

export default function Home() {
  const [url, setUrl] = useState("");
  const [, navigate] = useLocation();
  const { isAuthenticated, user } = useAuth();

  const auditMutation = trpc.audit.run.useMutation({
    onSuccess: (data) => {
      navigate(`/results/${data.auditId}`);
    },
    onError: (err) => {
      toast.error(err.message || "Audit failed. Please try again.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      toast.error("Please enter a URL to audit.");
      return;
    }
    let normalized = url.trim();
    if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
      normalized = "https://" + normalized;
    }
    auditMutation.mutate({ url: normalized });
  };

  const isLoading = auditMutation.isPending;

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Navigation */}
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
                <LayoutDashboard className="w-3.5 h-3.5" />
                Dashboard
              </Button>
            ) : (
              <Button size="sm" onClick={() => { window.location.href = getLoginUrl(); }} variant="ghost" className="gap-1.5">
                <LogIn className="w-3.5 h-3.5" />
                Sign In
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4">
        <div className="container max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary text-xs font-medium mb-8">
            <Search className="w-3 h-3" />
            Free AI Search Diagnostics
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight mb-6 leading-[1.1]">
            Find out why AI search<br />
            <span className="text-primary">ignores your page</span>
          </h1>

          <p className="text-lg text-muted-foreground mb-10 max-w-xl mx-auto leading-relaxed">
            Paste any URL. In 30 seconds you'll see exactly which issues prevent ChatGPT, Perplexity, and Google AI Overviews from citing your content — and how to fix each one.
          </p>

          {/* URL Input */}
          <form onSubmit={handleSubmit} className="relative max-w-xl mx-auto">
            <div className="flex gap-2 p-1.5 rounded-2xl bg-card border border-border/60 shadow-lg focus-within:border-primary/50 transition-colors">
              <div className="flex items-center pl-3 text-muted-foreground">
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
              <Button
                type="submit"
                disabled={isLoading}
                className="gap-2 rounded-xl px-5"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    Diagnose
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Free · 5 audits/month · No credit card required
            </p>
          </form>

          {/* Loading progress */}
          {isLoading && (
            <div className="mt-8 max-w-sm mx-auto">
              <div className="space-y-2">
                {SCAN_STEPS.map((step, i) => (
                  <div key={step} className="flex items-center gap-3 text-sm text-muted-foreground animate-pulse" style={{ animationDelay: `${i * 0.3}s` }}>
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    {step}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* What we find — mock issue preview */}
      <section className="py-16 px-4 border-t border-border/30">
        <div className="container max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">What the diagnostic finds</h2>
            <p className="text-muted-foreground text-sm max-w-lg mx-auto">
              40+ checks across 6 areas. Every issue comes with a clear explanation and step-by-step fix.
            </p>
          </div>

          {/* Mock diagnostic output */}
          <div className="rounded-2xl border border-border/50 bg-card overflow-hidden shadow-xl">
            {/* Mock header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Wrench className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-semibold">example-shop.com/products/jacket</div>
                  <div className="text-xs text-muted-foreground">Product page · 6 issues found</div>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1 text-red-400"><XCircle className="w-3.5 h-3.5" />2 critical</span>
                <span className="flex items-center gap-1 text-amber-400"><AlertTriangle className="w-3.5 h-3.5" />3 warnings</span>
                <span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" />31 passed</span>
              </div>
            </div>

            {/* Mock issues */}
            <div className="divide-y divide-border/30">
              {MOCK_ISSUES.map((issue, i) => (
                <div key={i} className="flex items-start gap-4 px-5 py-4 hover:bg-muted/10 transition-colors">
                  <div className={`mt-0.5 shrink-0 ${issue.statusColor}`}>
                    {issue.status === "fail" ? <XCircle className="w-4 h-4" /> : issue.status === "warning" ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium">{issue.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${issue.impactBg}`}>{issue.impact}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{issue.description}</p>
                    {issue.fix && (
                      <p className="text-xs text-primary mt-1 flex items-center gap-1">
                        <ChevronRight className="w-3 h-3" />
                        {issue.fix}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Blurred overlay for remaining issues */}
            <div className="relative px-5 py-4 border-t border-border/30">
              <div className="blur-sm select-none pointer-events-none">
                <div className="flex items-start gap-4">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-sm font-medium">No FAQ section detected</div>
                    <div className="text-xs text-muted-foreground">Pages with FAQ sections are 3× more likely to appear in AI answers</div>
                  </div>
                </div>
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Button size="sm" onClick={() => document.querySelector<HTMLInputElement>("input[type=url]")?.focus()} className="gap-2 shadow-lg">
                  <Search className="w-3.5 h-3.5" />
                  Diagnose your page
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6 areas */}
      <section className="py-16 px-4 border-t border-border/30">
        <div className="container max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">6 areas, 40+ checks</h2>
            <p className="text-muted-foreground text-sm">Every check maps to a specific reason AI models skip or cite your content.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {AUDIT_CATEGORIES.map((cat) => (
              <div key={cat.title} className="p-5 rounded-2xl bg-card border border-border/50 hover:border-primary/30 transition-colors group">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
                    <cat.icon className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-sm">{cat.title}</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{cat.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  {cat.checks.map((c) => (
                    <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">{c}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 px-4 border-t border-border/30">
        <div className="container max-w-3xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-10">How it works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {STEPS.map((step, i) => (
              <div key={step.title} className="text-center">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                  <span className="text-primary font-bold text-lg">{i + 1}</span>
                </div>
                <h3 className="font-semibold mb-2 text-sm">{step.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA strip */}
      <section className="py-16 px-4 border-t border-border/30">
        <div className="container max-w-2xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">Ready to find your issues?</h2>
          <p className="text-muted-foreground text-sm mb-8">Free. No signup. Results in 30 seconds.</p>
          <Button
            size="lg"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="gap-2"
          >
            <Search className="w-4 h-4" />
            Start free diagnostic
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/30 py-10 px-4">
        <div className="container max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">GEO-Auditor</span>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Helping websites get found in the age of AI Search.
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <a href="/pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>Free to use</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const SCAN_STEPS = [
  "Fetching page content...",
  "Checking AI crawler access...",
  "Analyzing structured data...",
  "Evaluating content quality...",
  "Running LLM analysis...",
];

const MOCK_ISSUES = [
  {
    status: "fail",
    statusColor: "text-red-400",
    label: "GPTBot is blocked in robots.txt",
    impact: "Critical",
    impactBg: "bg-red-500/10 text-red-400",
    description: "ChatGPT's crawler cannot access your page. Your content will never appear in ChatGPT answers.",
    fix: "Remove 'User-agent: GPTBot / Disallow: /' from robots.txt",
  },
  {
    status: "fail",
    statusColor: "text-red-400",
    label: "No structured data (JSON-LD) found",
    impact: "Critical",
    impactBg: "bg-red-500/10 text-red-400",
    description: "AI models rely on structured data to understand what your page is about. Without it, they guess — and often skip.",
    fix: "Add Product schema with name, price, description, and image",
  },
  {
    status: "warning",
    statusColor: "text-amber-400",
    label: "Meta description missing",
    impact: "High",
    impactBg: "bg-amber-500/10 text-amber-400",
    description: "AI Overviews use meta descriptions as a primary source for page summaries.",
    fix: "Add a 150–160 character meta description that answers the main user question",
  },
  {
    status: "warning",
    statusColor: "text-amber-400",
    label: "No author or publication date",
    impact: "Medium",
    impactBg: "bg-amber-500/10 text-amber-400",
    description: "AI models prefer content with clear authorship and freshness signals when selecting sources.",
    fix: "Add author name and datePublished to your article schema",
  },
  {
    status: "pass",
    statusColor: "text-emerald-400",
    label: "HTTPS enabled",
    impact: "Passed",
    impactBg: "bg-emerald-500/10 text-emerald-400",
    description: "Your page is served over a secure connection.",
    fix: null,
  },
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

const STEPS = [
  {
    title: "Paste your URL",
    description: "Any page — product, blog post, landing page, or homepage. No signup needed.",
  },
  {
    title: "We run 40+ checks",
    description: "Our engine scans your page for every known reason AI models skip or cite content.",
  },
  {
    title: "Fix what matters",
    description: "Get a prioritized list of issues with specific, copy-paste-ready instructions.",
  },
];
