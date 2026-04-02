import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, ArrowLeft, Bot, Zap, Shield, Building2, Star,
  ArrowRight, Globe, Brain, BarChart3, Download, Users, Infinity,
  ChevronDown, ChevronUp, Loader2,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const plans = [
  {
    id: "free",
    name: "Free",
    price: { monthly: 0, yearly: 0 },
    description: "Spróbuj teraz — bez karty kredytowej.",
    cta: "Zacznij za darmo",
    highlight: false,
    badge: null,
    features: [
      "5 audytów miesięcznie",
      "40+ testów widoczności AI",
      "Lista krytycznych problemów z poprawkami",
      "Content Intelligence (Citeability Score)",
      "Udostępnialny raport diagnostyczny",
    ],
    missing: [
      "Rekomendacje AI",
      "Monitoring stron i alerty",
      "Eksport PDF",
      "Historia i śledzenie postępów",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    price: { monthly: 39, yearly: 29 },
    description: "Dla freelancerów, bloggerów i małych sklepów.",
    cta: "Zacznij 7-dniowy trial",
    highlight: true,
    badge: "Najpopularniejszy",
    features: [
      "50 audytów miesięcznie",
      "Wszystko z Free",
      "Rekomendacje naprawcze AI",
      "Monitoring 10 stron (re-audyt co tydzień)",
      "Historia wyników i śledzenie postępów",
      "Eksport PDF",
      "Alerty email przy spadku wyniku",
    ],
    missing: [
      "Analiza konkurencji",
      "Raporty white-label",
      "Dostęp do API",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: { monthly: 129, yearly: 99 },
    description: "Dla specjalistów SEO i rosnącego e-commerce.",
    cta: "Zacznij 7-dniowy trial",
    highlight: false,
    badge: null,
    features: [
      "200 audytów miesięcznie",
      "Wszystko ze Starter",
      "Monitoring 50 stron",
      "Analiza konkurencji (3 rywali)",
      "Zaawansowane rekomendacje contentowe",
      "Wsparcie priorytetowe",
    ],
    missing: [
      "Raporty white-label",
      "Dostęp do API",
    ],
  },
  {
    id: "agency",
    name: "Agency",
    price: { monthly: 349, yearly: 299 },
    description: "Dla agencji i teamów enterprise.",
    cta: "Skontaktuj się",
    highlight: false,
    badge: null,
    features: [
      "Nieograniczone audyty",
      "Wszystko z Pro",
      "Monitoring nieograniczonej liczby stron",
      "Raporty PDF white-label",
      "Dostęp do REST API",
      "Integracja Shopify / WooCommerce",
      "Dedykowany opiekun konta",
    ],
    missing: [],
  },
];

const faqs = [
  {
    q: "Czym jest widoczność w AI Search?",
    a: "Widoczność w AI Search mierzy, jak bardzo prawdopodobne jest, że Twoja strona zostanie zacytowana lub przywołana przez asystentów AI, takich jak ChatGPT, Perplexity, Google AI Overviews czy Claude, gdy użytkownicy zadają pytania związane z Twoją treścią.",
  },
  {
    q: "Czym GEO-Auditor różni się od zwykłych narzędzi SEO?",
    a: "Tradycyjne narzędzia SEO skupiają się na algorytmie rankingowym Google. GEO-Auditor diagnozuje konkretnie, dlaczego crawlery AI mogą pomijać Twoją stronę i co uniemożliwia cytowanie Twojej treści w odpowiedziach generowanych przez AI.",
  },
  {
    q: "Czy mogę anulować w dowolnym momencie?",
    a: "Tak. Wszystkie płatne plany są miesięczne (lub roczne z rabatem). Możesz anulować w dowolnym momencie z poziomu dashboardu — bez zbędnych pytań.",
  },
  {
    q: "Czy oferujecie darmowy okres próbny?",
    a: "Tak — plany Starter i Pro zawierają 7-dniowy darmowy trial. Karta kredytowa nie jest wymagana na początku.",
  },
  {
    q: "Czy plan darmowy ma jakieś limity?",
    a: "Plan darmowy pozwala na 5 audytów miesięcznie bez limitu czasowego. Możesz korzystać z niego bezterminowo.",
  },
];

export default function Pricing() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const [billing, setBilling] = useState<"monthly" | "yearly">("yearly");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const createCheckout = trpc.payments.createCheckout.useMutation({
    onSuccess: ({ url }) => {
      window.open(url, "_blank");
      toast.success("Przekierowywanie do kasy", {
        description: "Nowa karta została otwarta ze stroną płatności Stripe.",
      });
      setLoadingPlan(null);
    },
    onError: (err) => {
      toast.error("Błąd płatności", { description: err.message });
      setLoadingPlan(null);
    },
  });

  const handleCta = (planId: string) => {
    if (planId === "free") {
      navigate("/");
    } else if (planId === "agency") {
      window.location.href = "mailto:hello@geo-auditor.com?subject=Agency Plan Inquiry";
    } else {
      if (!isAuthenticated) {
        window.location.href = getLoginUrl();
      } else {
        setLoadingPlan(planId);
        createCheckout.mutate({
          planId: planId as "starter" | "pro" | "business",
          origin: window.location.origin,
        });
      }
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="sticky top-0 z-40">
        <div className="glass-strong border-b border-border/30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <button onClick={() => navigate("/")} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">Powrót</span>
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shadow-sm shadow-primary/20">
                <Bot className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="text-sm font-bold tracking-tight">GEO-Auditor</span>
            </div>
            <Button size="sm" onClick={() => navigate("/")} className="gap-1.5 text-xs h-8 shadow-md shadow-primary/20">
              Spróbuj za darmo <ArrowRight className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-black mb-4 leading-tight">
            Przestań być niewidoczny dla AI Search
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-8">
            Zacznij za darmo. Przejdź na wyższy plan, gdy będziesz gotowy monitorować, śledzić postępy i korzystać z rekomendacji AI.
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-card border border-border/50">
            <button
              onClick={() => setBilling("monthly")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${billing === "monthly" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
            >
              Miesięcznie
            </button>
            <button
              onClick={() => setBilling("yearly")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${billing === "yearly" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
            >
              Rocznie
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
                  {plan.price.monthly > 0 && <span className="text-muted-foreground text-sm mb-1">/mies.</span>}
                </div>
                {plan.price.monthly > 0 && billing === "yearly" && (
                  <div className="text-[10px] text-emerald-400">
                    Rozliczane ${plan.price.yearly * 12}/rok · Oszczędzasz ${(plan.price.monthly - plan.price.yearly) * 12}/rok
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
          <h2 className="text-2xl font-black text-center mb-8">Najczęściej zadawane pytania</h2>
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
          <h3 className="text-2xl font-black mb-3">Gotowy, żeby znaleźć swoje problemy?</h3>
          <p className="text-sm text-muted-foreground mb-6">Zacznij od darmowej diagnostyki — bez karty kredytowej, bez rejestracji.</p>
          <Button onClick={() => navigate("/")} className="gap-2 text-base px-8 py-3 h-auto">
            <Zap className="w-4 h-4" /> Zdiagnozuj swoją stronę za darmo
          </Button>
        </div>
      </div>
    </div>
  );
}
