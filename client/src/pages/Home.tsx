import { useState, useEffect, useRef, useCallback } from "react";
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
  TrendingUp, TrendingDown, Sparkles, ChevronDown, ChevronUp, Globe, Eye,
  RefreshCw, Star, MessageSquare, Link2, Cpu, BadgeCheck, Activity,
  Lock, ArrowUpRight, Layers, FileText, ChevronRight, Minus, Plus,
  Users, Radio, Flame,
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

// ─── Live Citation Demo Card ──────────────────────────────────────────────────
// Simulates the Emotional Tension Sequence from the product — shows competitor
// reveal in real-time, building the same emotional tension as the actual product.
const DEMO_SEQUENCE = [
  { delay: 0,    type: "query",      text: "Pytam Google AI: \"kurtka zimowa damska\"" },
  { delay: 1400, type: "miss",       text: "Twojej strony nie ma w odpowiedzi" },
  { delay: 2200, type: "competitor", text: "zalando.pl" },
  { delay: 2800, type: "competitor", text: "answear.com" },
  { delay: 3400, type: "query",      text: "Pytam ChatGPT: \"najlepsza kurtka zimowa\"" },
  { delay: 4800, type: "miss",       text: "Brak cytowania — 0 z 5 zapytań" },
  { delay: 5600, type: "competitor", text: "modivo.pl" },
  { delay: 6400, type: "score",      text: "0 / 4 silników AI cytuje Twoją stronę" },
  { delay: 7800, type: "cta",        text: "Sprawdź swoją stronę →" },
];

