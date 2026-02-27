import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, ArrowLeft, Bot, Zap, Shield, Building2, Star,
  ArrowRight, Globe, Brain, BarChart3, Download, Users, Infinity,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";

const plans = [
  {
    id: "free",
    name: "Free",
    price: { monthly: 0, yearly: 0 },
    description: "Try it now — no credit card needed.",
    cta: "Start for Free",
    highlight: false,
    badge: null,
    features: [
      "5 audits per month",
      "40+ AI visibility checks",
      "Critical issues list with fixes",
      "Content Intelligence (Citeability Score)",
      "Shareable diagnostic report",
    ],
    missing: [
      "AI-powered recommendations",
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
    highlight: true,
    badge: "Most Popular",
    features: [
      "50 audits per month",
      "Everything in Free",
      "AI-powered fix recommendations",
      "Monitor 10 pages (weekly re-audit)",
      "Score history & progress tracking",
      "PDF export",
      "Email alerts on score drops",
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
    highlight: false,
    badge: null,
    features: [
      "200 audits per month",
      "Everything in Starter",
      "Monitor 50 pages",
      "Competitor analysis (3 rivals)",
      "Advanced content recommendations",
      "Priority support",
    ],
    missing: [
      "White-label reports",
      "API access",
    ],
  },
  {
    id: "agency",
    name: "Agency",
    price: { monthly: 349, yearly: 299 },
    description: "For agencies and enterprise teams.",
    cta: "Contact Sales",
    highlight: false,
    badge: null,
    features: [
      "Unlimited audits",
      "Everything in Pro",
      "Monitor unlimited pages",
      "White-label PDF reports",
      "REST API access",
      "Shopify / WooCommerce integration",
      "Dedicated account manager",
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
    a: "Traditional SEO tools focus on Google's ranking algorithm. GEO-Auditor specifically diagnoses why AI crawlers may skip your page, and what prevents your content from being cited in AI-generated answers.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. All paid plans are month-to-month (or yearly with a discount). You can cancel anytime from your dashboard — no questions asked.",
  },
  {
    q: "Do you offer a free trial?",
    a: "Yes — Starter and Pro plans include a 7-day free trial. No credit card required to start.",
  },
  {
    q: "Is there a limit on the free plan?",
    a: "The free plan allows 5 audits per month with no time limit. You can use it indefinitely.",
  },
];

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
      if (!isAuthenticated) {
        window.location.href = getLoginUrl();
      } else {
        window.alert("Stripe integration coming soon! You'll be notified when payment is available.");
      }
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-border/40">
        <button onClick={() => navigate("/")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
            <Bot className="w-3 h-3 text-primary-foreground" />
          </div>
          <span className="text-sm font-bold">GEO-Auditor</span>
        </div>
        <Button size="sm" onClick={() => navigate("/")} className="gap-1.5 text-xs">
          Try Free <ArrowRight className="w-3 h-3" />
        </Button>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-black mb-4 leading-tight">
            Stop being invisible to AI search
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-8">
            Start free. Upgrade when you're ready to monitor, track progress, and get AI-powered recommendations.
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-card border border-border/50">
            <button
              onClick={() => setBilling("monthly")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${billing === "monthly" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling("yearly")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${billing === "yearly" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
            >
              Yearly
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">-25%</span>
            </button>
          </div>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-2xl border p-6 flex flex-col ${plan.highlight ? "border-primary/50 bg-primary/5" : "border-border/50 bg-card"}`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                    <Star className="w-2.5 h-2.5" />
                    {plan.badge}
                  </span>
                </div>
              )}

              <div className="mb-5">
                <div className="text-sm font-semibold text-muted-foreground mb-1">{plan.name}</div>
                <div className="flex items-end gap-1 mb-1">
                  <span className="text-4xl font-black">
                    ${billing === "yearly" ? plan.price.yearly : plan.price.monthly}
                  </span>
                  {plan.price.monthly > 0 && <span className="text-muted-foreground text-sm mb-1">/mo</span>}
                </div>
                {plan.price.monthly > 0 && billing === "yearly" && (
                  <div className="text-[10px] text-emerald-400">
                    Billed ${plan.price.yearly * 12}/year · Save ${(plan.price.monthly - plan.price.yearly) * 12}/yr
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-2">{plan.description}</p>
              </div>

              <Button
                onClick={() => handleCta(plan.id)}
                variant={plan.highlight ? "default" : "outline"}
                className="w-full mb-5 text-sm"
              >
                {plan.cta}
              </Button>

              <div className="space-y-2.5 flex-1">
                {plan.features.map((f, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span className="text-xs text-foreground">{f}</span>
                  </div>
                ))}
                {plan.missing.map((m, i) => (
                  <div key={i} className="flex items-start gap-2.5 opacity-35">
                    <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground shrink-0 mt-0.5" />
                    <span className="text-xs text-muted-foreground">{m}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-black text-center mb-8">Frequently asked questions</h2>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="rounded-xl border border-border/50 bg-card overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full p-4 flex items-center justify-between gap-4 text-left hover:bg-muted/10 transition-colors"
                >
                  <span className="text-sm font-medium">{faq.q}</span>
                  {openFaq === i ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                </button>
                {openFaq === i && (
                  <div className="border-t border-border/30 px-4 pb-4 pt-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-16">
          <h3 className="text-2xl font-black mb-3">Ready to find your issues?</h3>
          <p className="text-sm text-muted-foreground mb-6">Start with a free diagnostic — no credit card, no signup required.</p>
          <Button onClick={() => navigate("/")} className="gap-2 text-base px-8 py-3 h-auto">
            <Zap className="w-4 h-4" /> Diagnose your page for free
          </Button>
        </div>
      </div>
    </div>
  );
}
