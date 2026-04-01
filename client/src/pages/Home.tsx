import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl, PENDING_AUDIT_KEY } from "@/const";
import { usePendingAudit } from "@/hooks/usePendingAudit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Bot,
  Search,
  Zap,
  Shield,
  BarChart3,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Brain,
  LayoutDashboard,
  LogIn,
  Target,
  TrendingUp,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Globe,
  Eye,
  RefreshCw,
  Star,
  MessageSquare,
  Link2,
  Cpu,
  BadgeCheck,
  Activity,
  Lock,
  ArrowUpRight,
  Layers,
  FileText,
} from "lucide-react";

// ─── FAQ Item ─────────────────────────────────────────────────────────────────
function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border/40 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-4 text-left gap-4 group"
      >
        <span className="font-medium text-sm sm:text-base group-hover:text-primary transition-colors">{q}</span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {open && <p className="text-sm text-muted-foreground leading-relaxed pb-4">{a}</p>}
    </div>
  );
}

// ─── Animated counter hook ────────────────────────────────────────────────────
function useCounter(target: number, duration = 1800) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setValue(target); clearInterval(timer); }
      else setValue(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return value;
}

// ─── Workflow Step Card ────────────────────────────────────────────────────────
function WorkflowStep({
  number, icon: Icon, title, desc, color, isLast,
}: {
  number: string; icon: React.ElementType; title: string; desc: string; color: string; isLast?: boolean;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        {!isLast && <div className="w-px flex-1 bg-border/40 mt-2 mb-0 min-h-[32px]" />}
      </div>
      <div className="pb-6">
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-0.5">{number}</div>
        <div className="font-bold text-sm mb-1">{title}</div>
        <div className="text-xs text-muted-foreground leading-relaxed">{desc}</div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Home() {
  const [url, setUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [annual, setAnnual] = useState(false);
  const [, navigate] = useLocation();
  const { isAuthenticated, user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: statsData } = trpc.audit.getGlobalStats.useQuery(undefined, { staleTime: 60_000 });
  const realAuditsCount = statsData?.totalAudits ?? 0;
  const auditsCount = useCounter(realAuditsCount > 0 ? realAuditsCount : 0);

  usePendingAudit(isAuthenticated);

  const createAuditMutation = trpc.audit.run.useMutation({
    onSuccess: (data: { auditId: number }) => {
      navigate(`/results/${data.auditId}`);
    },
    onError: (error: { message?: string }) => {
      setIsSubmitting(false);
      setScanStep(0);
      toast.error(error.message || "Błąd podczas tworzenia audytu");
    },
  });

  useEffect(() => {
    if (!isSubmitting) return;
    const interval = setInterval(() => {
      setScanStep((s) => (s + 1) % SCAN_STEPS.length);
    }, 900);
    return () => clearInterval(interval);
  }, [isSubmitting]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) { toast.error("Wklej URL strony do audytu"); return; }
    let normalized = trimmed;
    if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
      normalized = "https://" + normalized;
    }
    try { new URL(normalized); } catch {
      toast.error("Nieprawidłowy URL — sprawdź format");
      return;
    }
    if (!isAuthenticated) {
      localStorage.setItem(PENDING_AUDIT_KEY, normalized);
      window.location.href = getLoginUrl();
      return;
    }
    setIsSubmitting(true);
    setScanStep(0);
    createAuditMutation.mutate({ url: normalized });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 border-b border-border/30 bg-background/90 backdrop-blur-md">
        <div className="container max-w-6xl mx-auto flex items-center justify-between h-14">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <Bot className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="font-black text-base tracking-tight">GEO-Auditor</span>
          </div>
          <div className="flex items-center gap-1">
            <a href="#how-it-works" className="hidden sm:block text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5">Jak działa</a>
            <a href="#pricing" className="hidden sm:block text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5">Cennik</a>
            {isAuthenticated ? (
              <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="gap-1.5 text-xs h-8">
                <LayoutDashboard className="w-3.5 h-3.5" /> Dashboard
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => (window.location.href = getLoginUrl())} className="gap-1.5 text-xs h-8 text-primary">
                <LogIn className="w-3.5 h-3.5" /> Zaloguj się
              </Button>
            )}
            <Button size="sm" onClick={() => inputRef.current?.focus()} className="h-8 text-xs gap-1.5 ml-1">
              <Search className="w-3 h-3" /> Audytuj URL
            </Button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-16 pb-12 px-4 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/4 rounded-full blur-3xl" />
          <div className="absolute top-20 right-1/4 w-[300px] h-[300px] bg-violet-500/3 rounded-full blur-3xl" />
        </div>

        <div className="container max-w-6xl mx-auto relative">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">

            {/* Left — headline + input */}
            <div className="pt-4">
              {/* Trust badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/8 border border-primary/20 text-xs text-primary font-semibold mb-6">
                <Zap className="w-3 h-3" />
                Jedyne narzędzie audytu AI Search na poziomie URL
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black leading-[1.1] tracking-tight mb-5">
                Twoja strona jest<br />
                <span className="gradient-text">niewidoczna w AI.</span><br />
                <span className="text-foreground/80">Naprawiamy to.</span>
              </h1>

              <p className="text-base text-muted-foreground leading-relaxed mb-8 max-w-md">
                Wklej URL dowolnej podstrony. W kilkadziesiąt sekund dostaniesz pełną analizę — co blokuje Cię w ChatGPT, Gemini i Google AI Overviews — i gotowy plan naprawy.
              </p>

              {/* URL Input */}
              <form onSubmit={handleSubmit} className="mb-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                      ref={inputRef}
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://twojasklep.pl/produkt/..."
                      className="pl-9 h-12 text-sm bg-card border-border/60 focus:border-primary/60"
                      disabled={isSubmitting}
                      autoComplete="url"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="h-12 px-6 font-bold gap-2 shrink-0"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                        <span className="hidden sm:inline text-xs">{SCAN_STEPS[scanStep]}</span>
                        <span className="sm:hidden">Skanuje…</span>
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4" />
                        <span>Audytuj</span>
                      </>
                    )}
                  </Button>
                </div>
              </form>

              {/* Trust signals */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  Bez rejestracji
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  Wyniki w &lt;60 sekund
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  {realAuditsCount > 0 ? `${auditsCount.toLocaleString("pl-PL")}+ audytów wykonanych` : "Pierwsze 5 audytów gratis"}
                </span>
              </div>

              {/* AI Engines strip */}
              <div className="mt-8 pt-6 border-t border-border/30">
                <div className="text-[10px] text-muted-foreground/60 uppercase tracking-widest font-semibold mb-3">Sprawdzamy widoczność w</div>
                <div className="flex flex-wrap items-center gap-3">
                  {AI_ENGINES.map((e) => (
                    <div key={e.name} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card border border-border/50 text-xs font-medium" style={{ color: e.color }}>
                      {e.icon}
                      <span className="text-foreground/80">{e.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right — workflow loop diagram */}
            <div className="lg:pt-4">
              <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-xl shadow-black/20">
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-semibold text-muted-foreground">Pętla widoczności AI</span>
                  <div className="ml-auto">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold border border-primary/20">4 kroki</span>
                  </div>
                </div>

                <WorkflowStep
                  number="Krok 01"
                  icon={Shield}
                  title="Audyt AI-Readiness"
                  desc="40+ sprawdzeń technicznych i contentowych. Dowiedz się co blokuje Cię w AI Search — robots.txt, schema.org, struktura treści, E-E-A-T."
                  color="border-primary/30 bg-primary/8 text-primary"
                />
                <WorkflowStep
                  number="Krok 02"
                  icon={Eye}
                  title="Analiza widoczności"
                  desc="Sprawdź czy jesteś cytowany w ChatGPT, Gemini i Google AI Overviews. Zobacz kto Cię wyprzedza i na jakich frazach."
                  color="border-violet-500/30 bg-violet-500/8 text-violet-400"
                />
                <WorkflowStep
                  number="Krok 03"
                  icon={Sparkles}
                  title="AI Content Creator"
                  desc="Przepisz treść z AI — oparty na danych z audytu i analizie cytowanych konkurentów. Gotowy tekst do wdrożenia."
                  color="border-blue-500/30 bg-blue-500/8 text-blue-400"
                />
                <WorkflowStep
                  number="Krok 04"
                  icon={Activity}
                  title="Monitoring & pętla"
                  desc="Śledź widoczność automatycznie. Alerty gdy konkurent Cię wyprzedza. Wróć do kroku 1 gdy score spada."
                  color="border-emerald-500/30 bg-emerald-500/8 text-emerald-400"
                  isLast
                />

                {/* Mock score preview */}
                <div className="mt-4 pt-4 border-t border-border/30 flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">Przykładowy wynik audytu</div>
                  <div className="flex items-center gap-3">
                    <div className="text-center">
                      <div className="text-[10px] text-muted-foreground mb-0.5">Przed</div>
                      <div className="text-lg font-black text-red-400">31</div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                    <div className="text-center">
                      <div className="text-[10px] text-muted-foreground mb-0.5">Po</div>
                      <div className="text-lg font-black text-emerald-400">78</div>
                    </div>
                    <div className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold">+47 pkt</div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── Problem strip ── */}
      <section className="py-10 px-4 border-y border-border/30 bg-muted/5">
        <div className="container max-w-5xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {PROBLEM_ITEMS.map((item) => (
              <div key={item.headline} className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${item.iconBg}`}>
                  <item.icon className={`w-5 h-5 ${item.iconColor}`} />
                </div>
                <div>
                  <div className="font-bold text-sm mb-1">{item.headline}</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">{item.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="py-20 px-4">
        <div className="container max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/8 border border-primary/20 text-xs text-primary font-semibold mb-4">
              <RefreshCw className="w-3.5 h-3.5" /> Jak działa pętla
            </div>
            <h2 className="text-2xl sm:text-3xl font-black mb-3">Od niewidoczności do cytowania — w 4 krokach</h2>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">Każdy krok buduje na poprzednim. Im dłużej działasz w pętli, tym wyższy score i więcej cytowań.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {WORKFLOW_CARDS.map((card, i) => (
              <div key={card.title} className={`rounded-2xl border p-5 flex flex-col gap-3 relative ${card.featured ? "border-primary/40 bg-gradient-to-br from-primary/6 to-background" : "border-border/50 bg-card"}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${card.iconBg}`}>
                  <card.icon className={`w-5 h-5 ${card.iconColor}`} />
                </div>
                <div className="absolute top-4 right-4 text-[10px] font-black text-muted-foreground/30 tabular-nums">0{i + 1}</div>
                <div>
                  <h3 className="font-bold text-sm mb-1.5">{card.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{card.desc}</p>
                </div>
                {card.bullets && (
                  <ul className="space-y-1 mt-auto pt-2 border-t border-border/30">
                    {card.bullets.map((b) => (
                      <li key={b} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />{b}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Emotional hook ── */}
      <section className="py-16 px-4 border-t border-border/30 bg-muted/5">
        <div className="container max-w-4xl mx-auto">
          <div className="rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/4 to-background p-8 sm:p-10">
            <div className="flex flex-col sm:flex-row items-start gap-6">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/12 border border-amber-500/25 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-black mb-3 leading-tight">
                  Każde zapytanie w ChatGPT to szansa sprzedażowa.<br />
                  <span className="text-amber-400">Twój konkurent ją właśnie zgarnął.</span>
                </h2>
                <p className="text-muted-foreground leading-relaxed mb-6 max-w-xl text-sm">
                  AI nie cytuje losowo. Wybiera strony, które spełniają konkretne kryteria techniczne i contentowe. GEO-Auditor pokazuje Ci dokładnie co robią lepiej Twoi rywale — i daje gotowy tekst, który odwraca tę sytuację.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {EMOTIONAL_ITEMS.map((item) => (
                    <div key={item.label} className="flex items-start gap-3 p-3 rounded-xl bg-background/60 border border-border/40">
                      <item.icon className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                      <div>
                        <div className="text-xs font-semibold mb-0.5">{item.label}</div>
                        <div className="text-[10px] text-muted-foreground leading-relaxed">{item.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Before / After content rewrite ── */}
      <section className="py-16 px-4 border-t border-border/30">
        <div className="container max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-xs text-violet-400 font-semibold mb-5">
                <Sparkles className="w-3.5 h-3.5" /> AI Content Creator
              </div>
              <h2 className="text-2xl sm:text-3xl font-black mb-4 leading-tight">
                Nie tylko "co poprawić" —<br />
                <span className="text-violet-400">gotowy tekst do wdrożenia</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-6 text-sm">
                AI Content Creator analizuje cytowanych przez AI konkurentów, wyciąga kluczowe fakty i encje, a następnie pisze nowy tekst zgodny z zasadami Helpful Content — lepszy od oryginału, zoptymalizowany pod AI Search.
              </p>
              <div className="space-y-3 mb-6">
                {REWRITE_BULLETS.map((b) => (
                  <div key={b.label} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-violet-500/12 flex items-center justify-center shrink-0 mt-0.5">
                      <b.icon className="w-3 h-3 text-violet-400" />
                    </div>
                    <div>
                      <span className="text-sm font-semibold">{b.label}</span>
                      <span className="text-xs text-muted-foreground ml-2">{b.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Before / After */}
            <div className="space-y-3">
              <div className="rounded-xl border border-red-500/20 bg-red-950/8 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="w-3.5 h-3.5 text-red-400" />
                  <span className="text-xs font-semibold text-red-400">Przed — oryginalny tekst</span>
                </div>
                <p className="text-xs text-muted-foreground/70 leading-relaxed italic">
                  "Oferujemy szeroki wybór produktów w atrakcyjnych cenach. Nasza firma działa od wielu lat na rynku i cieszy się zaufaniem klientów. Zapraszamy do zakupów."
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border/30" />
                <span className="flex items-center gap-1.5 text-[10px]"><Sparkles className="w-3 h-3 text-violet-400" /> AI Agents + analiza AI Search + E-E-A-T</span>
                <div className="h-px flex-1 bg-border/30" />
              </div>
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/8 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs font-semibold text-emerald-400">Po — przepisany przez AI</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  "Projekty domów parterowych do 120 m² kosztują od 3 500 do 8 000 zł netto (dane 2024). Parterowy układ eliminuje schody, co obniża koszty budowy o 8–12% vs. domy piętrowe. Najpopularniejsze układy: L-kształtny (większa prywatność ogrodu), prostokątny (niższy koszt dachu)…"
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-20 px-4 border-t border-border/30 bg-muted/5">
        <div className="container max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-black mb-3">Prosty cennik. Żadnych niespodzianek.</h2>
            <p className="text-muted-foreground text-sm mb-6">Zacznij za darmo. Przejdź na wyższy plan gdy zobaczysz wyniki.</p>
            <div className="inline-flex items-center gap-3 p-1 rounded-full bg-muted/30 border border-border/40">
              <button
                onClick={() => setAnnual(false)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${!annual ? "bg-background shadow text-foreground" : "text-muted-foreground"}`}
              >
                Miesięcznie
              </button>
              <button
                onClick={() => setAnnual(true)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${annual ? "bg-background shadow text-foreground" : "text-muted-foreground"}`}
              >
                Rocznie <span className="text-emerald-400 font-bold">-20%</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {PRICING_PLANS.map((plan) => (
              <div key={plan.name} className={`rounded-2xl border p-6 flex flex-col relative ${plan.featured ? "border-primary/50 bg-gradient-to-b from-primary/6 to-background shadow-lg shadow-primary/8" : "border-border/50 bg-card"}`}>
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wide">
                    {plan.badge}
                  </div>
                )}
                <div className="mb-5">
                  <h3 className="font-black text-lg mb-1">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mb-1">
                    {annual && plan.name !== "Free" && (
                      <span className="text-sm text-muted-foreground line-through mr-1">{plan.price}</span>
                    )}
                    <span className="text-3xl font-black">{annual && plan.name !== "Free" ? plan.priceAnnual : plan.price}</span>
                    {plan.period && <span className="text-sm text-muted-foreground">{plan.period}</span>}
                  </div>
                  {annual && plan.name !== "Free" && (
                    <div className="text-[10px] text-emerald-400 font-semibold mb-1">Rozliczane rocznie — oszczędzasz 20%</div>
                  )}
                  <p className="text-xs text-muted-foreground">{plan.desc}</p>
                </div>
                <ul className="space-y-2 flex-1 mb-6">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  onClick={() => {
                    if (plan.name === "Free") {
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    } else {
                      window.location.href = "/pricing";
                    }
                  }}
                  variant={plan.featured ? "default" : "outline"}
                  className="w-full"
                >
                  {plan.cta}
                </Button>
              </div>
            ))}
          </div>

          <div className="text-center mt-6 space-y-1">
            <p className="text-xs text-muted-foreground">Wszystkie plany płatne obsługiwane przez Stripe. Możesz anulować w dowolnym momencie.</p>
            <p className="text-xs text-emerald-400 font-semibold">14-dniowa gwarancja zwrotu pieniędzy — bez pytań.</p>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="py-16 px-4 border-t border-border/30">
        <div className="container max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-black mb-3">Często zadawane pytania</h2>
          </div>
          <div className="rounded-2xl border border-border/50 bg-card px-6">
            {FAQ.map((item) => <FAQItem key={item.q} {...item} />)}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-20 px-4 border-t border-border/30 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/4 rounded-full blur-3xl" />
        </div>
        <div className="container max-w-2xl mx-auto text-center relative">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-6">
            <Zap className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-black mb-4">
            Twoja konkurencja już to wie.<br />
            <span className="text-primary">Ty możesz wiedzieć za darmo.</span>
          </h2>
          <p className="text-muted-foreground mb-8 leading-relaxed text-sm">
            Jeden URL. Kilkadziesiąt sekund. Pełna analiza — bez rejestracji, bez karty.<br />
            Dowiedz się, dlaczego AI Cię ignoruje i co konkretnie zmienić.
          </p>
          <Button
            size="lg"
            onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); setTimeout(() => inputRef.current?.focus(), 400); }}
            className="gap-2 px-10 h-12 text-base font-bold"
          >
            <Search className="w-5 h-5" /> Sprawdź swoją stronę teraz
          </Button>
          <p className="text-xs text-muted-foreground mt-4">
            {realAuditsCount > 0
              ? `Dołącz do ${auditsCount.toLocaleString("pl-PL")}+ audytów już wykonanych`
              : "Bądź wśród pierwszych użytkowników GEO-Auditor"
            }
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border/30 py-12 px-4">
        <div className="container max-w-5xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-8 mb-8">
            <div className="sm:col-span-2">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5 text-primary-foreground" />
                </div>
                <span className="font-black text-base">GEO-Auditor</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">
                Jedyne narzędzie które audytuje pojedyncze podstrony pod kątem widoczności w AI Search — na poziomie URL, nie domeny.
              </p>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Produkt</div>
              <div className="space-y-2">
                <a href="#how-it-works" className="block text-xs text-muted-foreground hover:text-foreground transition-colors">Jak działa</a>
                <a href="#pricing" className="block text-xs text-muted-foreground hover:text-foreground transition-colors">Cennik</a>
                <a href="/dashboard" className="block text-xs text-muted-foreground hover:text-foreground transition-colors">Dashboard</a>
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Pomoc</div>
              <div className="space-y-2">
                <a href="#faq" className="block text-xs text-muted-foreground hover:text-foreground transition-colors">FAQ</a>
                <a href="mailto:hello@geoauditor.app" className="block text-xs text-muted-foreground hover:text-foreground transition-colors">Kontakt</a>
              </div>
            </div>
          </div>
          <div className="border-t border-border/30 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">© 2026 GEO-Auditor. Wszelkie prawa zastrzeżone.</p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <a href="#" className="hover:text-foreground transition-colors">Polityka prywatności</a>
              <a href="#" className="hover:text-foreground transition-colors">Regulamin</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const SCAN_STEPS = [
  "Głęboka analiza strony…",
  "Sprawdzanie dostępu crawlerów AI…",
  "Analiza danych strukturalnych…",
  "Ocena jakości contentu…",
  "Uruchamianie analizy LLM…",
];

const AI_ENGINES = [
  {
    name: "ChatGPT",
    color: "#10a37f",
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
        <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.896zm16.597 3.855l-5.843-3.372L15.115 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.403-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
      </svg>
    ),
  },
  {
    name: "Google AI",
    color: "#4285f4",
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    ),
  },
  {
    name: "Perplexity",
    color: "#20b2aa",
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" style={{ color: "#20b2aa" }}>
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
      </svg>
    ),
  },
  {
    name: "Gemini",
    color: "#8b5cf6",
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" style={{ color: "#8b5cf6" }}>
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
      </svg>
    ),
  },
];

const PROBLEM_ITEMS = [
  {
    icon: AlertTriangle,
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-400",
    headline: "AI Search zmienia zasady",
    body: "ChatGPT, Gemini i Perplexity nie indeksują stron jak Google. Mają własne kryteria cytowania — i większość stron ich nie zna.",
  },
  {
    icon: Target,
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    headline: "Audyt na poziomie URL",
    body: "Nie domena, nie ogólna widoczność — konkretna podstrona. Produkt, artykuł, landing. Dokładnie tam, gdzie tracisz klientów.",
  },
  {
    icon: Zap,
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-400",
    headline: "Konkretne kroki, nie ogólniki",
    body: "Nie \"popraw content\". Dostaniesz listę zadań: co dodać, co zmienić, co usunąć — razem z gotowym tekstem po poprawkach.",
  },
];

const WORKFLOW_CARDS = [
  {
    icon: Shield,
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    title: "Audyt AI-Readiness",
    featured: true,
    desc: "40+ sprawdzeń technicznych i contentowych. Jeden score 0–100 pokazujący jak widoczna jest Twoja strona dla AI.",
    bullets: ["robots.txt, schema.org, Core Web Vitals", "Content Intelligence (5 wymiarów)", "E-E-A-T & Helpful Content"],
  },
  {
    icon: Eye,
    iconBg: "bg-violet-500/10",
    iconColor: "text-violet-400",
    title: "Analiza widoczności",
    featured: false,
    desc: "Sprawdź czy jesteś cytowany w AI Search na frazach, które mają znaczenie dla Twojego biznesu.",
    bullets: ["ChatGPT, Gemini, Perplexity, Google AI", "Pełna lista URL-i konkurencji", "Per-frazowa analiza porównawcza"],
  },
  {
    icon: Sparkles,
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-400",
    title: "AI Content Creator",
    featured: false,
    desc: "Przepisz treść z AI opartym na danych z audytu i analizie cytowanych konkurentów.",
    bullets: ["Analiza wzorców AI Search", "Ekstrakcja wiedzy z konkurentów", "Gotowy tekst do wdrożenia"],
  },
  {
    icon: Activity,
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-400",
    title: "Monitoring & pętla",
    featured: false,
    desc: "Śledź widoczność automatycznie. Wróć do kroku 1 gdy score spada lub pojawi się nowy konkurent.",
    bullets: ["Cotygodniowe re-audyty", "Alerty o zmianach widoczności", "Historia postępu"],
  },
];

const EMOTIONAL_ITEMS = [
  { icon: Eye, label: "Kto Cię wyprzedza", desc: "Pełna lista URL-i cytowanych przez AI zamiast Ciebie" },
  { icon: Target, label: "Dlaczego ich cytuje", desc: "Konkretne powody: struktura, fakty, schema.org" },
  { icon: Sparkles, label: "Jak ich pobić", desc: "Przepisany tekst gotowy do wdrożenia w 1 klik" },
];

const REWRITE_BULLETS = [
  { icon: Globe, label: "Analiza wzorców AI Search", desc: "Co AI aktualnie cytuje i dlaczego" },
  { icon: Brain, label: "Ekstrakcja wiedzy", desc: "Fakty, liczby, encje z Knowledge Graph" },
  { icon: BadgeCheck, label: "Weryfikacja E-E-A-T", desc: "Auto-rewizja gdy jakość < 7.5/10" },
  { icon: Sparkles, label: "Helpful Content", desc: "Tekst lepszy od oryginału, gotowy do wdrożenia" },
];

const PRICING_PLANS = [
  {
    name: "Free",
    price: "0 zł",
    priceAnnual: "0 zł",
    period: "",
    desc: "Idealne do pierwszego audytu",
    featured: false,
    cta: "Zacznij za darmo",
    badge: null,
    features: [
      "5 audytów / miesiąc",
      "AI Visibility Score",
      "Audyt techniczny (40+ checks)",
      "Content Intelligence",
      "1 monitorowana strona",
    ],
  },
  {
    name: "Starter",
    price: "149 zł",
    priceAnnual: "119 zł",
    period: "/ mies.",
    desc: "Dla właścicieli sklepów i content managerów",
    featured: true,
    cta: "Wybierz Starter",
    badge: "Najpopularniejszy",
    features: [
      "50 audytów / miesiąc",
      "AI Citations (Google + ChatGPT)",
      "Full Rewrite AI (10 rewrite/mies.)",
      "Historia audytów",
      "Monitoring 10 podstron",
      "Eksport PDF",
      "Priorytetowe wsparcie",
    ],
  },
  {
    name: "Pro",
    price: "399 zł",
    priceAnnual: "319 zł",
    period: "/ mies.",
    desc: "Dla agencji i specjalistów SEO",
    featured: false,
    cta: "Wybierz Pro",
    badge: null,
    features: [
      "200 audytów / miesiąc",
      "Analiza 3 konkurentów",
      "Full Rewrite AI bez limitu",
      "Monitoring 50 podstron",
      "Zaawansowane rekomendacje",
      "API dostęp",
      "White-label raporty",
    ],
  },
];

const FAQ = [
  {
    q: "Czym różni się GEO-Auditor od narzędzi SEO jak Semrush czy Ahrefs?",
    a: "Semrush i Ahrefs analizują widoczność w tradycyjnym Google Search. GEO-Auditor skupia się wyłącznie na AI Search — ChatGPT, Gemini, Perplexity, Google AI Overviews. To zupełnie inne kryteria: AI cytuje strony za jakość treści, fakty, strukturę i E-E-A-T — nie za linki.",
  },
  {
    q: "Czy mogę audytować dowolną podstronę — nie tylko homepage?",
    a: "Tak — to jest nasza główna przewaga. Audytujesz konkretny URL: stronę produktu, artykuł, kategorię, landing page. Każda podstrona ma swój własny score i rekomendacje.",
  },
  {
    q: "Jak działa AI Content Creator?",
    a: "Po audycie i analizie widoczności, AI Content Creator analizuje strony cytowanych przez AI konkurentów, wyciąga kluczowe fakty i encje, a następnie pisze nowy tekst zoptymalizowany pod AI Search. Wynik jest gotowy do skopiowania i wdrożenia.",
  },
  {
    q: "Co to jest monitoring i jak działa?",
    a: "Monitoring automatycznie sprawdza widoczność Twojej strony w AI Search co tydzień. Dostaniesz alert gdy Twój score spada, gdy pojawi się nowy konkurent cytowany na Twoich frazach, lub gdy Twoja strona zostanie po raz pierwszy zacytowana.",
  },
  {
    q: "Czy mogę używać GEO-Auditor bez rejestracji?",
    a: "Tak — pierwsze 5 audytów jest dostępnych bez rejestracji. Rejestracja jest wymagana do zapisywania historii, monitoringu i korzystania z AI Content Creator.",
  },
  {
    q: "Jak szybko zobaczę wyniki?",
    a: "Audyt techniczny i Content Intelligence są gotowe w 30–60 sekund. Analiza widoczności AI (sprawdzanie cytowań w ChatGPT, Gemini, Google AI) trwa 2–5 minut, bo odpytujemy rzeczywiste silniki AI.",
  },
];
