import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, ArrowLeft, Bot, Zap, Shield, Building2, Star,
  ArrowRight, Globe, Brain, BarChart3, Download, Users, Infinity,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";

// ─── Plan data ────────────────────────────────────────────────────────────────

const plans = [
  {
    id: "free",
    name: "Free",
    price: { monthly: 0, yearly: 0 },
    description: "Try it now — no credit card needed.",
    cta: "Start for Free",
    ctaVariant: "outline" as const,
    highlight: false,
    badge: null,
    features: [
      { text: "5 audits per month", icon: Zap },
      { text: "3-pillar score (Findability, Trust, Answerability)", icon: BarChart3 },
      { text: "Top 3 issues to fix", icon: CheckCircle2 },
      { text: "Shareable Report Card", icon: Globe },
      { text: "40+ AI visibility checks", icon: CheckCircle2 },
    ],
    missing: [
      "AI-powered recommendations",
      "Content Intelligence (Citeability Score)",
      "Page monitoring & alerts",
      "PDF export",
      "History & progress tracking",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    price: { monthly: 39, yearly: 29 },
    description: "For freelancers, bloggers and small shops.",
    cta: "Start 7-day Free Trial",
    ctaVariant: "default" as const,
    highlight: true,
    badge: "Most Popular",
    features: [
      { text: "50 audits per month", icon: Zap },
      { text: "Everything in Free", icon: CheckCircle2 },
      { text: "AI-powered recommendations", icon: Brain },
      { text: "Content Intelligence & Citeability Score", icon: Brain },
      { text: "Monitor 10 pages (weekly re-audit)", icon: BarChart3 },
      { text: "Score history & progress tracking", icon: BarChart3 },
      { text: "PDF export", icon: Download },
      { text: "Email alerts on score drops", icon: Shield },
    ],
    missing: [
      "Competitor analysis",
      "White-label reports",
      "API access",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: { monthly: 129, yearly: 99 },
    description: "For SEO specialists and growing e-commerce.",
    cta: "Start 7-day Free Trial",
    ctaVariant: "default" as const,
    highlight: false,
    badge: null,
    features: [
      { text: "200 audits per month", icon: Zap },
      { text: "Everything in Starter", icon: CheckCircle2 },
      { text: "Monitor 50 pages", icon: BarChart3 },
      { text: "Competitor analysis (3 rivals)", icon: Users },
      { text: "Advanced content recommendations", icon: Brain },
      { text: "Priority support", icon: Shield },
    ],
    missing: [
      "White-label reports",
      "API access",
      "Unlimited audits",
    ],
  },
  {
    id: "agency",
    name: "Agency",
    price: { monthly: 349, yearly: 299 },
    description: "For agencies and enterprise teams.",
    cta: "Contact Sales",
    ctaVariant: "outline" as const,
    highlight: false,
    badge: null,
    features: [
      { text: "Unlimited audits", icon: Infinity },
      { text: "Everything in Pro", icon: CheckCircle2 },
      { text: "Monitor unlimited pages", icon: BarChart3 },
      { text: "White-label PDF reports", icon: Download },
      { text: "REST API access", icon: Globe },
      { text: "Shopify / WooCommerce integration", icon: Globe },
      { text: "Dedicated account manager", icon: Users },
      { text: "Custom SLA", icon: Shield },
    ],
    missing: [],
  },
];

const faqs = [
  {
    q: "What is AI Search visibility?",
    a: "AI Search visibility measures how likely your page is to be cited or referenced by AI assistants like ChatGPT, Perplexity, Google AI Overviews, and Claude when users ask questions related to your content.",
  },
  {
    q: "How is GEO-Auditor different from regular SEO tools?",
    a: "Traditional SEO tools focus on Google's ranking algorithm. GEO-Auditor specifically analyzes how AI crawlers access your page, how well your content can be extracted and cited by AI, and whether your trust signals meet the standards AI models use to evaluate sources.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. All paid plans are month-to-month (or yearly with a discount). You can cancel anytime from your dashboard — no questions asked.",
  },
  {
    q: "What happens to my data after I cancel?",
    a: "Your audit history and monitored pages are retained for 30 days after cancellation, giving you time to export your data.",
  },
  {
    q: "Do you offer a free trial?",
    a: "Yes — Starter and Pro plans include a 7-day free trial. No credit card required to start.",
  },
  {
    q: "Is there a limit on the free plan?",
    a: "The free plan allows 5 audits per month. There's no time limit — you can use the free plan indefinitely.",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function Pricing() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const [billing, setBilling] = useState<"monthly" | "yearly">("yearly");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const handleCta = (planId: string) => {
    if (planId === "free") {
      navigate("/");
    } else if (planId === "agency") {
      window.location.href = "mailto:hello@geo-auditor.com?subject=Agency Plan Inquiry";
    } else {
      // For paid plans — sign in first, then upgrade (Stripe not yet integrated)
      if (!isAuthenticated) {
        window.location.href = getLoginUrl();
      } else {
        // TODO: Stripe checkout
        window.alert("Stripe integration coming soon! You'll be notified when payment is available.");
      }
    }
  };

  return (
    <div className="min-h-screen bg-[oklch(0.08_0.015_250)] text-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <button onClick={() => navigate("/")} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
            <Bot className="w-3 h-3 text-white" />
          </div>
          <span className="text-sm font-bold text-white">GEO-Auditor</span>
        </div>
        <Button size="sm" onClick={() => navigate("/")} className="bg-violet-600 hover:bg-violet-500 text-white text-xs gap-1.5">
          Try Free <ArrowRight className="w-3 h-3" />
        </Button>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <Badge className="mb-4 bg-violet-500/15 text-violet-300 border-violet-500/30 text-xs">
            Simple, transparent pricing
          </Badge>
          <h1 className="text-4xl sm:text-5xl font-black text-white mb-4 leading-tight">
            Stop being invisible<br />to AI search
          </h1>
          <p className="text-lg text-slate-400 max-w-xl mx-auto mb-8">
            Start free. Upgrade when you're ready to monitor, track progress, and get AI-powered recommendations.
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
            <button
              onClick={() => setBilling("monthly")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${billing === "monthly" ? "bg-white text-slate-900" : "text-slate-400 hover:text-white"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling("yearly")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${billing === "yearly" ? "bg-white text-slate-900" : "text-slate-400 hover:text-white"}`}
            >
              Yearly
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">-25%</span>
            </button>
          </div>
        </div>

        {/* Plans grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-2xl border p-6 flex flex-col ${
                plan.highlight
                  ? "border-violet-500/50 bg-gradient-to-b from-violet-500/10 to-transparent"
                  : "border-white/8 bg-white/3"
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-violet-600 text-white border-0 text-[10px] px-3">
                    <Star className="w-2.5 h-2.5 mr-1" />
                    {plan.badge}
                  </Badge>
                </div>
              )}

              <div className="mb-5">
                <div className="text-sm font-semibold text-slate-300 mb-1">{plan.name}</div>
                <div className="flex items-end gap-1 mb-2">
                  <span className="text-4xl font-black text-white">
                    ${billing === "yearly" ? plan.price.yearly : plan.price.monthly}
                  </span>
                  {plan.price.monthly > 0 && (
                    <span className="text-slate-500 text-sm mb-1">/mo</span>
                  )}
                </div>
                {plan.price.monthly > 0 && billing === "yearly" && (
                  <div className="text-[10px] text-emerald-400">
                    Billed ${plan.price.yearly * 12}/year · Save ${(plan.price.monthly - plan.price.yearly) * 12}/yr
                  </div>
                )}
                <p className="text-xs text-slate-500 mt-2">{plan.description}</p>
              </div>

              <Button
                onClick={() => handleCta(plan.id)}
                variant={plan.highlight ? "default" : plan.ctaVariant}
                className={`w-full mb-5 text-sm ${plan.highlight ? "bg-violet-600 hover:bg-violet-500 text-white" : ""}`}
              >
                {plan.cta}
              </Button>

              <div className="space-y-2.5 flex-1">
                {plan.features.map((f, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span className="text-xs text-slate-300">{f.text}</span>
                  </div>
                ))}
                {plan.missing.map((m, i) => (
                  <div key={i} className="flex items-start gap-2.5 opacity-35">
                    <div className="w-3.5 h-3.5 rounded-full border border-slate-600 shrink-0 mt-0.5" />
                    <span className="text-xs text-slate-500">{m}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Social proof strip */}
        <div className="rounded-2xl border border-white/8 bg-white/3 p-6 mb-16">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
            <div>
              <div className="text-3xl font-black text-white mb-1">2,400+</div>
              <div className="text-xs text-slate-400">Pages audited this month</div>
            </div>
            <div>
              <div className="text-3xl font-black text-white mb-1">+31 pts</div>
              <div className="text-xs text-slate-400">Average score improvement after fixes</div>
            </div>
            <div>
              <div className="text-3xl font-black text-white mb-1">4.9 / 5</div>
              <div className="flex items-center justify-center gap-0.5 mt-1">
                {[...Array(5)].map((_, i) => <Star key={i} className="w-3 h-3 text-amber-400 fill-amber-400" />)}
              </div>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-black text-white text-center mb-8">Frequently asked questions</h2>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full p-4 flex items-center justify-between gap-4 text-left hover:bg-white/3 transition-colors"
                >
                  <span className="text-sm font-medium text-white">{faq.q}</span>
                  <div className={`w-5 h-5 rounded-full border border-white/20 flex items-center justify-center shrink-0 transition-transform ${openFaq === i ? "rotate-45" : ""}`}>
                    <span className="text-slate-400 text-sm leading-none">+</span>
                  </div>
                </button>
                {openFaq === i && (
                  <div className="border-t border-white/8 px-4 pb-4 pt-3">
                    <p className="text-xs text-slate-400 leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-16">
          <h3 className="text-2xl font-black text-white mb-3">Ready to get found by AI?</h3>
          <p className="text-sm text-slate-400 mb-6">Start with a free audit — no credit card, no signup required.</p>
          <Button onClick={() => navigate("/")} className="bg-violet-600 hover:bg-violet-500 text-white gap-2 text-base px-8 py-3 h-auto">
            <Zap className="w-4 h-4" /> Audit your page for free
          </Button>
        </div>
      </div>
    </div>
  );
}
