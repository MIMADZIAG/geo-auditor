import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowRight,
  Zap,
  Shield,
  BookOpen,
  BarChart3,
  CheckCircle2,
  Star,
  TrendingUp,
  Globe,
  Lock,
  Sparkles,
  ChevronDown,
  Bot,
  Brain,
  Search,
  LayoutDashboard,
  LogIn,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";

// ─── Animated Counter ────────────────────────────────────────────────────────

function AnimatedCounter({ target, duration = 2000 }: { target: number; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !started.current) {
          started.current = true;
          const start = Date.now();
          const tick = () => {
            const elapsed = Date.now() - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.round(eased * target));
            if (progress < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration]);

  return <span ref={ref}>{count.toLocaleString()}</span>;
}

// ─── Example Report Card (teaser) ────────────────────────────────────────────

function ExampleReportCard() {
  const pillars = [
    { label: "Findability", score: 72, icon: Search, color: "oklch(0.72 0.18 200)", desc: "AI can find your page" },
    { label: "Trustworthiness", score: 45, icon: Shield, color: "oklch(0.78 0.18 75)", desc: "Trust signals weak" },
    { label: "Answerability", score: 31, icon: Brain, color: "oklch(0.65 0.22 25)", desc: "Hard to cite" },
  ];

  return (
    <div className="relative rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 shadow-2xl overflow-hidden">
      {/* Glow */}
      <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-60 h-60 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-xs text-slate-400 mb-0.5">AI Search Report Card</div>
          <div className="text-sm font-semibold text-white">example-shop.com/products/shoes</div>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs text-amber-400 font-medium">Fair</span>
        </div>
      </div>

      {/* Big Score */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative">
          <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
            <circle cx="40" cy="40" r="32" fill="none" stroke="oklch(0.22 0.015 250)" strokeWidth="6" />
            <circle
              cx="40" cy="40" r="32" fill="none"
              stroke="oklch(0.78 0.18 75)" strokeWidth="6" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 32}
              strokeDashoffset={2 * Math.PI * 32 * (1 - 0.53)}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-white">53</span>
          </div>
        </div>
        <div>
          <div className="text-3xl font-black text-white mb-0.5">Grade: C</div>
          <div className="text-sm text-slate-400">Your page is partially visible to AI search</div>
        </div>
      </div>

      {/* 3 Pillars */}
      <div className="space-y-3">
        {pillars.map((p) => (
          <div key={p.label} className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${p.color}20` }}>
              <p.icon className="w-4 h-4" style={{ color: p.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-medium text-white">{p.label}</span>
                <span className="text-xs font-bold" style={{ color: p.color }}>{p.score}</span>
              </div>
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${p.score}%`, backgroundColor: p.color }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Blur overlay — teaser */}
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-slate-900 to-transparent flex items-end justify-center pb-3">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Lock className="w-3 h-3" />
          <span>Full report with improvement plan</span>
        </div>
      </div>
    </div>
  );
}

// ─── Testimonial ─────────────────────────────────────────────────────────────

function Testimonial({ text, name, role, score }: { text: string; name: string; role: string; score: number }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/3 p-5 flex flex-col gap-3">
      <div className="flex gap-0.5">
        {[...Array(5)].map((_, i) => (
          <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
        ))}
      </div>
      <p className="text-sm text-slate-300 leading-relaxed">"{text}"</p>
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-white/8">
        <div>
          <div className="text-xs font-semibold text-white">{name}</div>
          <div className="text-xs text-slate-500">{role}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">AI Score</div>
          <div className="text-sm font-bold text-emerald-400">{score}/100</div>
        </div>
      </div>
    </div>
  );
}

// ─── Feature Card ─────────────────────────────────────────────────────────────

function FeatureCard({ icon: Icon, title, desc, color }: { icon: React.ElementType; title: string; desc: string; color: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/3 p-5 hover:bg-white/5 transition-colors group">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: `${color}20` }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div className="text-sm font-semibold text-white mb-1.5">{title}</div>
      <div className="text-xs text-slate-400 leading-relaxed">{desc}</div>
    </div>
  );
}

// ─── Pricing Card ─────────────────────────────────────────────────────────────

