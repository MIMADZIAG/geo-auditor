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
    id: "starter",
    name: "Starter",
    price: { monthly: 79, yearly: 59 },
    description: "Dla właścicieli sklepów e-commerce, content managerów i specjalistów SEO.",
    cta: "Zacznij z Starter",
    highlight: false,
    badge: null,
    features: [
      "50 analiz Signal Audit / mies.",
      "40+ sprawdzeń technicznych i contentowych",
      "AI Readiness Score 0–100",
      "Signal Rewrite — 10 przepisań/mies.",
      "Pulse Monitor — 10 stron (re-audyt co 7 dni)",
      "Historia AI Readiness Score",
      "Eksport PDF",
      "Alerty email przy spadku wyniku",
    ],
    missing: [
      "Citation Intelligence Pro (3 konkurenci)",
      "Signal Rewrite bez limitu",
      "Pulse Monitor 50 stron",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: { monthly: 129, yearly: 99 },
    description: "Pełna moc platformy. Dla e-commerce i agencji z rosnącą skalą.",
    cta: "Zacznij z Pro",
    highlight: true,
    badge: "Najlepsza wartość",
    features: [
      "200 analiz Signal Audit / mies.",
      "Wszystko ze Starter",
      "Pulse Monitor — 50 stron",
      "Citation Intelligence Pro — 3 konkurenci",
      "Signal Rewrite bez limitu",
      "Priorytetowe wsparcie",
    ],
    missing: [],
  },
];

const faqs = [
  {
    q: "Czym jest AI Readiness Score?",
    a: "AI Readiness Score (0–100) to wynik Signal Audit — agregat 40+ sprawdzeń technicznych i contentowych, które decydują o tym, czy ChatGPT, Gemini, Perplexity i Google AI Overviews cytują daną podstronę. Im wyższy score, tym wyższa szansa na cytowanie.",
  },
  {
    q: "Czym GEO-Auditor różni się od Semrush czy Ahrefs?",
    a: "Semrush i Ahrefs mierzą widoczność w tradycyjnym Google Search. GEO-Auditor analizuje wyłącznie sygnały AI Search na poziomie konkretnej podstrony — nie domeny. To różne metryki, różne algorytmy, różne rekomendacje.",
  },
  {
    q: "Czy mogę anulować w dowolnym momencie?",
    a: "Tak. Plany Starter i Pro są miesięczne lub roczne z rabatem 25%. Anulujesz w dowolnym momencie z poziomu Command Center — bez formularzy, bez czekania. Dostęp do płatnych funkcji pozostaje aktywny do końca opłaconego okresu.",
  },
  {
    q: "Czy jest bezpłatna wersja?",
    a: "Tak — jeden pełny Signal Audit bezpłatnie, bez rejestracji i bez karty. Obejmuje pełną diagnostykę: 40+ sprawdzeń, AI Readiness Score i Content Intelligence. Aby korzystać z historii, Pulse Monitor i Signal Rewrite, wybierz plan Starter lub Pro.",
  },
  {
    q: "Jaka jest różnica między Starter a Pro?",
    a: "Starter to 50 audytów Signal Audit miesięcznie, Pulse Monitor dla 10 stron i 10 przepisań Signal Rewrite. Pro to 200 audytów, Pulse Monitor dla 50 stron, Signal Rewrite bez limitu i Citation Intelligence Pro z analizą 3 konkurentów. Jeśli prowadzisz sklep lub agencję z więcej niż 10 monitorowanymi stronami — Pro jest właściwym wyborem.",
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
    if (!isAuthenticated) {
      window.location.href = getLoginUrl();
    } else {
      setLoadingPlan(planId);
      createCheckout.mutate({
        planId: planId as "starter" | "pro" | "business",
        origin: window.location.origin,
      });
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
            Jeden URL. Pełna diagnostyka.<br />
            <span className="gradient-text">Gotowy plan naprawy.</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-8">
            Pierwszy Signal Audit bezpłatnie — bez rejestracji i bez karty. Skaluj do Pulse Monitor i Citation Intelligence gdy wyniki rosną.
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl mx-auto mb-16">
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
          <h2 className="text-2xl font-black text-center mb-8">Pytania</h2>
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
          <h3 className="text-2xl font-black mb-3">Zacznij od jednego URL.</h3>
          <p className="text-sm text-muted-foreground mb-6">Bez konta. Bez karty. Pełny Signal Audit w 60 sekund.</p>
          <Button onClick={() => navigate("/")} className="gap-2 text-base px-8 py-3 h-auto">
            <Zap className="w-4 h-4" /> Sprawdź sygnał swojej strony
          </Button>
        </div>
      </div>
    </div>
  );
}
