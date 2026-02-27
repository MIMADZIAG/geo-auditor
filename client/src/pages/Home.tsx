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
  Sparkles,
  Globe,
  Code2,
  Brain,
  LayoutDashboard,
  LogIn,
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
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <Brain className="w-4.5 h-4.5 text-primary" />
            </div>
            <span className="font-semibold text-foreground tracking-tight">GEO-Auditor</span>
          </div>
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <span className="text-xs text-muted-foreground hidden sm:block">{user?.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/dashboard")}
                  className="gap-1.5 text-xs"
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  Dashboard
                </Button>
              </>
            ) : (
              <>
                <span className="text-xs text-muted-foreground hidden sm:block">Free · No signup required</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => (window.location.href = getLoginUrl())}
                  className="gap-1.5 text-xs text-primary"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  Sign In
                </Button>
              </>
            )}
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-24 px-4">
        {/* Background glow effects */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/8 rounded-full blur-[120px]" />
          <div className="absolute top-1/3 left-1/4 w-[300px] h-[300px] bg-violet-500/5 rounded-full blur-[80px]" />
          <div className="absolute top-1/3 right-1/4 w-[300px] h-[300px] bg-indigo-500/5 rounded-full blur-[80px]" />
        </div>

        <div className="relative container max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-8">
            <Sparkles className="w-3.5 h-3.5" />
            AI Search Visibility Audit
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-6 leading-[1.1]">
            Is Your Website Ready for{" "}
            <span className="gradient-text">AI Search?</span>
          </h1>

          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-12 leading-relaxed">
            Analyze any URL and get a detailed AI-Readiness score with actionable recommendations
            to improve your visibility in ChatGPT, Perplexity, Google AI Overviews, and other
            AI-powered search engines.
          </p>

          {/* URL Input Form */}
          <div className="max-w-2xl mx-auto">
            <form onSubmit={handleSubmit} className="relative">
              <div className="flex gap-3 p-2 rounded-2xl bg-card border border-border/60 shadow-2xl shadow-black/20">
                <div className="flex-1 flex items-center gap-3 px-4">
                  <Globe className="w-5 h-5 text-muted-foreground shrink-0" />
                  <Input
                    type="text"
                    placeholder="https://yourwebsite.com/page"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={isLoading}
                    className="border-0 bg-transparent shadow-none text-base placeholder:text-muted-foreground/50 focus-visible:ring-0 h-12 p-0"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isLoading}
                  size="lg"
                  className="h-12 px-6 rounded-xl font-semibold text-sm shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 transition-all duration-200"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      Analyzing...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Audit Now
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  )}
                </Button>
              </div>
            </form>

            {/* Loading progress */}
            {isLoading && (
              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  Running full AI-Readiness audit...
                </div>
                <div className="w-full h-1 bg-border rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-primary to-violet-400 rounded-full animate-[loading_2s_ease-in-out_infinite]" style={{ width: "60%", animation: "pulse 1.5s ease-in-out infinite" }} />
                </div>
                <div className="flex justify-center gap-6 text-xs text-muted-foreground/60">
                  {["Fetching page", "Checking schema", "Analyzing content", "Scoring"].map((step, i) => (
                    <span key={step} className={i === 1 ? "text-primary" : ""}>{step}</span>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground/50 mt-4">
              Free · 3 audits per day · No signup required
            </p>
          </div>
        </div>
      </section>

      {/* What We Check Section */}
      <section className="py-20 px-4 border-t border-border/30">
        <div className="container max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              6 Dimensions of AI Readiness
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Our audit engine analyzes every critical signal that AI crawlers and LLMs use
              to discover, understand, and cite your content.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {AUDIT_CATEGORIES.map((cat) => (
              <div
                key={cat.title}
                className="group p-6 rounded-2xl bg-card border border-border/50 hover:border-primary/30 transition-all duration-300 hover:bg-accent/30"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <cat.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-sm mb-2">{cat.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{cat.description}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {cat.checks.map((check) => (
                    <span key={check} className="text-[10px] px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground">
                      {check}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 border-t border-border/30">
        <div className="container max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">How It Works</h2>
            <p className="text-muted-foreground">Get your AI-Readiness score in under 30 seconds.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {STEPS.map((step, i) => (
              <div key={step.title} className="text-center">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                  <span className="text-primary font-bold text-lg">{i + 1}</span>
                </div>
                <h3 className="font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Score scale */}
      <section className="py-20 px-4 border-t border-border/30">
        <div className="container max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">AI-Readiness Score Scale</h2>
            <p className="text-muted-foreground">Understand where your page stands.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {SCORE_LEVELS.map((level) => (
              <div key={level.label} className="p-5 rounded-2xl bg-card border border-border/50 text-center">
                <div className={`text-3xl font-bold mb-1 ${level.colorClass}`}>{level.range}</div>
                <div className={`text-sm font-semibold mb-2 ${level.colorClass}`}>{level.label}</div>
                <div className="text-xs text-muted-foreground">{level.description}</div>
              </div>
            ))}
          </div>
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
            Helping websites become visible in the age of AI Search.
          </p>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            Free to use
          </div>
        </div>
      </footer>
    </div>
  );
}

const AUDIT_CATEGORIES = [
  {
    title: "Technical Crawlability",
    icon: Shield,
    description: "HTTPS, HTTP status, canonical tags, noindex/nosnippet directives, response time, and mobile viewport.",
    checks: ["HTTPS", "Canonical", "noindex", "nosnippet", "robots.txt"],
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
    title: "AI Crawler Access",
    icon: Bot,
    description: "Verify GPTBot, PerplexityBot, ClaudeBot, and Google-Extended are not blocked in robots.txt.",
    checks: ["GPTBot", "PerplexityBot", "ClaudeBot", "Google-Extended"],
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
    title: "Enter Your URL",
    description: "Paste any page URL — product page, blog post, landing page, or homepage.",
  },
  {
    title: "We Analyze Everything",
    description: "Our engine fetches the page and runs 40+ checks across 6 categories in seconds.",
  },
  {
    title: "Get Actionable Insights",
    description: "Receive a prioritized list of fixes with specific instructions to improve your AI visibility.",
  },
];

const SCORE_LEVELS = [
  { range: "80–100", label: "Excellent", description: "Highly optimized for AI search", colorClass: "text-score-excellent" },
  { range: "60–79", label: "Good", description: "Minor improvements needed", colorClass: "text-score-good" },
  { range: "40–59", label: "Fair", description: "Significant gaps to address", colorClass: "text-score-fair" },
  { range: "0–39", label: "Poor", description: "Critical issues blocking AI visibility", colorClass: "text-score-poor" },
];