function LiveCitationDemoCard({ onCtaClick }: { onCtaClick: () => void }) {
  const [visibleItems, setVisibleItems] = useState<number[]>([]);
  const [loop, setLoop] = useState(0);

  useEffect(() => {
    setVisibleItems([]);
    const timers: ReturnType<typeof setTimeout>[] = [];
    DEMO_SEQUENCE.forEach((item, i) => {
      timers.push(setTimeout(() => {
        setVisibleItems(prev => [...prev, i]);
      }, item.delay));
    });
    // Restart after full sequence + pause
    const restart = setTimeout(() => setLoop(l => l + 1), DEMO_SEQUENCE[DEMO_SEQUENCE.length - 1].delay + 3500);
    return () => { timers.forEach(clearTimeout); clearTimeout(restart); };
  }, [loop]);

  return (
    <div className="surface-elevated rounded-2xl overflow-hidden">
      {/* Card header — browser chrome */}
      <div className="px-5 py-3.5 border-b border-border/30 flex items-center gap-3">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
        </div>
        <div className="flex-1 flex items-center justify-center gap-2">
          <Radio className="w-3 h-3 text-primary animate-pulse" />
          <span className="text-[11px] text-muted-foreground font-mono">Citation Intelligence · na żywo</span>
        </div>
      </div>

      {/* Engine status row */}
      <div className="px-5 py-3 border-b border-border/20 flex items-center gap-2">
        {["Google AI", "ChatGPT", "Perplexity", "Gemini"].map((eng, i) => {
          const done = visibleItems.includes(6) && i <= 1 || visibleItems.includes(7);
          return (
            <div key={eng} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all duration-500 ${
              done ? "bg-red-500/8 border border-red-500/20 text-red-400" : "bg-muted/30 border border-border/20 text-muted-foreground/50"
            }`}>
              {done ? <XCircle className="w-2.5 h-2.5" /> : <div className="w-2 h-2 rounded-full border border-current animate-pulse" />}
              <span className="hidden sm:inline">{eng.split(" ")[0]}</span>
            </div>
          );
        })}
      </div>

      {/* Live feed */}
      <div className="px-5 py-4 space-y-2.5 min-h-[180px]">
        {DEMO_SEQUENCE.map((item, i) => {
          if (!visibleItems.includes(i)) return null;
          if (item.type === "query") return (
            <div key={i} className="flex items-start gap-2 animate-float-up">
              <div className="w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Search className="w-2 h-2 text-primary" />
              </div>
              <span className="text-[11px] text-muted-foreground/70 italic">{item.text}</span>
            </div>
          );
          if (item.type === "miss") return (
            <div key={i} className="flex items-center gap-2 animate-float-up">
              <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span className="text-[11px] text-red-400/80 font-medium">{item.text}</span>
            </div>
          );
          if (item.type === "competitor") return (
            <div key={i} className="flex items-center gap-2 pl-5 animate-float-up">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
              <span className="text-[11px] font-mono text-amber-300/90">{item.text}</span>
              <span className="text-[10px] text-muted-foreground/40 ml-auto">zamiast Ciebie</span>
            </div>
          );
          if (item.type === "score") return (
            <div key={i} className="mt-3 p-3 rounded-xl bg-red-950/20 border border-red-500/20 animate-float-up">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black text-red-400">0</span>
                <span className="text-xs text-muted-foreground">/4 silników AI cytuje Twoją stronę</span>
              </div>
              <div className="mt-1.5 flex gap-1.5">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">zalando.pl</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">answear.com</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">modivo.pl</span>
              </div>
            </div>
          );
          if (item.type === "cta") return (
            <button
              key={i}
              onClick={onCtaClick}
              className="w-full mt-2 py-2.5 rounded-xl bg-primary/10 border border-primary/30 text-xs font-semibold text-primary hover:bg-primary/15 transition-colors animate-float-up"
            >
              Sprawdź swoją stronę →
            </button>
          );
          return null;
        })}
      </div>
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
// ─── Wow Timer ────────────────────────────────────────────────────────────────
function WowTimer({ targetSeconds, onComplete }: { targetSeconds: number; onComplete: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const pct = Math.min((elapsed / targetSeconds) * 100, 100);
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((e) => {
        const next = e + 0.1;
        if (next >= targetSeconds) {
          clearInterval(interval);
          setDone(true);
          onComplete();
          return targetSeconds;
        }
        return next;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [targetSeconds, onComplete]);
  const remaining = Math.max(0, Math.ceil(targetSeconds - elapsed));
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{done ? "Gotowe — przetwarzam wyniki…" : `Analiza · ${remaining}s`}</span>
        <span className="text-xs font-semibold text-primary">{Math.round(pct)}%</span>
      </div>
      <div className="h-1 rounded-full bg-border/30 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-violet-400 transition-all"
          style={{ width: `${pct}%`, transition: "width 0.1s linear" }}
        />
      </div>
    </div>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [annual, setAnnual] = useState(false);
  const [timerActive, setTimerActive] = useState(false);
  const [urlFocused, setUrlFocused] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  // Wow timer: announce X seconds, deliver in ~60% of that — always faster than promised
  const [wowTarget] = useState(() => 55 + Math.floor(Math.random() * 20)); // 55–74s announced
  const auditReadyRef = useRef<number | null>(null);
  const timerDoneRef = useRef(false);
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  // Rotating placeholder — conversational, Perplexity-style
  const PLACEHOLDERS = [
    "https://twojasklep.pl/produkt/kurtka-zimowa",
    "https://example.com/blog/jak-wybrac-materac",
    "https://sklep.pl/kategoria/buty-do-biegania",
    "https://marka.pl/o-nas",
    "https://agencja.pl/uslugi/seo",
  ];
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  useEffect(() => {
    if (urlFocused || url) return;
    const t = setInterval(() => setPlaceholderIdx(i => (i + 1) % PLACEHOLDERS.length), 3000);
    return () => clearInterval(t);
  }, [urlFocused, url]);

  trpc.audit.getGlobalStats.useQuery(undefined, { staleTime: 60_000 });

  usePendingAudit(isAuthenticated);

  // audit.start returns auditId immediately (fire-and-forget backend)
  // → navigate to /results right away, both Signal Audit + Citation Intelligence run in parallel
  const createAuditMutation = trpc.audit.start.useMutation({
    onSuccess: (data: { auditId: number }) => {
      // Navigate immediately — no timer gate needed
      navigate(`/results/${data.auditId}`);
    },
    onError: (error: { message?: string }) => {
      setIsSubmitting(false);
      setScanStep(0);
      setTimerActive(false);
      toast.error(error.message || "Błąd podczas tworzenia audytu");
    },
  });

  // Legacy timer callback — kept for compatibility but no longer gates navigation
  const handleTimerComplete = useCallback(() => {
    timerDoneRef.current = true;
  }, []);

  useEffect(() => {
    if (!isSubmitting) return;
    const interval = setInterval(() => setScanStep((s) => (s + 1) % SCAN_STEPS.length), 900);
    return () => clearInterval(interval);
  }, [isSubmitting]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) { setUrlError("Wklej URL strony do audytu"); return; }
    let normalized = trimmed;
    if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) normalized = "https://" + normalized;
    try { new URL(normalized); } catch { setUrlError("Nieprawidłowy URL — np. https://twojasklep.pl/produkt"); return; }
    setUrlError(null);
    // ✅ Anonymous audit — no login required
    auditReadyRef.current = null;
    timerDoneRef.current = false;
    setIsSubmitting(true);
    setTimerActive(true);
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
              <a href="#how-it-works" className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-white/5">Jak to działa</a>
              <a href="#pricing" className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-white/5">Plany</a>
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
                <span>Sprawdź widoczność w AI</span>
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
                <Radio className="w-3 h-3 animate-pulse" />
                <span>Platforma AI Search Visibility · GEO / AEO</span>
              </div>

              {/* Headline — Visibility First: emotional question, not a tool description */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-[1.05] tracking-tight mb-5">
                Czy AI poleca<br />
                <span className="gradient-text">Twoją stronę?</span>
              </h1>

              <p className="text-base sm:text-lg text-muted-foreground leading-relaxed mb-8 max-w-lg">
                Kiedy klient pyta ChatGPT, Perplexity lub Google AI — Twoja strona powinna być w odpowiedzi. Sprawdź w 60 sekund, czy AI Cię widzi, kto Cię wyprzedza i co zmienić, żeby AI zaczęło Cię polecać.
              </p>

              {/* URL Input — dominant, Perplexity-style */}
              <form onSubmit={handleSubmit} className="mb-3">
                <div className={`relative flex gap-2 p-1.5 rounded-2xl bg-card border shadow-2xl shadow-black/30 transition-all duration-200 ${
                  urlError ? "border-red-500/50 shadow-red-500/5" :
                  urlFocused ? "border-primary/50 shadow-primary/8" :
                  "border-border/50"
                }`}>
                  <div className="relative flex-1">
                    <Globe className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none transition-colors ${
                      urlFocused ? "text-primary/60" : "text-muted-foreground/40"
                    }`} />
                    <Input
                      ref={inputRef}
                      value={url}
                      onChange={(e) => { setUrl(e.target.value); if (urlError) setUrlError(null); }}
                      onFocus={() => setUrlFocused(true)}
                      onBlur={() => setUrlFocused(false)}
                      placeholder={PLACEHOLDERS[placeholderIdx]}
                      className="pl-10 h-12 text-sm bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 font-mono"
                      disabled={isSubmitting}
                      autoComplete="url"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="h-12 px-6 font-semibold gap-2 shrink-0 shadow-lg shadow-primary/25 rounded-xl"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                        <span className="hidden sm:inline text-xs">{SCAN_STEPS[scanStep]}</span>
                        <span className="sm:hidden text-xs">Analiza…</span>
                      </>
                    ) : (
                      <>
                        <Search className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Sprawdź widoczność w AI</span>
                        <span className="sm:hidden">Sprawdź</span>
                      </>
                    )}
                  </Button>
                </div>
                {/* Inline error */}
                {urlError && (
                  <p className="text-xs text-red-400 mt-2 flex items-center gap-1.5 pl-1">
                    <AlertTriangle className="w-3 h-3 shrink-0" />{urlError}
                  </p>
                )}
              </form>

              {/* Quick-fill example URLs — conversational, delight on click */}
              {!isSubmitting && !url && (
                <div className="flex flex-wrap items-center gap-2 mb-5">
                  <span className="text-[11px] text-muted-foreground/50">Przykłady:</span>
                  {[
                    { label: "Strona produktu", url: "https://twojasklep.pl/produkt/kurtka-zimowa" },
                    { label: "Artykuł blogowy", url: "https://example.com/blog/jak-wybrac-materac" },
                    { label: "Strona usługi", url: "https://agencja.pl/uslugi/seo" },
                  ].map((hint) => (
                    <button
                      key={hint.label}
                      onClick={() => { setUrl(hint.url); inputRef.current?.focus(); }}
                      className="text-[11px] px-2.5 py-1 rounded-full bg-card border border-border/40 text-muted-foreground hover:border-primary/30 hover:text-primary transition-colors"
                    >
                      {hint.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Demo link */}
              {!isSubmitting && (
                <div className="mb-4">
                  <button
                    onClick={() => navigate("/demo")}
                    className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5 group"
                  >
                    <Eye className="w-3 h-3" />
                    <span>Zobacz przykładowy raport Signal Audit</span>
                    <span className="text-muted-foreground/40 group-hover:text-primary/60 transition-colors">→</span>
                  </button>
                </div>
              )}

              {/* Trust signals / Wow Timer */}
              {timerActive ? (
                <div className="w-full max-w-md">
                  <div className="mb-2 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    <span className="text-xs text-muted-foreground">{SCAN_STEPS[scanStep]}</span>
                  </div>
                  <WowTimer targetSeconds={wowTarget * 0.62} onComplete={handleTimerComplete} />
                  <p className="text-[11px] text-muted-foreground/50 mt-2">Zapowiedziano {wowTarget}s — dowozimy szybciej.</p>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500/80" />
                    Bez rejestracji
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500/80" />
                    Wynik w 60 sekund
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500/80" />
                    4 silniki AI jednocześnie
                  </span>
                </div>
              )}

              {/* Engine strip */}
              <div className="mt-10 pt-8 border-t border-border/20">
                <p className="section-label mb-3">Weryfikujemy cytowania w</p>
                <div className="flex flex-wrap gap-2">
                  {AI_ENGINES.map((e) => (
                    <EngineBadge key={e.name} {...e} />
                  ))}
                </div>
              </div>
            </div>

            {/* Right column — live demo card */}
            <div className="lg:self-center">
              <LiveCitationDemoCard onCtaClick={() => inputRef.current?.focus()} />
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

      {/* ── AI Visibility Score — HubSpot Website Grader concept ── */}
      <section className="py-20 px-4 sm:px-6 relative overflow-hidden">
        <div className="absolute inset-0 dot-pattern opacity-20 pointer-events-none" />
        <div className="max-w-5xl mx-auto relative">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Left — concept */}
            <div>
              <div className="inline-flex items-center gap-2 pill pill-primary mb-6">
                <BarChart3 className="w-3 h-3" />
                <span>AI Visibility Score</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-black mb-5 tracking-tight leading-tight">
                Jeden wynik.<br />
                <span className="gradient-text">Wszystko co musisz wiedzieć.</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-8 text-sm max-w-md">
                Twój AI Visibility Score to kompozyt dwóch wymiarów: ile silników AI cytuje Twoją stronę i jaką ocenę techniczną dostaje. Jeden licznik 0–100. Jeden benchmark względem konkurencji. Jeden cel.
              </p>
              <div className="space-y-4">
                {[
                  { label: "Citation Score", desc: "Ile z 4 silników AI cytuje Twoją stronę na Twoich frazach", color: "text-violet-400", bg: "bg-violet-500/8 border-violet-500/20" },
                  { label: "Signal Score", desc: "AI Readiness Score z 40+ sprawdzeń technicznych i contentowych", color: "text-primary", bg: "bg-primary/8 border-primary/20" },
                ].map((item) => (
                  <div key={item.label} className={`flex items-start gap-3 p-3.5 rounded-xl border ${item.bg}`}>
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${item.color.replace("text-", "bg-")}`} />
                    <div>
                      <div className={`text-sm font-bold mb-0.5 ${item.color}`}>{item.label}</div>
                      <div className="text-xs text-muted-foreground leading-relaxed">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — score card */}
            <div className="surface-elevated rounded-2xl p-6">
              <div className="text-center mb-6">
                <div className="section-label mb-3">Twój AI Visibility Score</div>
                <div className="relative inline-flex items-center justify-center">
                  <svg width="160" height="160" viewBox="0 0 160 160">
                    <circle cx="80" cy="80" r="68" fill="none" stroke="oklch(0.20 0.010 260)" strokeWidth="10" />
                    <circle cx="80" cy="80" r="68" fill="none" stroke="oklch(0.62 0.26 285)" strokeWidth="10"
                      strokeDasharray={`${2 * Math.PI * 68 * 0.23} ${2 * Math.PI * 68 * 0.77}`}
                      strokeDashoffset={2 * Math.PI * 68 * 0.25}
                      strokeLinecap="round"
                      style={{ transition: "stroke-dasharray 1s ease" }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-5xl font-black text-red-400">23</span>
                    <span className="text-xs text-muted-foreground mt-1">/ 100</span>
                  </div>
                </div>
                <div className="mt-3">
                  <span className="pill pill-red text-xs">Niewidoczny w AI Search</span>
                </div>
              </div>

              {/* Breakdown */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Citation Score</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-red-400 rounded-full" style={{ width: "0%" }} />
                    </div>
                    <span className="font-semibold text-red-400 w-8 text-right">0/4</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Signal Score</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: "46%" }} />
                    </div>
                    <span className="font-semibold text-amber-400 w-8 text-right">46</span>
                  </div>
                </div>
              </div>

              {/* Competitor benchmark */}
              <div className="mt-5 pt-4 border-t border-border/20">
                <div className="section-label mb-3">Benchmark branżowy</div>
                <div className="space-y-2">
                  {[
                    { domain: "zalando.pl", score: 87, color: "bg-emerald-400" },
                    { domain: "answear.com", score: 71, color: "bg-emerald-400/70" },
                    { domain: "Twoja strona", score: 23, color: "bg-red-400", highlight: true },
                  ].map((item) => (
                    <div key={item.domain} className={`flex items-center gap-2 text-xs ${item.highlight ? "font-semibold" : ""}`}>
                      <span className={`w-24 truncate ${item.highlight ? "text-foreground" : "text-muted-foreground"}`}>{item.domain}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full ${item.color} rounded-full`} style={{ width: `${item.score}%` }} />
                      </div>
                      <span className={`w-6 text-right ${item.highlight ? "text-red-400" : "text-muted-foreground"}`}>{item.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="py-24 px-4 sm:px-6 relative overflow-hidden">
        <div className="absolute inset-0 dot-pattern opacity-30 pointer-events-none" />
        <div className="max-w-5xl mx-auto relative">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 pill pill-primary mb-5">
              <Layers className="w-3 h-3" />
              <span>Platforma AI Search Visibility</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-black mb-4 tracking-tight">
              Nie narzędzie. Platforma.<br />
              <span className="gradient-text">Cztery moduły. Jeden cel.</span>
            </h2>
            <p className="text-muted-foreground text-sm max-w-md mx-auto leading-relaxed">
              Każdy moduł zasila następny. Citation Intelligence wykrywa problem — Signal Audit diagnozuje przyczynę — Signal Rewrite naprawia — Pulse Monitor pilnuje wyniku. To jest pętla wzrostu widoczności w AI.
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

      {/* ── Social proof strip ── */}
      <section className="py-14 px-4 sm:px-6 border-y border-border/20 bg-card/20">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
            {[
              { value: "87%", label: "stron e-commerce nie jest cytowanych przez żadne AI", icon: TrendingDown, color: "text-red-400" },
              { value: "4", label: "silniki AI sprawdzamy jednocześnie: Google, ChatGPT, Perplexity, Gemini", icon: Radio, color: "text-primary" },
              { value: "60s", label: "do pierwszego wyniku Signal Audit bez rejestracji", icon: Zap, color: "text-emerald-400" },
              { value: "40+", label: "sprawdzeń technicznych i contentowych w każdym audycie", icon: CheckCircle2, color: "text-amber-400" },
            ].map((stat) => (
              <div key={stat.value} className="flex flex-col items-center gap-2">
                <stat.icon className={`w-5 h-5 ${stat.color} mb-1`} />
                <div className={`text-3xl font-black ${stat.color}`}>{stat.value}</div>
                <div className="text-[11px] text-muted-foreground leading-relaxed max-w-[140px]">{stat.label}</div>
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
                <span>Twój konkurent jest cytowany. Ty nie.</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-black mb-5 tracking-tight leading-tight">
                Każde zapytanie w ChatGPT<br />
                to transakcja sprzedażowa.<br />
                <span className="text-amber-400/80">Ktoś ją właśnie zamknął.</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-8 text-sm max-w-md">
                AI nie cytuje losowo. Wybiera strony, które spełniają konkretne kryteria techniczne i contentowe. Citation Intelligence pokazuje które URL-e Cię wyprzedzają, dlaczego AI je preferuje i co zmienić, żeby odwrócić tę relację.
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
                  <span className="text-xs font-semibold text-red-400/80">Przed — niewidoczny w AI Search</span>
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
                  <span className="text-[11px] font-semibold text-primary">Signal Rewrite</span>
                </div>
                <div className="flex-1 h-px bg-border/30" />
              </div>

              {/* After */}
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/8 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  </div>
                  <span className="text-xs font-semibold text-emerald-400/80">Po — Signal Rewrite · cytowany przez Perplexity</span>
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
              <span>Plany</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-black mb-4 tracking-tight">Zacznij za darmo.<br />
              <span className="text-muted-foreground/60">Skaluj gdy wyniki rosną.</span>
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
            Czy AI poleca Twoją stronę?<br />
            <span className="gradient-text">Odpowiedź w 60 sekund.</span>
          </h2>
          <p className="text-muted-foreground mb-10 leading-relaxed text-sm max-w-md mx-auto">
            Wpisz URL. Sprawdzamy ChatGPT, Gemini, Perplexity i Google AI jednocześnie. Dowiesz się dokładnie, kto Cię wyprzedza i co zmienić, żeby AI zaczęło Cię polecać.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              size="lg"
              onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); setTimeout(() => inputRef.current?.focus(), 400); }}
              className="gap-2.5 px-10 h-12 text-base font-semibold shadow-xl shadow-primary/25"
            >
              <Search className="w-4.5 h-4.5" />
              Sprawdź widoczność w AI
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => { window.location.href = "/demo"; }}
              className="gap-2 px-8 h-12 text-sm"
            >
              <Eye className="w-4 h-4" />
              Zobacz przykładowy raport
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-5">
            Bez konta. Bez karty. Jeden audyt bezpłatnie.
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
                Platforma do AI Search Optimization na poziomie podstrony. Signal Audit, Citation Intelligence, Signal Rewrite i Pulse Monitor — w jednym miejscu.
              </p>
            </div>
            <div>
              <div className="section-label mb-4">Platforma</div>
              <div className="space-y-2.5">
                <a href="#how-it-works" className="block text-xs text-muted-foreground hover:text-foreground transition-colors">Jak to działa</a>
                <a href="#pricing" className="block text-xs text-muted-foreground hover:text-foreground transition-colors">Plany</a>
                <a href="/dashboard" className="block text-xs text-muted-foreground hover:text-foreground transition-colors">Command Center</a>
              </div>
            </div>
            <div>
              <div className="section-label mb-4">Pomoc</div>
              <div className="space-y-2.5">
                <a href="#faq" className="block text-xs text-muted-foreground hover:text-foreground transition-colors">FAQ</a>
                <a href="/demo" className="block text-xs text-muted-foreground hover:text-foreground transition-colors">Przykładowy raport</a>
                <a href="/pricing" className="block text-xs text-muted-foreground hover:text-foreground transition-colors">Cennik</a>
                <a href="mailto:hello@geoauditor.app" className="block text-xs text-muted-foreground hover:text-foreground transition-colors">Kontakt</a>
              </div>
            </div>
          </div>
          <div className="border-t border-border/20 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">© 2026 GEO-Auditor. Wszelkie prawa zastrzeżone.</p>
            <div className="flex items-center gap-5 text-xs text-muted-foreground">
              <a href="/privacy" className="hover:text-foreground transition-colors">Polityka prywatności</a>
              <a href="/terms" className="hover:text-foreground transition-colors">Regulamin</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const SCAN_STEPS = [
  "Pobieranie strony…",
  "Weryfikacja dostępu crawlerów…",
  "Analiza schema.org i metadanych…",
  "Ocena sygnałów contentowych…",
  "Generowanie rekomendacji…",
];

const WORKFLOW_PREVIEW = [
  { icon: Eye, label: "Citation Intelligence", sub: "Cytowania w ChatGPT, Gemini, Perplexity" },
  { icon: Shield, label: "Signal Audit", sub: "40+ sprawdzeń · AI Readiness Score" },
  { icon: Sparkles, label: "Signal Rewrite", sub: "Przepisany tekst gotowy do wdrożenia" },
  { icon: Activity, label: "Pulse Monitor", sub: "Cotygodniowy re-audyt i alerty" },
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
    headline: "AI Search nie jest Google",
    body: "ChatGPT, Gemini i Perplexity cytują strony na podstawie sygnałów semantycznych, struktury treści i danych maszynowych — nie pozycji w SERP. Twoje SEO nie przekłada się automatycznie na widoczność w AI.",
  },
  {
    icon: Target,
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    headline: "Audyt na poziomie podstrony",
    body: "Nie domena. Konkretny URL: strona produktu, artykuł, kategoria, landing page. Każda podstrona dostaje własny AI Readiness Score i oddzielną listę poprawek.",
  },
  {
    icon: Zap,
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-400",
    headline: "Gotowe do wdrożenia",
    body: "Nie \"popraw treść\". Konkretna instrukcja: co dodać, co zmienić, co usunąć. Signal Rewrite generuje przepisaną wersję strony — gotową do wklejenia.",
  },
];

const WORKFLOW_CARDS = [
  {
    icon: Eye,
    iconBg: "bg-violet-500/10",
    iconColor: "text-violet-400",
    title: "Citation Intelligence",
    featured: true,
    desc: "Sprawdź w 60 sekund, czy ChatGPT, Gemini, Perplexity i Google AI cytują Twoją stronę — i kto Cię wyprzedza.",
    bullets: ["Per-frazowa analiza czterech silników AI", "Pełna lista URL-i cytowanych zamiast Ciebie", "Analiza porównawcza z konkurentami"],
  },
  {
    icon: Shield,
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    title: "Signal Audit",
    featured: false,
    desc: "40+ sprawdzeń technicznych i contentowych. Jeden AI Readiness Score 0–100 z priorytetowaną listą blokad.",
    bullets: ["robots.txt, schema.org, Core Web Vitals", "Content Intelligence (5 wymiarów)", "E-E-A-T & Helpful Content Signal"],
  },
  {
    icon: Sparkles,
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-400",
    title: "Signal Rewrite",
    featured: false,
    desc: "Nowa wersja treści napisana pod sygnały AI Search — na podstawie danych z Signal Audit i wzorców cytowanych stron.",
    bullets: ["Ekstrakcja encji i faktów z cytowanych URL-i", "Struktura zoptymalizowana pod LLM", "Gotowy tekst do wdrożenia w 1 klik"],
  },
  {
    icon: Activity,
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-400",
    title: "Pulse Monitor",
    featured: false,
    desc: "Cotygodniowy re-audyt monitorowanych podstron. Alert gdy score spada lub nowy konkurent przejmuje cytowania.",
    bullets: ["Automatyczne re-audyty co 7 dni", "Alerty o zmianach cytowań", "Historia AI Readiness Score"],
  },
];

const EMOTIONAL_ITEMS = [
  { icon: Eye, label: "Które URL-e Cię wyprzedzają", desc: "Pełna lista adresów cytowanych przez AI na Twoich frazach" },
  { icon: Target, label: "Dlaczego AI je preferuje", desc: "Konkretne sygnały: gęstość encji, struktura, schema.org, E-E-A-T" },
  { icon: Sparkles, label: "Co zmienić, żeby ich wyprzedzić", desc: "Signal Rewrite generuje nową wersję treści gotową do wdrożenia" },
];

const PRICING_PLANS = [
  {
    name: "Free",
    price: "0 zł",
    priceAnnual: "0 zł",
    period: "",
    desc: "Pełny Signal Audit bez konta i karty",
    featured: false,
    cta: "Sprawdź sygnał",
    badge: null,
    features: [
      "5 analiz / miesiąc",
      "AI Readiness Score (0–100)",
      "Signal Audit — 40+ sprawdzeń",
      "Content Intelligence",
      "1 strona w Pulse Monitor",
    ],
  },
  {
    name: "Starter",
    price: "149 zł",
    priceAnnual: "119 zł",
    period: "/ mies.",
    desc: "Dla właścicieli sklepów i content managerów",
    featured: true,
    cta: "Zacznij 7-dniowy trial",
    badge: "Najpopularniejszy",
    features: [
      "50 analiz / miesiąc",
      "Citation Intelligence (Google + ChatGPT)",
      "Signal Rewrite — 10 przepisań/mies.",
      "Historia AI Readiness Score",
      "Pulse Monitor — 10 podstron",
      "Eksport PDF",
      "Wsparcie priorytetowe",
    ],
  },
  {
    name: "Pro",
    price: "399 zł",
    priceAnnual: "319 zł",
    period: "/ mies.",
    desc: "Dla agencji SEO i e-commerce z rosnącą skalą",
    featured: false,
    cta: "Zacznij 7-dniowy trial",
    badge: null,
    features: [
      "200 analiz / miesiąc",
      "Citation Intelligence — 3 konkurenci",
      "Signal Rewrite bez limitu",
      "Pulse Monitor — 50 podstron",
      "Zaawansowane rekomendacje contentowe",
      "Dostęp do API",
      "Raporty white-label",
    ],
  },
];

const FAQ = [
  {
    q: "Czym różni się GEO-Auditor od Semrush czy Ahrefs?",
    a: "Semrush i Ahrefs mierzą widoczność w tradycyjnym Google Search — rankingi, linki, ruch organiczny. GEO-Auditor analizuje wyłącznie sygnały AI Search: czy ChatGPT, Gemini i Perplexity cytują Twoją stronę i dlaczego nie. To różne metryki, różne algorytmy, różne rekomendacje. Jedno narzędzie nie zastępuje drugiego — uzupełniają się.",
  },
  {
    q: "Czy mogę analizować dowolną podstronę — nie tylko stronę główną?",
    a: "Tak — i to jest fundament całej platformy. Analizujesz konkretny URL: stronę produktu, artykuł, kategorię, landing page. Każda podstrona dostaje własny AI Readiness Score i oddzielną listę poprawek. Domena to kontekst — podstrona to miejsce, gdzie tracisz lub zdobywasz cytowania.",
  },
  {
    q: "Jak działa Signal Rewrite?",
    a: "Signal Rewrite pobiera treść Twojej strony, analizuje URL-e cytowane przez AI na Twoich frazach, wyciąga kluczowe encje i fakty — a następnie generuje nową wersję treści zoptymalizowaną pod sygnały AI Search. Wynik to gotowy tekst do wklejenia, nie lista sugestii do samodzielnego wdrożenia.",
  },
  {
    q: "Jak działa Pulse Monitor?",
    a: "Pulse Monitor re-audytuje monitorowane podstrony automatycznie co 7 dni. Dostajesz alert gdy AI Readiness Score spada, gdy nowy konkurent przejmuje cytowania na Twoich frazach, lub gdy Twoja strona po raz pierwszy zostaje zacytowana przez AI. Nie musisz pamiętać o ręcznym sprawdzaniu.",
  },
  {
    q: "Czy mogę korzystać z GEO-Auditor bez zakładania konta?",
    a: "Tak — pierwsze 5 analiz Signal Audit dostępnych jest bez rejestracji i bez podawania karty. Konto jest wymagane do zapisu historii wyników, Pulse Monitor i Signal Rewrite.",
  },
  {
    q: "Ile czasu zajmuje pełna analiza?",
    a: "Signal Audit jest gotowy w 30–60 sekund. Citation Intelligence — weryfikacja cytowań w ChatGPT, Gemini i Google AI — trwa 2–5 minut, ponieważ odpytujemy rzeczywiste silniki AI w czasie rzeczywistym, nie bazę danych. Signal Rewrite generuje się w 30–90 sekund w zależności od długości strony.",
  },
  {
    q: "Czy GEO-Auditor działa dla stron w języku polskim?",
    a: "Tak — platforma obsługuje strony w języku polskim i angielskim. Signal Audit, Citation Intelligence i Signal Rewrite działają w obu językach. Rekomendacje są generowane w języku analizowanej strony.",
  },
];
