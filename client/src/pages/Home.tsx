import { useState, useEffect } from "react";
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
  Target,
  TrendingUp,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Globe,
  Lock,
  Eye,
  RefreshCw,
  Star,
  Layers,
  MessageSquare,
  Link2,
  Cpu,
  BadgeCheck,
} from "lucide-react";

// ─── Animated counter hook ─────────────────────────────────────────────────────
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

// ─── Score Ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score, color }: { score: number; color: string }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative w-20 h-20">
      <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="oklch(0.22 0.015 250)" strokeWidth="6" />
        <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - score / 100)}
          style={{ transition: "stroke-dashoffset 1.2s ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-black" style={{ color }}>{score}</span>
        <span className="text-[8px] text-muted-foreground">/100</span>
      </div>
    </div>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const auditsCount = useCounter(12847);
  const pagesCount = useCounter(94);

  const auditMutation = trpc.audit.run.useMutation({
    onSuccess: (data) => navigate(`/results/${data.auditId}`),
    onError: (err) => toast.error(err.message || "Audit failed. Please try again."),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) { toast.error("Wklej URL strony do audytu."); return; }
    let normalized = url.trim();
    if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) normalized = "https://" + normalized;
    auditMutation.mutate({ url: normalized });
  };

  const isLoading = auditMutation.isPending;

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">

      {/* ── Navigation ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/85 backdrop-blur-xl">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Bot className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-black text-lg tracking-tight">GEO-Auditor</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden md:block">Funkcje</a>
            <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden md:block">Cennik</a>
            <a href="#faq" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden md:block">FAQ</a>
            {isAuthenticated ? (
              <Button size="sm" onClick={() => navigate("/dashboard")} variant="outline" className="gap-1.5">
                <LayoutDashboard className="w-3.5 h-3.5" /> Dashboard
              </Button>
            ) : (
              <Button size="sm" onClick={() => { window.location.href = getLoginUrl(); }} variant="ghost" className="gap-1.5">
                <LogIn className="w-3.5 h-3.5" /> Zaloguj się
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-28 pb-16 px-4 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/5 rounded-full blur-3xl" />
          <div className="absolute top-40 left-1/4 w-[300px] h-[300px] bg-violet-500/5 rounded-full blur-3xl" />
        </div>

        <div className="container max-w-6xl mx-auto relative">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

            {/* Left: copy + form */}
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 font-semibold mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                AI Citations — sprawdź kto cytuje Twoją branżę w ChatGPT i Google AI
              </div>

              <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-5 leading-[1.06]">
                Dowiedz się, czy AI<br />
                <span className="text-primary">cytuje Twoją stronę.</span><br />
                <span className="text-muted-foreground/70 text-3xl sm:text-4xl font-bold">I co zrobić, żeby cytowała.</span>
              </h1>

              <p className="text-base text-muted-foreground mb-8 leading-relaxed max-w-lg">
                Wklej URL dowolnej podstrony. W 30 sekund zobaczysz jej wynik AI-Readiness, kto z konkurencji pojawia się zamiast Ciebie w ChatGPT i Google AI Overviews — i gotowy przepisany tekst, który to zmieni.
              </p>

              {/* URL Input */}
              <form onSubmit={handleSubmit} className="max-w-lg">
                <div className="flex items-center gap-2 p-2 rounded-2xl bg-card border border-border/60 shadow-xl focus-within:border-primary/60 focus-within:shadow-primary/10 transition-all">
                  <div className="flex items-center pl-2 text-muted-foreground">
                    <Search className="w-4 h-4" />
                  </div>
                  <Input
                    type="url"
                    placeholder="https://twojasklepinternetowy.pl/produkt"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-sm placeholder:text-muted-foreground/50"
                    disabled={isLoading}
                  />
                  <Button type="submit" disabled={isLoading} className="gap-2 rounded-xl px-5 shrink-0">
                    {isLoading ? (
                      <><div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />Skanuję…</>
                    ) : (
                      <>Audyt za darmo <ArrowRight className="w-4 h-4" /></>
                    )}
                  </Button>
                </div>
                <div className="flex items-center gap-4 mt-3">
                  <p className="text-xs text-muted-foreground">✓ Bezpłatnie · ✓ 5 audytów/mies. · ✓ Bez karty kredytowej</p>
                </div>
              </form>

              {/* Loading steps */}
              {isLoading && (
                <div className="mt-6 space-y-2">
                  {SCAN_STEPS.map((step, i) => (
                    <div key={step} className="flex items-center gap-3 text-sm text-muted-foreground animate-pulse" style={{ animationDelay: `${i * 0.25}s` }}>
                      <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />{step}
                    </div>
                  ))}
                </div>
              )}

              {/* Trust badges */}
              <div className="flex items-center gap-5 mt-8 flex-wrap">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <BadgeCheck className="w-3.5 h-3.5 text-emerald-500" />
                  <span>40+ checks</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <BadgeCheck className="w-3.5 h-3.5 text-emerald-500" />
                  <span>ChatGPT · Perplexity · Google AI</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <BadgeCheck className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Wyniki po polsku</span>
                </div>
              </div>
            </div>

            {/* Right: mock audit result card */}
            <div className="hidden lg:block">
              <div className="rounded-2xl border border-border/60 bg-card shadow-2xl overflow-hidden">
                {/* Card header */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/40 bg-muted/20">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
                  </div>
                  <span className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">twojasklep.pl/produkt-xyz</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold">Gotowe</span>
                </div>

                {/* Score row */}
                <div className="px-5 py-4 flex items-center gap-5 border-b border-border/30">
                  <ScoreRing score={38} color="oklch(0.65 0.22 25)" />
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">AI Visibility Score</div>
                    <div className="text-2xl font-black text-red-400">38 / 100</div>
                    <div className="text-xs text-red-400/80 mt-0.5">Krytyczne problemy — AI Cię ignoruje</div>
                  </div>
                  <div className="ml-auto text-right">
                    <div className="text-xs text-muted-foreground mb-1">Potencjał</div>
                    <div className="text-lg font-bold text-emerald-400">+47 pkt</div>
                    <div className="text-[10px] text-muted-foreground">po poprawkach</div>
                  </div>
                </div>

                {/* Issues list */}
                <div className="px-5 py-3 space-y-2">
                  {MOCK_HERO_ISSUES.map((issue, i) => (
                    <div key={i} className={`flex items-start gap-3 p-2.5 rounded-lg border ${issue.bg}`}>
                      <issue.icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${issue.color}`} />
                      <div className="min-w-0">
                        <div className={`text-xs font-semibold ${issue.color}`}>{issue.label}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{issue.fix}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* AI Citations teaser */}
                <div className="mx-5 mb-4 mt-1 rounded-xl border border-violet-500/30 bg-violet-950/20 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Brain className="w-3.5 h-3.5 text-violet-400" />
                    <span className="text-xs font-semibold text-violet-300">AI Citations — kto cytuje zamiast Ciebie?</span>
                  </div>
                  <div className="space-y-1">
                    {MOCK_COMPETITORS.map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-[10px]">
                        <span className="text-zinc-400 truncate">{c.url}</span>
                        <span className="text-violet-400 font-semibold ml-2 shrink-0">{c.count}× cytowany</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── Social proof numbers ── */}
      <section className="py-10 px-4 border-y border-border/30 bg-muted/10">
        <div className="container max-w-4xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
            {[
              { value: `${auditsCount.toLocaleString("pl-PL")}+`, label: "Wykonanych audytów" },
              { value: "3", label: "Silniki AI objęte analizą" },
              { value: "40+", label: "Sprawdzanych parametrów" },
              { value: `${pagesCount}%`, label: "Stron ma krytyczne błędy" },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-2xl sm:text-3xl font-black text-foreground mb-1">{stat.value}</div>
                <div className="text-xs text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Emotional hook: competitors are being cited ── */}
      <section className="py-16 px-4">
        <div className="container max-w-4xl mx-auto">
          <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-background p-8 sm:p-10">
            <div className="flex flex-col sm:flex-row items-start gap-6">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-black mb-3 leading-tight">
                  Twoi konkurenci pojawiają się w odpowiedziach AI.<br />
                  <span className="text-amber-400">Ty — nie.</span>
                </h2>
                <p className="text-muted-foreground leading-relaxed mb-5 max-w-xl">
                  Kiedy ktoś pyta ChatGPT o produkt z Twojej branży, AI cytuje strony które spełniają konkretne kryteria techniczne i contentowe. GEO-Auditor pokazuje Ci dokładnie co robią lepiej — i jak to naprawić.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { icon: Eye, label: "Kto Cię wyprzedza", desc: "Pełna lista URL-i cytowanych przez AI zamiast Ciebie" },
                    { icon: Target, label: "Dlaczego ich cytuje", desc: "Konkretne powody: struktura, fakty, schema.org" },
                    { icon: Sparkles, label: "Jak ich pobić", desc: "Przepisany tekst gotowy do wdrożenia w 1 klik" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-start gap-3 p-3 rounded-xl bg-background/50 border border-border/40">
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

      {/* ── Features ── */}
      <section id="features" className="py-16 px-4 border-t border-border/30">
        <div className="container max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary font-semibold mb-4">
              <Layers className="w-3.5 h-3.5" /> Co dostajesz
            </div>
            <h2 className="text-2xl sm:text-3xl font-black mb-3">Kompletny audyt AI Search w jednym miejscu</h2>
            <p className="text-muted-foreground text-sm max-w-lg mx-auto">Nie tylko lista błędów — pełna analiza techniczna, contentowa i konkurencyjna z gotowymi poprawkami.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f) => (
              <div key={f.title} className={`rounded-2xl border p-6 flex flex-col gap-3 ${f.featured ? "border-violet-500/40 bg-gradient-to-br from-violet-500/8 to-background" : "border-border/50 bg-card"}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${f.iconBg}`}>
                  <f.icon className={`w-5 h-5 ${f.iconColor}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-sm">{f.title}</h3>
                    {f.badge && <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wide ${f.badgeStyle}`}>{f.badge}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
                {f.bullets && (
                  <ul className="space-y-1 mt-1">
                    {f.bullets.map((b) => (
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

      {/* ── How it works ── */}
      <section className="py-16 px-4 border-t border-border/30 bg-muted/5">
        <div className="container max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-black mb-3">Jak to działa</h2>
            <p className="text-muted-foreground text-sm">Od URL do gotowych poprawek — w mniej niż minutę.</p>
          </div>
          <div className="relative">
            {/* Connector line */}
            <div className="hidden sm:block absolute top-8 left-[calc(16.67%+24px)] right-[calc(16.67%+24px)] h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
              {HOW_IT_WORKS.map((step, i) => (
                <div key={i} className="flex flex-col items-center text-center relative">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex flex-col items-center justify-center mb-4 relative z-10 bg-background">
                    <step.icon className="w-6 h-6 text-primary mb-0.5" />
                    <span className="text-[9px] text-primary/60 font-bold">0{i + 1}</span>
                  </div>
                  <h3 className="font-bold mb-2 text-sm">{step.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Full Rewrite AI showcase ── */}
      <section className="py-16 px-4 border-t border-border/30">
        <div className="container max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-xs text-violet-400 font-semibold mb-5">
                <Sparkles className="w-3.5 h-3.5" /> AI Content Co-Pilot
              </div>
              <h2 className="text-2xl sm:text-3xl font-black mb-4 leading-tight">
                Nie tylko "co poprawić" —<br />
                <span className="text-violet-400">gotowy tekst do wdrożenia</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                Full Rewrite AI crawluje 3–6 stron konkurencji cytowanych przez Google AI Overviews i ChatGPT, wyciąga kluczowe fakty i encje, a następnie pisze nowy tekst zgodny z zasadami Helpful Content — lepszy od oryginału, zoptymalizowany pod AI Search.
              </p>
              <div className="space-y-3 mb-6">
                {REWRITE_BULLETS.map((b) => (
                  <div key={b.label} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-violet-500/15 flex items-center justify-center shrink-0 mt-0.5">
                      <b.icon className="w-3 h-3 text-violet-400" />
                    </div>
                    <div>
                      <span className="text-sm font-semibold">{b.label}</span>
                      <span className="text-xs text-muted-foreground ml-2">{b.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
              <Button onClick={() => document.querySelector("input")?.focus()} className="gap-2 bg-violet-600 hover:bg-violet-500">
                <Sparkles className="w-4 h-4" /> Wypróbuj za darmo
              </Button>
            </div>

            {/* Before/After mock */}
            <div className="space-y-3">
              <div className="rounded-xl border border-red-500/20 bg-red-950/10 p-4">
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
                <span className="flex items-center gap-1.5"><Sparkles className="w-3 h-3 text-violet-400" /> GPT-5.4 + dane konkurencji + E-E-A-T</span>
                <div className="h-px flex-1 bg-border/30" />
              </div>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/10 p-4">
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
      <section id="pricing" className="py-16 px-4 border-t border-border/30 bg-muted/5">
        <div className="container max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-black mb-3">Prosty cennik. Żadnych niespodzianek.</h2>
            <p className="text-muted-foreground text-sm">Zacznij za darmo. Przejdź na wyższy plan gdy zobaczysz wyniki.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {PRICING_PLANS.map((plan) => (
              <div key={plan.name} className={`rounded-2xl border p-6 flex flex-col relative ${plan.featured ? "border-primary/60 bg-gradient-to-b from-primary/8 to-background shadow-lg shadow-primary/10" : "border-border/50 bg-card"}`}>
                {plan.featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wide">
                    Najpopularniejszy
                  </div>
                )}
                <div className="mb-4">
                  <h3 className="font-black text-lg mb-1">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-3xl font-black">{plan.price}</span>
                    {plan.period && <span className="text-sm text-muted-foreground">{plan.period}</span>}
                  </div>
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
                      document.querySelector("input")?.focus();
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

          <p className="text-center text-xs text-muted-foreground mt-6">
            Wszystkie plany płatne obsługiwane przez Stripe. Możesz anulować w dowolnym momencie.
          </p>
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
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/5 rounded-full blur-3xl" />
        </div>
        <div className="container max-w-2xl mx-auto text-center relative">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-6">
            <Zap className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-black mb-4">
            Sprawdź swoją stronę teraz.<br />
            <span className="text-primary">Wyniki w 30 sekund.</span>
          </h2>
          <p className="text-muted-foreground mb-8 leading-relaxed">
            Bezpłatnie. Bez rejestracji. Bez karty kredytowej.<br />
            Tylko konkretna analiza i lista poprawek.
          </p>
          <Button size="lg" onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); setTimeout(() => document.querySelector("input")?.focus(), 400); }} className="gap-2 px-10 h-12 text-base font-bold">
            <Search className="w-5 h-5" /> Zacznij darmowy audyt
          </Button>
          <p className="text-xs text-muted-foreground mt-4">
            Dołącz do {auditsCount.toLocaleString("pl-PL")}+ audytów już wykonanych
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
                {["Cennik", "Dashboard", "Dokumentacja"].map((l) => (
                  <a key={l} href={l === "Cennik" ? "/pricing" : l === "Dashboard" ? "/dashboard" : "#"} className="block text-xs text-muted-foreground hover:text-foreground transition-colors">{l}</a>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Firma</div>
              <div className="space-y-2">
                {["O nas", "Blog", "Kontakt"].map((l) => (
                  <a key={l} href="#" className="block text-xs text-muted-foreground hover:text-foreground transition-colors">{l}</a>
                ))}
              </div>
            </div>
          </div>
          <div className="border-t border-border/30 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">© 2025 GEO-Auditor. Wszelkie prawa zastrzeżone.</p>
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
  "Pobieranie treści strony…",
  "Sprawdzanie dostępu crawlerów AI…",
  "Analiza danych strukturalnych…",
  "Ocena jakości contentu…",
  "Uruchamianie analizy LLM…",
];

const MOCK_HERO_ISSUES = [
  { icon: XCircle, color: "text-red-400", bg: "bg-red-500/8 border-red-500/20", label: "GPTBot zablokowany w robots.txt", fix: "ChatGPT nie może indeksować Twojej strony" },
  { icon: XCircle, color: "text-red-400", bg: "bg-red-500/8 border-red-500/20", label: "Brak JSON-LD (schema.org)", fix: "AI nie rozumie o czym jest Twoja strona" },
  { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/8 border-amber-500/20", label: "Treść bez faktów i dat", fix: "Dodaj konkretne liczby i daty — AI preferuje fakty" },
];

const MOCK_COMPETITORS = [
  { url: "z500.pl/domy-parterowe", count: 7 },
  { url: "extradom.pl/projekty-parterowe", count: 5 },
  { url: "murator.pl/projekty", count: 4 },
];

const FEATURES = [
  {
    icon: BarChart3,
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    title: "AI Visibility Score",
    badge: null,
    badgeStyle: "",
    featured: false,
    desc: "Jeden wynik 0–100 pokazujący jak widoczna jest Twoja strona dla AI. Obliczany z 6 wymiarów: techniczny, content, schema, dostępność, cytowania, E-E-A-T.",
    bullets: null,
  },
  {
    icon: Brain,
    iconBg: "bg-violet-500/15",
    iconColor: "text-violet-400",
    title: "Content Intelligence",
    badge: "AI",
    badgeStyle: "bg-violet-500/20 text-violet-400",
    featured: true,
    desc: "LLM analizuje Twój tekst w 5 wymiarach: Answer Density, Factual Density, Citation Readiness, Query Coverage, Duplicate Risk.",
    bullets: ["Citeability Score 0–100", "Konkretne rekomendacje per wymiar", "Porównanie z benchmarkiem branżowym"],
  },
  {
    icon: Globe,
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-400",
    title: "AI Citations",
    badge: "Nowe",
    badgeStyle: "bg-emerald-500/20 text-emerald-400",
    featured: false,
    desc: "Sprawdza które strony są cytowane przez Google AI Overviews i ChatGPT dla zapytań związanych z Twoją stroną. Pełne URL-e konkurencji.",
    bullets: null,
  },
  {
    icon: Sparkles,
    iconBg: "bg-violet-500/15",
    iconColor: "text-violet-400",
    title: "Full Rewrite AI",
    badge: "GPT-5.4",
    badgeStyle: "bg-violet-500/20 text-violet-400",
    featured: false,
    desc: "Crawluje konkurencję z AI Citations, wyciąga fakty i encje, pisze nowy tekst zgodny z Helpful Content — gotowy do wdrożenia.",
    bullets: null,
  },
  {
    icon: Shield,
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-400",
    title: "Audyt techniczny",
    badge: null,
    badgeStyle: "",
    featured: false,
    desc: "40+ sprawdzeń: robots.txt, crawl budget, Core Web Vitals, HTTPS, canonical, hreflang, szybkość ładowania, mobile-friendly.",
    bullets: null,
  },
  {
    icon: TrendingUp,
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    title: "Monitoring & Historia",
    badge: "Starter+",
    badgeStyle: "bg-primary/20 text-primary",
    featured: false,
    desc: "Śledź postęp swojego score w czasie. Cotygodniowe re-audyty, alerty o zmianach, historia poprawek.",
    bullets: null,
  },
];

const HOW_IT_WORKS = [
  {
    icon: Link2,
    title: "Wklej URL",
    description: "Dowolna podstrona — produkt, blog, landing page, kategoria. Bez rejestracji.",
  },
  {
    icon: Cpu,
    title: "40+ checks w 30 sekund",
    description: "Silnik skanuje każdy znany powód dla którego AI ignoruje lub cytuje strony — technicznie i contentowo.",
  },
  {
    icon: Zap,
    title: "Gotowe poprawki",
    description: "Priorytetowa lista problemów z konkretnym opisem i gotowym przepisanym tekstem od AI.",
  },
];

const REWRITE_BULLETS = [
  { icon: Globe, label: "Crawl konkurencji", desc: "3–6 stron cytowanych przez AI" },
  { icon: Brain, label: "Ekstrakcja wiedzy", desc: "Fakty, liczby, encje z Knowledge Graph" },
  { icon: BadgeCheck, label: "Weryfikacja E-E-A-T", desc: "Auto-rewizja gdy jakość < 7.5/10" },
  { icon: Sparkles, label: "Helpful Content", desc: "Tekst lepszy od oryginału, gotowy do wdrożenia" },
];

const PRICING_PLANS = [
  {
    name: "Free",
    price: "0 zł",
    period: "",
    desc: "Idealne do pierwszego audytu",
    featured: false,
    cta: "Zacznij za darmo",
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
    period: "/ mies.",
    desc: "Dla właścicieli sklepów i content managerów",
    featured: true,
    cta: "Wybierz Starter",
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
    period: "/ mies.",
    desc: "Dla agencji i specjalistów SEO",
    featured: false,
    cta: "Wybierz Pro",
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
    q: "Czym różni się GEO-Auditor od narzędzi SEO takich jak Semrush czy Ahrefs?",
    a: "Semrush i Ahrefs analizują widoczność w tradycyjnych wynikach Google (blue links). GEO-Auditor skupia się wyłącznie na widoczności w odpowiedziach AI — ChatGPT, Perplexity i Google AI Overviews. To zupełnie inne algorytmy i inne kryteria. Możesz mieć świetne SEO i być całkowicie niewidoczny dla AI Search.",
  },
  {
    q: "Jak działa AI Citations — czy naprawdę sprawdza Google AI Overviews?",
    a: "Tak. Używamy SerpApi z parametrami zoptymalizowanymi pod polskie wyniki (lokalizacja Warszawa, urządzenie mobilne) do pobierania rzeczywistych odpowiedzi Google AI Overviews. Dla ChatGPT używamy oficjalnego API z włączonym web search. Wyniki odzwierciedlają to co widzi realny użytkownik.",
  },
  {
    q: "Czy Full Rewrite AI naprawdę pisze lepszy tekst od oryginału?",
    a: "Full Rewrite używa GPT-5.4 z 4-etapowym procesem: crawl konkurencji cytowanych przez AI → ekstrakcja faktów i encji → generowanie sekcja po sekcji → weryfikacja E-E-A-T z auto-rewizją. Każdy tekst musi uzyskać minimum 7.5/10 w ocenie E-E-A-T. Nie gwarantujemy wyników, ale tekst jest zawsze bogatszy w fakty i lepiej ustrukturyzowany niż oryginał.",
  },
  {
    q: "Ile kosztuje i czy mogę anulować?",
    a: "Plan Free jest bezpłatny na zawsze (5 audytów/mies.). Plany płatne są rozliczane miesięcznie przez Stripe — możesz anulować w dowolnym momencie bez żadnych opłat za wcześniejsze rozwiązanie umowy.",
  },
  {
    q: "Czy narzędzie działa dla stron w języku polskim?",
    a: "Tak — GEO-Auditor jest zoptymalizowany pod polskie strony. AI Citations sprawdza wyniki dla polskich zapytań z lokalizacją Warszawa. Full Rewrite AI pisze teksty po polsku, weryfikowane pod kątem poprawności językowej i stylistycznej. Rekomendacje z audytu są po polsku.",
  },
];