function PricingCard({
  name, price, period, features, cta, highlighted, badge,
}: {
  name: string; price: string; period?: string; features: string[]; cta: string; highlighted?: boolean; badge?: string;
}) {
  return (
    <div className={`rounded-2xl border p-6 flex flex-col gap-4 relative ${
      highlighted
        ? "border-violet-500/50 bg-gradient-to-b from-violet-500/10 to-background"
        : "border-white/10 bg-white/3"
    }`}>
      {badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-violet-600 text-white text-[10px] font-bold uppercase tracking-wide">
          {badge}
        </div>
      )}
      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{name}</div>
        <div className="flex items-end gap-1">
          <span className="text-3xl font-black text-white">{price}</span>
          {period && <span className="text-sm text-slate-400 mb-1">{period}</span>}
        </div>
      </div>
      <ul className="space-y-2 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-xs text-slate-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
            {f}
          </li>
        ))}
      </ul>
      <Button
        className={`w-full text-sm ${highlighted ? "bg-violet-600 hover:bg-violet-500 text-white" : "bg-white/8 hover:bg-white/15 text-white border border-white/10"}`}
        variant="ghost"
      >
        {cta}
      </Button>
    </div>
  );
}

// ─── Main Home Page ───────────────────────────────────────────────────────────

export default function Home() {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  const runAudit = trpc.audit.run.useMutation({
    onSuccess: ({ auditId }) => {
      navigate(`/results/${auditId}`);
    },
    onError: (err) => {
      setIsLoading(false);
      toast.error(err.message || "Something went wrong. Please try again.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      toast.error("Please enter a URL to audit.");
      return;
    }
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
      normalizedUrl = `https://${normalizedUrl}`;
    }
    setIsLoading(true);
    runAudit.mutate({ url: normalizedUrl });
  };

  return (
    <div className="min-h-screen bg-[oklch(0.08_0.015_250)] text-white overflow-x-hidden">
      {/* ── Nav ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[oklch(0.08_0.015_250)]/80 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white">GEO-Auditor</span>
        </div>
        <div className="flex items-center gap-3">
          <a href="#pricing" className="text-sm text-slate-400 hover:text-white transition-colors hidden sm:block">Pricing</a>
          {isAuthenticated ? (
            <Button
              size="sm"
              onClick={() => navigate("/dashboard")}
              className="bg-white/8 hover:bg-white/15 text-white border border-white/10 gap-1.5 text-xs"
              variant="ghost"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Dashboard
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => (window.location.href = getLoginUrl())}
              className="bg-white/8 hover:bg-white/15 text-white border border-white/10 gap-1.5 text-xs"
              variant="ghost"
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign In
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => document.getElementById("audit-form")?.scrollIntoView({ behavior: "smooth" })}
            className="bg-violet-600 hover:bg-violet-500 text-white gap-1.5 text-xs"
          >
            <Zap className="w-3.5 h-3.5" />
            Free Audit
          </Button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative pt-32 pb-20 px-6 text-center overflow-hidden">
        {/* Background glows */}
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-violet-500/8 blur-[100px] pointer-events-none" />
        <div className="absolute top-40 left-1/4 w-[300px] h-[300px] rounded-full bg-cyan-500/6 blur-[80px] pointer-events-none" />

        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-xs font-medium mb-8">
          <Sparkles className="w-3.5 h-3.5" />
          The #1 AI Search Visibility Auditor
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-6xl font-black leading-tight mb-6 max-w-4xl mx-auto">
          Is your page{" "}
          <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
            invisible
          </span>{" "}
          to AI search?
        </h1>

        <p className="text-lg text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
          Get your <strong className="text-white">AI Search Score</strong> in 30 seconds.
          Find out exactly why ChatGPT, Perplexity, and Google AI Overviews
          aren't citing your page — and how to fix it.
        </p>

        {/* Audit Form */}
        <div id="audit-form" className="max-w-2xl mx-auto mb-6">
          <form onSubmit={handleSubmit} className="flex gap-3 p-2 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
            <div className="flex items-center gap-2 flex-1 min-w-0 px-3">
              <Globe className="w-4 h-4 text-slate-400 shrink-0" />
              <Input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://yourwebsite.com/page"
                className="border-0 bg-transparent text-white placeholder:text-slate-500 focus-visible:ring-0 p-0 text-sm h-auto"
                disabled={isLoading}
              />
            </div>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white font-semibold px-6 rounded-xl gap-2 shrink-0"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  Get My Score
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </form>
          <p className="text-xs text-slate-500 mt-3">
            Free · 5 audits/month · No credit card required
          </p>
        </div>

        {/* Social Proof Counter */}
        <div className="flex items-center justify-center gap-8 text-center">
          <div>
            <div className="text-2xl font-black text-white">
              <AnimatedCounter target={52847} />
            </div>
            <div className="text-xs text-slate-500">pages analyzed</div>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div>
            <div className="text-2xl font-black text-white">
              <AnimatedCounter target={4.8} duration={1500} />
              <span className="text-lg">/5</span>
            </div>
            <div className="text-xs text-slate-500">avg. rating</div>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div>
            <div className="text-2xl font-black text-white">
              <AnimatedCounter target={89} />%
            </div>
            <div className="text-xs text-slate-500">see improvement</div>
          </div>
        </div>
      </section>

      {/* ── Example Report Card ── */}
      <section className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="text-xs font-semibold text-violet-400 uppercase tracking-wide mb-3">Your Report Card</div>
              <h2 className="text-3xl font-black text-white mb-4 leading-tight">
                One score. Three pillars.
                <br />
                <span className="text-slate-400">Infinite clarity.</span>
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-6">
                We translate 40+ technical checks into three simple questions every business owner understands:
                Can AI <em>find</em> you? Does AI <em>trust</em> you? Can AI <em>answer</em> from your page?
              </p>
              <div className="space-y-3">
                {[
                  { icon: Search, label: "Findability", desc: "Can AI crawlers access and index your page?", color: "oklch(0.72 0.18 200)" },
                  { icon: Shield, label: "Trustworthiness", desc: "Do you have the authority signals AI engines require?", color: "oklch(0.72 0.18 145)" },
                  { icon: Brain, label: "Answerability", desc: "Is your content structured to be cited in AI answers?", color: "oklch(0.72 0.18 280)" },
                ].map((p) => (
                  <div key={p.label} className="flex items-start gap-3 p-3 rounded-xl bg-white/3 border border-white/8">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${p.color}20` }}>
                      <p.icon className="w-4 h-4" style={{ color: p.color }} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">{p.label}</div>
                      <div className="text-xs text-slate-400">{p.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:pl-8">
              <ExampleReportCard />
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="py-16 px-6 border-t border-white/5">
        <div className="max-w-4xl mx-auto text-center">
          <div className="text-xs font-semibold text-cyan-400 uppercase tracking-wide mb-3">How It Works</div>
          <h2 className="text-3xl font-black text-white mb-12">Your AI Score in 3 steps</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { step: "01", title: "Paste your URL", desc: "Any page — product, blog post, homepage. No account needed.", icon: Globe },
              { step: "02", title: "We analyze 40+ signals", desc: "Technical access, trust signals, content quality, schema markup — all checked in 30 seconds.", icon: Zap },
              { step: "03", title: "Get your action plan", desc: "A clear score, 3 priority fixes, and a shareable report card for your team.", icon: TrendingUp },
            ].map((s) => (
              <div key={s.step} className="relative p-6 rounded-2xl border border-white/8 bg-white/3 text-left">
                <div className="text-4xl font-black text-white/10 mb-3">{s.step}</div>
                <s.icon className="w-6 h-6 text-violet-400 mb-3" />
                <div className="text-sm font-semibold text-white mb-1.5">{s.title}</div>
                <div className="text-xs text-slate-400 leading-relaxed">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-16 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wide mb-3">What You Get</div>
            <h2 className="text-3xl font-black text-white">Built for every team</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureCard icon={Brain} title="Content Intelligence" desc="LLM-powered analysis of answer density, factual depth, and AI citeability — the only tool that does this per URL." color="oklch(0.72 0.18 280)" />
            <FeatureCard icon={Shield} title="Trust & Authority Score" desc="Detects E-E-A-T signals, author credibility, and trust indicators that AI engines use to rank sources." color="oklch(0.72 0.18 145)" />
            <FeatureCard icon={Bot} title="AI Crawler Access" desc="Checks if ChatGPT, Perplexity, Claude, and Google AI can actually crawl your page." color="oklch(0.72 0.18 200)" />
            <FeatureCard icon={BarChart3} title="Schema Markup Audit" desc="Detects 15+ schema types including nested structures. Tells you exactly which schemas to add." color="oklch(0.78 0.18 75)" />
            <FeatureCard icon={BookOpen} title="Shareable Report Card" desc="One-click share to LinkedIn or Twitter. Your score becomes your marketing." color="oklch(0.72 0.18 320)" />
            <FeatureCard icon={TrendingUp} title="Score Monitoring" desc="Track your AI visibility score over time. See the impact of every change you make." color="oklch(0.72 0.18 30)" />
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="py-16 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-3">Social Proof</div>
            <h2 className="text-3xl font-black text-white">Teams that use GEO-Auditor</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Testimonial
              text="I had no idea my product pages were invisible to AI. After fixing the top 3 issues, my products started appearing in Perplexity answers within 2 weeks."
              name="Anna K."
              role="E-commerce Owner"
              score={84}
            />
            <Testimonial
              text="This is the first tool that actually explains WHY my content isn't being cited by ChatGPT. The Content Intelligence score is genius."
              name="Marcin W."
              role="Content Manager, SaaS"
              score={91}
            />
            <Testimonial
              text="We use it for every client audit. The shareable report card saves us hours of presentation prep. Clients immediately understand the score."
              name="Karolina T."
              role="SEO Agency Lead"
              score={78}
            />
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-16 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-xs font-semibold text-violet-400 uppercase tracking-wide mb-3">Pricing</div>
            <h2 className="text-3xl font-black text-white mb-3">Start free. Scale when ready.</h2>
            <p className="text-slate-400 text-sm">No credit card required. Cancel anytime.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <PricingCard
              name="Free"
              price="$0"
              features={[
                "5 audits / month",
                "AI Search Score",
                "3 priority fixes",
                "Shareable report card",
                "1 monitoring slot",
              ]}
              cta="Start Free"
            />
            <PricingCard
              name="Starter"
              price="$29"
              period="/mo"
              features={[
                "50 audits / month",
                "Full 40-check report",
                "PDF export",
                "10 monitoring slots",
                "Score history",
                "Email support",
              ]}
              cta="Start Starter"
            />
            <PricingCard
              name="Pro"
              price="$99"
              period="/mo"
              highlighted
              badge="Most Popular"
              features={[
                "200 audits / month",
                "Content Intelligence",
                "Competitor comparison",
                "50 monitoring slots",
                "Advanced recommendations",
                "Priority support",
              ]}
              cta="Start Pro"
            />
            <PricingCard
              name="Agency"
              price="$299"
              period="/mo"
              features={[
                "Unlimited audits",
                "White-label reports",
                "API access",
                "Shopify / WP integration",
                "Custom branding",
                "Dedicated support",
              ]}
              cta="Contact Sales"
            />
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-20 px-6 border-t border-white/5">
        <div className="max-w-2xl mx-auto text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center mx-auto mb-6">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-3xl font-black text-white mb-4">
            Your competitors are already optimizing for AI search.
          </h2>
          <p className="text-slate-400 text-sm mb-8 leading-relaxed">
            Every day without an AI Search Score is a day your pages are invisible to ChatGPT, Perplexity, and Google AI Overviews.
            It takes 30 seconds to find out where you stand.
          </p>
          <form onSubmit={handleSubmit} className="flex gap-3 p-2 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm max-w-xl mx-auto">
            <div className="flex items-center gap-2 flex-1 min-w-0 px-3">
              <Globe className="w-4 h-4 text-slate-400 shrink-0" />
              <Input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://yourwebsite.com/page"
                className="border-0 bg-transparent text-white placeholder:text-slate-500 focus-visible:ring-0 p-0 text-sm h-auto"
                disabled={isLoading}
              />
            </div>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white font-semibold px-6 rounded-xl gap-2 shrink-0"
            >
              {isLoading ? (
                <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <>Get My Score <ArrowRight className="w-4 h-4" /></>
              )}
            </Button>
          </form>
          <p className="text-xs text-slate-500 mt-3">Free · No signup required · Results in 30 seconds</p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-8 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
              <Bot className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm font-semibold text-white">GEO-Auditor</span>
            <span className="text-xs text-slate-500">— AI Search Visibility Auditor</span>
          </div>
          <div className="text-xs text-slate-600">
            © 2025 GEO-Auditor. Built for the AI search era.
          </div>
        </div>
      </footer>
    </div>
  );
}
