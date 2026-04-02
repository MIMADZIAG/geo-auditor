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
  Bot, Search, Zap, Shield, BarChart3, ArrowRight, CheckCircle2,
  AlertTriangle, XCircle, Brain, LayoutDashboard, LogIn, Target,
  TrendingUp, Sparkles, ChevronDown, ChevronUp, Globe, Eye,
  RefreshCw, Star, MessageSquare, Link2, Cpu, BadgeCheck, Activity,
  Lock, ArrowUpRight, Layers, FileText, ChevronRight, Minus, Plus,
} from "lucide-react";

// ─── FAQ Item ─────────────────────────────────────────────────────────────────
function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border/30 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 text-left gap-4 group"
      >
        <span className="font-medium text-sm leading-snug group-hover:text-foreground/90 transition-colors">{q}</span>
        <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-all ${open ? "border-primary/50 bg-primary/10" : "border-border/50"}`}>
          {open
            ? <Minus className="w-2.5 h-2.5 text-primary" />
            : <Plus className="w-2.5 h-2.5 text-muted-foreground" />
          }
        </div>
      </button>
      {open && (
        <p className="text-sm text-muted-foreground leading-relaxed pb-5 pr-8 animate-float-up">
          {a}
        </p>
      )}
    </div>
  );
}

// ─── Animated counter ─────────────────────────────────────────────────────────
function useCounter(target: number, duration = 1800) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) return;
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

// ─── Engine Badge ─────────────────────────────────────────────────────────────
function EngineBadge({ name, color, icon }: { name: string; color: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border/40 hover:border-border/70 transition-colors">
      <span style={{ color }}>{icon}</span>
      <span className="text-xs font-medium text-foreground/70">{name}</span>
    </div>
  );
}

// ─── Score Ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color = score >= 70 ? "oklch(0.72 0.18 145)" : score >= 40 ? "oklch(0.76 0.18 75)" : "oklch(0.62 0.24 22)";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[-90deg]">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="oklch(0.20 0.010 260)" strokeWidth="4" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={`${fill} ${circ - fill}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 1s cubic-bezier(0.16,1,0.3,1)" }}
      />
    </svg>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const [url, setUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [annual, setAnnual] = useState(false);
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: statsData } = trpc.audit.getGlobalStats.useQuery(undefined, { staleTime: 60_000 });
  const realAuditsCount = statsData?.totalAudits ?? 0;
  const auditsCount = useCounter(realAuditsCount > 0 ? realAuditsCount : 0);

  usePendingAudit(isAuthenticated);

  const createAuditMutation = trpc.audit.run.useMutation({
    onSuccess: (data: { auditId: number }) => navigate(`/results/${data.auditId}`),
    onError: (error: { message?: string }) => {
      setIsSubmitting(false);
      setScanStep(0);
      toast.error(error.message || "Błąd podczas tworzenia audytu");
    },
  });

  useEffect(() => {
    if (!isSubmitting) return;
    const interval = setInterval(() => setScanStep((s) => (s + 1) % SCAN_STEPS.length), 900);
    return () => clearInterval(interval);
  }, [isSubmitting]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) { toast.error("Wklej URL strony do audytu"); return; }
    let normalized = trimmed;
    if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) normalized = "https://" + normalized;
    try { new URL(normalized); } catch { toast.error("Nieprawidłowy URL — sprawdź format"); return; }
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
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">

      {/* ── Navigation ── */}
      <header className="fixed top-0 left-0 right-0 z-50">
        <div className="glass-strong border-b border-border/30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shadow-lg shadow-primary/25">
                <Bot className="w-3.5 h-3.5 text-primary-foreground" />
              </div>
              <span className="font-bold text-sm tracking-tight">GEO-Auditor</span>
            </div>

            {/* Nav links */}
            <nav className="hidden md:flex items-center gap-1">
              <a href="#how-it-works" className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-white/5">Jak działa</a>
              <a href="#pricing" className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-white/5">Cennik</a>
              <a href="#faq" className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-white/5">FAQ</a>
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {isAuthenticated ? (
                <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="gap-1.5 text-xs h-8 text-muted-foreground hover:text-foreground">
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Dashboard</span>
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => (window.location.href = getLoginUrl())} className="gap-1.5 text-xs h-8 text-muted-foreground hover:text-foreground">
                  <LogIn className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Zaloguj</span>
                </Button>
              )}
              <Button size="sm" onClick={() => inputRef.current?.focus()} className="h-8 text-xs gap-1.5 shadow-md shadow-primary/20">
                <Search className="w-3 h-3" />
                <span>Audytuj URL</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative pt-28 pb-20 px-4 sm:px-6 overflow-hidden">
        {/* Background layers */}
        <div className="absolute inset-0 hero-glow pointer-events-none" />
        <div className="absolute inset-0 grid-pattern opacity-40 pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/3 blur-[120px] pointer-events-none" />

        <div className="max-w-6xl mx-auto relative">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-16 items-center">

            {/* Left column */}
            <div className="max-w-xl">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 pill pill-primary mb-8">
                <Zap className="w-3 h-3" />
                <span>Audyt AI Search na poziomie URL</span>
              </div>

              {/* Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-[1.05] tracking-tight mb-6">
                Twoja strona jest<br />
                <span className="gradient-text">niewidoczna w AI.</span><br />
                <span className="text-foreground/60">Naprawiamy to.</span>
              </h1>

              <p className="text-base sm:text-lg text-muted-foreground leading-relaxed mb-8 max-w-lg">
                Wklej URL dowolnej podstrony. W kilkadziesiąt sekund dostaniesz pełną analizę — co blokuje Cię w ChatGPT, Gemini i Google AI Overviews — i gotowy plan naprawy.
              </p>

              {/* URL Input */}
              <form onSubmit={handleSubmit} className="mb-5">
                <div className="flex gap-2 p-1.5 rounded-xl bg-card border border-border/50 shadow-xl shadow-black/20 focus-within:border-primary/40 transition-colors">
                  <div className="relative flex-1">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60 pointer-events-none" />
                    <Input
                      ref={inputRef}
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://twojasklep.pl/produkt/..."
                      className="pl-9 h-10 text-sm bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                      disabled={isSubmitting}
                      autoComplete="url"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="h-10 px-5 font-semibold gap-2 shrink-0 shadow-md shadow-primary/20"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                        <span className="hidden sm:inline text-xs">{SCAN_STEPS[scanStep]}</span>
                        <span className="sm:hidden text-xs">Skanuje…</span>
                      </>
                    ) : (
                      <>
                        <Search className="w-3.5 h-3.5" />
                        <span>Audytuj</span>
                      </>
                    )}
                  </Button>
                </div>
              </form>

              {/* Trust signals */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500/80" />
                  Bez rejestracji
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500/80" />
                  Wyniki w &lt;60 sekund
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500/80" />
                  {realAuditsCount > 0 ? `${auditsCount.toLocaleString("pl-PL")}+ audytów` : "Pierwsze 5 audytów gratis"}
                </span>
              </div>

              {/* Engine strip */}
              <div className="mt-10 pt-8 border-t border-border/20">
                <p className="section-label mb-3">Sprawdzamy widoczność w</p>
                <div className="flex flex-wrap gap-2">
                  {AI_ENGINES.map((e) => (
                    <EngineBadge key={e.name} {...e} />
                  ))}
                </div>
              </div>
            </div>

            {/* Right column — live demo card */}
            <div className="lg:self-center">
              <div className="surface-elevated rounded-2xl overflow-hidden">
                {/* Card header */}
                <div className="px-5 py-4 border-b border-border/30 flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
                  </div>
                  <div className="flex-1 text-center">
                    <span className="text-[11px] text-muted-foreground font-mono">geo-auditor.app/results/1234</span>
                  </div>
                </div>

                {/* Score display */}
                <div className="px-5 py-5 border-b border-border/20">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <ScoreRing score={31} size={72} />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-lg font-black text-red-400">31</span>
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-red-400">Krytyczne problemy</span>
                        <span className="pill pill-red text-[10px] py-0.5">Słaby</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">AI ignoruje tę stronę. 12 krytycznych problemów do naprawy.</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                    <div className="relative">
                      <ScoreRing score={78} size={72} />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-lg font-black text-emerald-400">78</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Po wdrożeniu rekomendacji</span>
                    <span className="pill pill-emerald text-[10px] py-0.5">+47 pkt</span>
                  </div>
                </div>

                {/* Workflow steps */}
                <div className="px-5 py-4 space-y-3">
                  {WORKFLOW_PREVIEW.map((step, i) => (
                    <div key={step.label} className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${i === 0 ? "bg-primary/8 border border-primary/20" : "opacity-50"}`}>
                      <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${i === 0 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                        <step.icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-semibold truncate">{step.label}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{step.sub}</div>
                      </div>
                      {i === 0 ? (
                        <span className="pill pill-primary text-[10px] py-0.5 shrink-0">Aktywny</span>
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-border/50 shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── Problem strip ── */}
      <section className="py-12 px-4 sm:px-6 border-y border-border/20 bg-card/30">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {PROBLEM_ITEMS.map((item) => (
              <div key={item.headline} className="flex items-start gap-4">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${item.iconBg}`}>
                  <item.icon className={`w-4.5 h-4.5 ${item.iconColor}`} />
                </div>
                <div>
                  <div className="font-semibold text-sm mb-1.5">{item.headline}</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">{item.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="py-24 px-4 sm:px-6 relative overflow-hidden">
        <div className="absolute inset-0 dot-pattern opacity-30 pointer-events-none" />
        <div className="max-w-5xl mx-auto relative">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 pill pill-primary mb-5">
              <RefreshCw className="w-3 h-3" />
              <span>Pętla widoczności AI</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-black mb-4 tracking-tight">
              Od niewidoczności do cytowania<br />
              <span className="text-muted-foreground/60">— w 4 krokach</span>
            </h2>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto leading-relaxed">
              Każdy krok buduje na poprzednim. Im dłużej działasz w pętli, tym wyższy score.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {WORKFLOW_CARDS.map((card, i) => (
              <div key={card.title} className={`relative rounded-2xl border p-5 flex flex-col gap-4 group transition-all duration-300 hover:shadow-lg hover:shadow-black/20 ${card.featured ? "border-primary/30 bg-gradient-to-b from-primary/6 to-transparent" : "border-border/30 bg-card/60 hover:border-border/60"}`}>
                {/* Step number */}
                <div className="absolute top-4 right-4 text-[10px] font-black text-muted-foreground/20 tabular-nums">0{i + 1}</div>

                {/* Icon */}
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${card.iconBg}`}>
                  <card.icon className={`w-4.5 h-4.5 ${card.iconColor}`} />
                </div>

                <div className="flex-1">
                  <h3 className="font-bold text-sm mb-2">{card.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{card.desc}</p>
                </div>

                {card.bullets && (
                  <ul className="space-y-1.5 pt-3 border-t border-border/20">
                    {card.bullets.map((b) => (
                      <li key={b} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <div className="w-1 h-1 rounded-full bg-muted-foreground/40 shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                )}

                {/* Connector arrow */}
                {i < 3 && (
                  <div className="hidden lg:flex absolute -right-2.5 top-1/2 -translate-y-1/2 z-10">
                    <div className="w-5 h-5 rounded-full bg-background border border-border/50 flex items-center justify-center">
                      <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Competitor insight section ── */}
      <section className="py-20 px-4 sm:px-6 border-t border-border/20">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Left — text */}
            <div>
              <div className="inline-flex items-center gap-2 pill pill-amber mb-6">
                <AlertTriangle className="w-3 h-3" />
                <span>Twoja konkurencja już to wie</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-black mb-5 tracking-tight leading-tight">
                Każde zapytanie w ChatGPT<br />
                to szansa sprzedażowa.<br />
                <span className="text-amber-400/80">Twój konkurent ją zgarnął.</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-8 text-sm max-w-md">
                AI nie cytuje losowo. Wybiera strony spełniające konkretne kryteria techniczne i contentowe. GEO-Auditor pokazuje dokładnie co robią lepiej Twoi rywale — i daje gotowy tekst, który odwraca tę sytuację.
              </p>
              <div className="space-y-3">
                {EMOTIONAL_ITEMS.map((item) => (
                  <div key={item.label} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/8 border border-amber-500/20 flex items-center justify-center shrink-0">
                      <item.icon className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold mb-0.5">{item.label}</div>
                      <div className="text-xs text-muted-foreground leading-relaxed">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — before/after */}
            <div className="space-y-3">
              {/* Before */}
              <div className="rounded-xl border border-red-500/15 bg-red-950/8 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-5 h-5 rounded-full bg-red-500/15 flex items-center justify-center">
                    <XCircle className="w-3 h-3 text-red-400" />
                  </div>
                  <span className="text-xs font-semibold text-red-400/80">Przed — oryginalny tekst</span>
                </div>
                <p className="text-xs text-muted-foreground/60 leading-relaxed italic font-mono">
                  "Oferujemy szeroki wybór produktów w atrakcyjnych cenach. Nasza firma działa od wielu lat na rynku i cieszy się zaufaniem klientów. Zapraszamy do zakupów."
                </p>
              </div>

              {/* Arrow */}
              <div className="flex items-center justify-center gap-3 py-1">
                <div className="flex-1 h-px bg-border/30" />
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/8 border border-primary/20">
                  <Sparkles className="w-3 h-3 text-primary" />
                  <span className="text-[11px] font-semibold text-primary">AI Content Creator</span>
                </div>
                <div className="flex-1 h-px bg-border/30" />
              </div>

              {/* After */}
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/8 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  </div>
                  <span className="text-xs font-semibold text-emerald-400/80">Po — zoptymalizowany pod AI Search</span>
                </div>
                <p className="text-xs text-muted-foreground/80 leading-relaxed font-mono">
                  "Kurtka zimowa damska Parka Arctic Pro (model 2025) wykonana z materiału Gore-Tex 3L (wodoodporność 20 000 mm H₂O). Temperatura komfortu: -20°C. Certyfikat RDS (puch etyczny). Dostępna w rozmiarach XS–3XL. Darmowa dostawa i zwrot 365 dni."
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <span className="pill pill-emerald text-[10px] py-0.5">Cytowana przez Perplexity</span>
                  <span className="pill pill-emerald text-[10px] py-0.5">+62 pkt AI Score</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-24 px-4 sm:px-6 border-t border-border/20 relative overflow-hidden">
        <div className="absolute inset-0 hero-glow opacity-50 pointer-events-none" />
        <div className="max-w-5xl mx-auto relative">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 pill pill-primary mb-5">
              <BarChart3 className="w-3 h-3" />
              <span>Cennik</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-black mb-4 tracking-tight">Zacznij za darmo.<br />
              <span className="text-muted-foreground/60">Skaluj gdy rośniesz.</span>
            </h2>

            {/* Toggle */}
            <div className="inline-flex items-center gap-1 p-1 rounded-full bg-card border border-border/40 mt-4">
              <button
                onClick={() => setAnnual(false)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${!annual ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Miesięcznie
              </button>
              <button
                onClick={() => setAnnual(true)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${annual ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Rocznie <span className="text-emerald-400 font-bold">-20%</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {PRICING_PLANS.map((plan) => (
              <div key={plan.name} className={`relative rounded-2xl border p-6 flex flex-col transition-all ${plan.featured ? "border-primary/40 bg-gradient-to-b from-primary/8 to-transparent shadow-xl shadow-primary/8" : "border-border/30 bg-card/60"}`}>
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider shadow-md shadow-primary/30">
                    {plan.badge}
                  </div>
                )}

                <div className="mb-6">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{plan.name}</div>
                  <div className="flex items-baseline gap-1 mb-1">
                    {annual && plan.name !== "Free" && (
                      <span className="text-sm text-muted-foreground/50 line-through">{plan.price}</span>
                    )}
                    <span className="text-3xl font-black tracking-tight">{annual && plan.name !== "Free" ? plan.priceAnnual : plan.price}</span>
                    {plan.period && <span className="text-sm text-muted-foreground">{plan.period}</span>}
                  </div>
                  {annual && plan.name !== "Free" && (
                    <div className="text-[11px] text-emerald-400 font-medium mb-2">Oszczędzasz 20% rocznie</div>
                  )}
                  <p className="text-xs text-muted-foreground leading-relaxed">{plan.desc}</p>
                </div>

                <ul className="space-y-2.5 flex-1 mb-6">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500/70 shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => {
                    if (plan.name === "Free") window.scrollTo({ top: 0, behavior: "smooth" });
                    else window.location.href = "/pricing";
                  }}
                  variant={plan.featured ? "default" : "outline"}
                  className={`w-full ${plan.featured ? "shadow-md shadow-primary/20" : ""}`}
                >
                  {plan.cta}
                </Button>
              </div>
            ))}
          </div>

          <div className="text-center mt-8 space-y-1.5">
            <p className="text-xs text-muted-foreground">Płatności obsługiwane przez Stripe. Anuluj w dowolnym momencie.</p>
            <p className="text-xs text-emerald-400/80 font-medium">14-dniowa gwarancja zwrotu — bez pytań.</p>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="py-20 px-4 sm:px-6 border-t border-border/20">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black mb-3 tracking-tight">Pytania i odpowiedzi</h2>
            <p className="text-muted-foreground text-sm">Wszystko co chcesz wiedzieć o GEO-Auditor</p>
          </div>
          <div className="rounded-2xl border border-border/30 bg-card/60 px-6">
            {FAQ.map((item) => <FAQItem key={item.q} {...item} />)}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-24 px-4 sm:px-6 border-t border-border/20 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-primary/5 rounded-full blur-[80px]" />
        </div>
        <div className="max-w-2xl mx-auto text-center relative">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-8 animate-glow-pulse">
            <Zap className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-black mb-5 tracking-tight">
            Twoja konkurencja już to wie.<br />
            <span className="gradient-text">Ty możesz wiedzieć za darmo.</span>
          </h2>
          <p className="text-muted-foreground mb-10 leading-relaxed text-sm max-w-md mx-auto">
            Jeden URL. Kilkadziesiąt sekund. Pełna analiza — bez rejestracji, bez karty. Dowiedz się, dlaczego AI Cię ignoruje i co konkretnie zmienić.
          </p>
          <Button
            size="lg"
            onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); setTimeout(() => inputRef.current?.focus(), 400); }}
            className="gap-2.5 px-10 h-12 text-base font-semibold shadow-xl shadow-primary/25"
          >
            <Search className="w-4.5 h-4.5" />
            Sprawdź swoją stronę teraz
          </Button>
          <p className="text-xs text-muted-foreground mt-5">
            {realAuditsCount > 0
              ? `Dołącz do ${auditsCount.toLocaleString("pl-PL")}+ audytów już wykonanych`
              : "Bądź wśród pierwszych użytkowników GEO-Auditor"
            }
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border/20 py-14 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-10">
            <div className="col-span-2 sm:col-span-2">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shadow-md shadow-primary/25">
                  <Bot className="w-3.5 h-3.5 text-primary-foreground" />
                </div>
                <span className="font-bold text-sm">GEO-Auditor</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">
                Jedyne narzędzie audytujące pojedyncze podstrony pod kątem widoczności w AI Search — na poziomie URL, nie domeny.
              </p>
            </div>
            <div>
              <div className="section-label mb-4">Produkt</div>
              <div className="space-y-2.5">
                <a href="#how-it-works" className="block text-xs text-muted-foreground hover:text-foreground transition-colors">Jak działa</a>
                <a href="#pricing" className="block text-xs text-muted-foreground hover:text-foreground transition-colors">Cennik</a>
                <a href="/dashboard" className="block text-xs text-muted-foreground hover:text-foreground transition-colors">Dashboard</a>
              </div>
            </div>
            <div>
              <div className="section-label mb-4">Pomoc</div>
              <div className="space-y-2.5">
                <a href="#faq" className="block text-xs text-muted-foreground hover:text-foreground transition-colors">FAQ</a>
                <a href="mailto:hello@geoauditor.app" className="block text-xs text-muted-foreground hover:text-foreground transition-colors">Kontakt</a>
              </div>
            </div>
          </div>
          <div className="border-t border-border/20 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">© 2026 GEO-Auditor. Wszelkie prawa zastrzeżone.</p>
            <div className="flex items-center gap-5 text-xs text-muted-foreground">
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

const WORKFLOW_PREVIEW = [
  { icon: Shield, label: "Audyt AI-Readiness", sub: "40+ sprawdzeń · score 0–100" },
  { icon: Eye, label: "Analiza widoczności", sub: "Cytowania w ChatGPT, Gemini" },
  { icon: Sparkles, label: "AI Content Creator", sub: "Gotowy tekst do wdrożenia" },
  { icon: Activity, label: "Monitoring", sub: "Alerty o zmianach widoczności" },
];

const AI_ENGINES = [
  {
    name: "ChatGPT",
    color: "#10a37f",
    icon: (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
        <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.896zm16.597 3.855l-5.843-3.372L15.115 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.403-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
      </svg>
    ),
  },
  {
    name: "Google AI",
    color: "#4285f4",
    icon: (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5">
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
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
      </svg>
    ),
  },
  {
    name: "Gemini",
    color: "#8b5cf6",
    icon: (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" style={{ color: "#8b5cf6" }}>
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
