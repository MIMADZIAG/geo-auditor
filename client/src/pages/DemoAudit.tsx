import { useState } from "react";
import { useLocation } from "wouter";
import {
  Bot, ArrowLeft, CheckCircle2, XCircle, AlertTriangle, Zap,
  Shield, Eye, Sparkles, Activity, ChevronDown, ChevronUp,
  ExternalLink, Copy, Search, BarChart3, FileText, Globe,
  TrendingUp, Star, BadgeCheck, Brain, Target, Lock, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// ─── Score Ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color = score >= 70 ? "oklch(0.72 0.18 145)" : score >= 40 ? "oklch(0.76 0.18 75)" : "oklch(0.62 0.24 22)";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[-90deg]">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="oklch(0.20 0.010 260)" strokeWidth="6" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="6"
        strokeDasharray={`${fill} ${circ - fill}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 1.2s cubic-bezier(0.16,1,0.3,1)" }}
      />
    </svg>
  );
}

// ─── Category Bar ─────────────────────────────────────────────────────────────
function CategoryBar({ label, score, max = 100 }: { label: string; score: number; max?: number }) {
  const pct = (score / max) * 100;
  const color = pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-36 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-border/30 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold w-8 text-right">{score}</span>
    </div>
  );
}

// ─── Check Item ───────────────────────────────────────────────────────────────
function CheckItem({ status, label, detail }: { status: "pass" | "fail" | "warn"; label: string; detail?: string }) {
  const [open, setOpen] = useState(false);
  const icon = status === "pass"
    ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
    : status === "fail"
    ? <XCircle className="w-4 h-4 text-red-500 shrink-0" />
    : <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;
  return (
    <div className="border-b border-border/20 last:border-0">
      <button
        className="w-full flex items-center gap-3 py-3 text-left hover:bg-white/2 transition-colors"
        onClick={() => detail && setOpen(!open)}
      >
        {icon}
        <span className="text-xs flex-1">{label}</span>
        {detail && (open ? <ChevronUp className="w-3 h-3 text-muted-foreground/50" /> : <ChevronDown className="w-3 h-3 text-muted-foreground/50" />)}
      </button>
      {open && detail && (
        <p className="text-xs text-muted-foreground pb-3 pl-7 pr-4 leading-relaxed">{detail}</p>
      )}
    </div>
  );
}

// ─── Recommendation Card ──────────────────────────────────────────────────────
function RecommendationCard({
  priority, title, description, impact, codeSnippet, effort,
}: {
  priority: "critical" | "high" | "medium";
  title: string;
  description: string;
  impact: string;
  codeSnippet?: string;
  effort: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const badgeColor = priority === "critical"
    ? "bg-red-500/10 text-red-400 border-red-500/20"
    : priority === "high"
    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
    : "bg-blue-500/10 text-blue-400 border-blue-500/20";
  const label = priority === "critical" ? "Krytyczne" : priority === "high" ? "Wysokie" : "Średnie";
  return (
    <div className="surface-elevated rounded-xl p-5 border border-border/30">
      <div className="flex items-start gap-3 mb-3">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badgeColor} shrink-0 mt-0.5`}>{label}</span>
        <div className="flex-1">
          <h4 className="text-sm font-semibold mb-1">{title}</h4>
          <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground mb-3">
        <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3 text-emerald-400" /> {impact}</span>
        <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-primary" /> {effort}</span>
      </div>
      {codeSnippet && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[11px] text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? "Ukryj kod" : "Pokaż gotowy kod"}
          </button>
          {expanded && (
            <div className="mt-3 relative">
              <pre className="text-[11px] bg-black/40 rounded-lg p-4 overflow-x-auto text-emerald-300/90 leading-relaxed border border-border/20">
                {codeSnippet}
              </pre>
              <button
                onClick={() => { navigator.clipboard.writeText(codeSnippet); toast.success("Skopiowano do schowka"); }}
                className="absolute top-2 right-2 p-1.5 rounded-md bg-white/5 hover:bg-white/10 transition-colors"
              >
                <Copy className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Content Intelligence Dimension ──────────────────────────────────────────
function CIDimension({ label, score, verdict, detail }: { label: string; score: number; verdict: string; detail: string }) {
  const [open, setOpen] = useState(false);
  const color = score >= 70 ? "text-emerald-400" : score >= 40 ? "text-amber-400" : "text-red-400";
  return (
    <div className="border border-border/30 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-4 p-4 text-left hover:bg-white/2 transition-colors"
      >
        <div className="w-10 h-10 rounded-lg bg-card flex items-center justify-center shrink-0">
          <span className={`text-sm font-black ${color}`}>{score}</span>
        </div>
        <div className="flex-1">
          <div className="text-xs font-semibold mb-0.5">{label}</div>
          <div className={`text-[11px] ${color}`}>{verdict}</div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground/50 shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground/50 shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 text-xs text-muted-foreground leading-relaxed border-t border-border/20 pt-3">
          {detail}
        </div>
      )}
    </div>
  );
}

// ─── Main Demo Page ───────────────────────────────────────────────────────────
export default function DemoAudit() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<"optimization" | "visibility" | "content">("optimization");

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Header ── */}
      <header className="sticky top-0 z-40 glass-strong border-b border-border/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs hidden sm:inline">Strona główna</span>
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center shrink-0">
              <Bot className="w-3 h-3 text-primary-foreground" />
            </div>
            <span className="font-bold text-sm tracking-tight">GEO-Auditor</span>
            <span className="text-muted-foreground/40 mx-1">·</span>
            <span className="text-xs text-muted-foreground truncate">Przykładowy raport Signal Audit</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] px-2 py-1 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">DEMO</span>
            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => navigate("/")}>
              <Search className="w-3 h-3" />
              Analizuj swoją stronę
            </Button>
          </div>
        </div>
      </header>

      {/* ── Demo Banner ── */}
      <div className="bg-violet-500/8 border-b border-violet-500/20 px-4 py-2.5">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0" />
          <p className="text-xs text-violet-300/90">
            To jest przykładowy raport Signal Audit dla fikcyjnej domeny <strong>velora-fashion.pl</strong>. Wklej swój URL na stronie głównej, żeby zobaczyć prawdziwy wynik.
          </p>
        </div>
      </div>

      {/* ── Page Header ── */}
      <div className="border-b border-border/20 bg-card/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="w-3.5 h-3.5 text-muted-foreground/60" />
                <span className="text-xs text-muted-foreground font-mono truncate">velora-fashion.pl/kolekcja/sukienki-letnie-2025</span>
                <ExternalLink className="w-3 h-3 text-muted-foreground/40 shrink-0" />
              </div>
              <h1 className="text-lg font-bold leading-tight mb-1 line-clamp-2">
                Sukienki letnie 2025 — kolekcja damska | Velora Fashion
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="px-2 py-0.5 rounded-full bg-card border border-border/40">Strona kategorii</span>
                <span>·</span>
                <span>Signal Audit ukończony</span>
                <span>·</span>
                <span>2 kwi 2026, 14:37</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Score Hero ── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="surface-elevated rounded-2xl p-6 sm:p-8 border border-border/30 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-8 items-center">
            {/* Score ring */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <ScoreRing score={34} size={120} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-black text-red-400">34</span>
                  <span className="text-[10px] text-muted-foreground">/ 100</span>
                </div>
              </div>
              <div className="text-center">
                <span className="text-xs font-semibold text-red-400">Niewidoczny dla AI</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">Poniżej progu cytowania</p>
              </div>
            </div>

            {/* Category breakdown */}
            <div>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-semibold">AI Readiness Score — podział kategorii</h2>
                <span className="text-[11px] text-muted-foreground">40+ sprawdzeń</span>
              </div>
              <div className="space-y-3">
                <CategoryBar label="Technikalia" score={52} />
                <CategoryBar label="Dane strukturalne" score={18} />
                <CategoryBar label="Struktura treści" score={41} />
                <CategoryBar label="E-E-A-T" score={28} />
                <CategoryBar label="Dostęp crawlerów AI" score={85} />
                <CategoryBar label="Meta tagi" score={63} />
              </div>
              <div className="mt-5 p-3 rounded-lg bg-red-500/5 border border-red-500/15">
                <p className="text-xs text-red-300/90 leading-relaxed">
                  <strong>Główna blokada:</strong> Brak danych strukturalnych (schema.org) i słabe sygnały E-E-A-T uniemożliwiają ChatGPT i Gemini identyfikację tej strony jako wiarygodnego źródła. Strona jest technicznie dostępna dla crawlerów, ale treść nie spełnia kryteriów cytowania.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 p-1 rounded-xl bg-card/60 border border-border/30 mb-6 overflow-x-auto">
          {[
            { id: "optimization", label: "01 · Optymalizacja", icon: Shield },
            { id: "visibility", label: "02 · Widoczność AI", icon: Eye },
            { id: "content", label: "03 · Content Intelligence", icon: Brain },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex-1 justify-center ${
                activeTab === id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {label}
            </button>
          ))}
        </div>

        {/* ── Tab: Optymalizacja ── */}
        {activeTab === "optimization" && (
          <div className="space-y-6">
            {/* Critical Issues */}
            <div>
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-500" />
                Krytyczne blokady sygnału
                <span className="ml-auto text-[11px] text-muted-foreground font-normal">7 problemów</span>
              </h3>
              <div className="space-y-3">
                <RecommendationCard
                  priority="critical"
                  title="Brak schema.org Product — silniki AI nie rozpoznają produktów"
                  description="Strona kategorii z produktami nie zawiera żadnych danych strukturalnych. ChatGPT i Google AI Overviews nie mogą zidentyfikować oferty, cen ani dostępności. To najpoważniejsza blokada cytowania na stronach e-commerce."
                  impact="+18–22 pkt AI Readiness Score"
                  effort="2–4h implementacji"
                  codeSnippet={`<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "Sukienki letnie 2025",
  "description": "Kolekcja sukienek letnich damskich na sezon 2025",
  "numberOfItems": 48,
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": {
        "@type": "Product",
        "name": "Sukienka maxi w kwiaty Aria",
        "image": "https://velora-fashion.pl/img/aria-maxi.jpg",
        "offers": {
          "@type": "Offer",
          "price": "189.00",
          "priceCurrency": "PLN",
          "availability": "https://schema.org/InStock"
        },
        "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": "4.7",
          "reviewCount": "143"
        }
      }
    }
  ]
}
</script>`}
                />
                <RecommendationCard
                  priority="critical"
                  title="Brak sekcji FAQ — strona nie odpowiada na pytania użytkowników"
                  description="AI Search cytuje strony, które bezpośrednio odpowiadają na pytania. Strona kategorii bez FAQ jest pomijana na zapytania typu 'jakie sukienki letnie wybrać', 'sukienki na wesele 2025'. Dodanie 5–8 pytań z odpowiedziami może podwoić szansę cytowania."
                  impact="+12–15 pkt AI Readiness Score"
                  effort="1–2h treści + 30 min implementacji"
                  codeSnippet={`<section class="faq-section">
  <h2>Najczęściej zadawane pytania</h2>
  <div itemscope itemtype="https://schema.org/FAQPage">
    <div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
      <h3 itemprop="name">Jakie sukienki letnie są modne w 2025?</h3>
      <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
        <p itemprop="text">W sezonie 2025 dominują sukienki maxi w kwiatowe wzory,
        lniane sukienki midi w stonowanych kolorach (ecru, sage green, terracotta)
        oraz asymetryczne mini z marszczeniami. Kluczowe tkaniny to len, bawełna
        i wiskoza — naturalne materiały odpowiadające na trend slow fashion.</p>
      </div>
    </div>
  </div>
</section>`}
                />
                <RecommendationCard
                  priority="critical"
                  title="Brak Organization schema — silniki AI nie wiedzą, kto stoi za stroną"
                  description="Bez danych o organizacji (nazwa firmy, adres, NIP, social media) Google Knowledge Graph i ChatGPT nie mogą zweryfikować wiarygodności marki. To bezpośredni wpływ na sygnały E-E-A-T."
                  impact="+8–10 pkt AI Readiness Score"
                  effort="1h implementacji"
                  codeSnippet={`<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Velora Fashion",
  "url": "https://velora-fashion.pl",
  "logo": "https://velora-fashion.pl/logo.png",
  "sameAs": [
    "https://www.instagram.com/velorafashion",
    "https://www.facebook.com/velorafashion",
    "https://www.linkedin.com/company/velora-fashion"
  ],
  "contactPoint": {
    "@type": "ContactPoint",
    "telephone": "+48-22-123-45-67",
    "contactType": "customer service",
    "availableLanguage": "Polish"
  }
}
</script>`}
                />
              </div>
            </div>

            {/* Technical Checks */}
            <div className="surface-elevated rounded-2xl border border-border/30 overflow-hidden">
              <div className="px-5 py-4 border-b border-border/20">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  Sprawdzenia techniczne
                </h3>
              </div>
              <div className="px-5">
                <CheckItem status="pass" label="HTTPS — bezpieczne połączenie" />
                <CheckItem status="pass" label="robots.txt — plik dostępny i poprawny" />
                <CheckItem status="pass" label="GPTBot — dostęp niezablokowany" />
                <CheckItem status="pass" label="Google-Extended — dostęp niezablokowany" />
                <CheckItem status="pass" label="ClaudeBot — dostęp niezablokowany" />
                <CheckItem status="pass" label="Canonical tag — obecny i poprawny" />
                <CheckItem status="warn" label="Meta description — zbyt krótka (87 znaków)" detail="Optymalna długość meta description dla AI Search to 150–160 znaków. Obecna wersja nie zawiera kluczowych słów opisujących ofertę. Zalecana wersja: 'Odkryj kolekcję sukienek letnich 2025 — maxi, midi i mini w kwiatowe wzory, len i bawełna. Darmowa dostawa od 199 zł. Szybka wysyłka 24h.'" />
                <CheckItem status="warn" label="Title tag — brak roku i słów kluczowych" detail="Obecny tytuł: 'Sukienki letnie | Velora Fashion'. Zalecany: 'Sukienki letnie 2025 — kolekcja damska maxi, midi, mini | Velora Fashion'. Rok i typ produktu zwiększają trafność w AI Search." />
                <CheckItem status="fail" label="max-snippet — brak dyrektywy (domyślnie ograniczona)" detail="Brak tagu <meta name='robots' content='max-snippet:-1'> oznacza, że Google AI Overviews może używać tylko fragmentów treści. Dodanie max-snippet:-1 pozwala AI na cytowanie pełnych akapitów." />
                <CheckItem status="fail" label="Dane strukturalne — całkowity brak schema.org" detail="Strona nie zawiera żadnych danych strukturalnych JSON-LD. Brak: Product, ItemList, Organization, FAQPage, BreadcrumbList. To krytyczna blokada dla wszystkich silników AI." />
                <CheckItem status="fail" label="BreadcrumbList schema — brak nawigacji okruszkowej" detail="Nawigacja okruszkowa w schema.org pomaga AI zrozumieć hierarchię strony i kontekst produktów. Bez niej silniki AI mają trudność z klasyfikacją treści." />
                <CheckItem status="fail" label="dateModified — brak znacznika świeżości treści" detail="Brak meta tagu lub schema.org dateModified sprawia, że AI nie wie, kiedy treść była aktualizowana. Świeżość to jeden z kluczowych sygnałów rankingowych w AI Search." />
              </div>
            </div>
          </div>
        )}

        {/* ── Tab: Widoczność AI ── */}
        {activeTab === "visibility" && (
          <div className="space-y-6">
            {/* Citation status */}
            <div className="surface-elevated rounded-2xl border border-border/30 p-6">
              <h3 className="text-sm font-semibold mb-5 flex items-center gap-2">
                <Eye className="w-4 h-4 text-violet-400" />
                Status cytowań w silnikach AI
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { engine: "ChatGPT", status: "Nie cytuje", color: "text-red-400", bg: "bg-red-500/5 border-red-500/15" },
                  { engine: "Google AI", status: "Nie cytuje", color: "text-red-400", bg: "bg-red-500/5 border-red-500/15" },
                  { engine: "Perplexity", status: "Nie cytuje", color: "text-red-400", bg: "bg-red-500/5 border-red-500/15" },
                  { engine: "Gemini", status: "Nie cytuje", color: "text-red-400", bg: "bg-red-500/5 border-red-500/15" },
                ].map(({ engine, status, color, bg }) => (
                  <div key={engine} className={`rounded-xl border p-4 text-center ${bg}`}>
                    <div className="text-xs font-semibold mb-1">{engine}</div>
                    <div className={`text-[11px] ${color}`}>{status}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Competing URLs */}
            <div className="surface-elevated rounded-2xl border border-border/30 overflow-hidden">
              <div className="px-5 py-4 border-b border-border/20">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Target className="w-4 h-4 text-amber-400" />
                  Strony cytowane zamiast Ciebie
                  <span className="ml-auto text-[11px] text-muted-foreground font-normal">fraza: "sukienki letnie 2025"</span>
                </h3>
              </div>
              <div className="divide-y divide-border/20">
                {[
                  { pos: 1, url: "vogue.pl/moda/trendy-sukienki-letnie-2025", score: 87, reason: "FAQ schema, Organization, 2400 słów, 12 cytowań zewnętrznych" },
                  { pos: 2, url: "elle.pl/moda/sukienki-na-lato-2025-trendy", score: 81, reason: "Article schema, autor z byline, dateModified, E-E-A-T" },
                  { pos: 3, url: "answear.com/blog/sukienki-letnie-2025", score: 76, reason: "FAQPage schema, Product schema, 1800 słów, TL;DR" },
                ].map(({ pos, url, score, reason }) => (
                  <div key={pos} className="px-5 py-4 flex items-start gap-4">
                    <span className="text-xs font-black text-muted-foreground/40 w-5 shrink-0 mt-0.5">#{pos}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono text-primary/80 truncate mb-1">{url}</div>
                      <div className="text-[11px] text-muted-foreground">{reason}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-black text-emerald-400">{score}</div>
                      <div className="text-[10px] text-muted-foreground">score</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-5 py-4 border-t border-border/20 bg-card/30">
                <div className="flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-muted-foreground/50" />
                  <p className="text-xs text-muted-foreground">
                    Pełna analiza AI Visibility Check (wszystkie frazy + 3 konkurenci) dostępna w planie <strong>Starter</strong>.
                  </p>
                  <Button size="sm" variant="outline" className="ml-auto h-7 text-[11px] shrink-0" onClick={() => window.location.href = "/pricing"}>
                    Odblokuj <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                </div>
              </div>
            </div>

            {/* AI Crawler access */}
            <div className="surface-elevated rounded-2xl border border-border/30 overflow-hidden">
              <div className="px-5 py-4 border-b border-border/20">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Bot className="w-4 h-4 text-emerald-400" />
                  Dostęp crawlerów AI
                  <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Wszystkie odblokowane</span>
                </h3>
              </div>
              <div className="px-5">
                {[
                  { name: "GPTBot (ChatGPT)", status: "pass" as const },
                  { name: "Google-Extended (AI Overviews)", status: "pass" as const },
                  { name: "PerplexityBot", status: "pass" as const },
                  { name: "ClaudeBot (Anthropic)", status: "pass" as const },
                  { name: "OAI-SearchBot (ChatGPT Search)", status: "pass" as const },
                  { name: "YouBot (You.com)", status: "pass" as const },
                ].map(({ name, status }) => (
                  <CheckItem key={name} status={status} label={name} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Tab: Content Intelligence ── */}
        {activeTab === "content" && (
          <div className="space-y-6">
            {/* Citeability score */}
            <div className="surface-elevated rounded-2xl border border-border/30 p-6">
              <div className="flex items-center gap-6">
                <div className="relative shrink-0">
                  <ScoreRing score={29} size={90} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black text-red-400">29</span>
                    <span className="text-[9px] text-muted-foreground">/ 100</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Citeability Score</div>
                  <h3 className="text-base font-bold mb-2">Treść nie spełnia kryteriów cytowania</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed max-w-md">
                    Strona zawiera głównie nazwy produktów i ceny. Brak odpowiedzi na pytania, brak faktów z datami, brak unikalnej perspektywy. AI Search pomija takie strony na rzecz treści edytorialnych.
                  </p>
                </div>
              </div>
            </div>

            {/* Top questions */}
            <div className="surface-elevated rounded-2xl border border-border/30 p-5">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Search className="w-4 h-4 text-primary" />
                Pytania, na które Twoja strona powinna odpowiadać
              </h3>
              <div className="space-y-2">
                {[
                  "Jakie sukienki letnie są modne w 2025?",
                  "Sukienki na wesele 2025 — co wybrać?",
                  "Jak dobrać sukienkę letnią do figury?",
                  "Sukienki maxi czy midi — co jest bardziej eleganckie?",
                  "Z czego szyć sukienki letnie — len czy bawełna?",
                ].map((q, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-card/50 border border-border/20">
                    <span className="text-[10px] font-bold text-muted-foreground/40 w-4 shrink-0">{i + 1}</span>
                    <span className="text-xs">{q}</span>
                    <XCircle className="w-3.5 h-3.5 text-red-500/60 shrink-0 ml-auto" />
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-3">Żadne z tych pytań nie jest zaadresowane w obecnej treści strony.</p>
            </div>

            {/* CI Dimensions */}
            <div>
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Brain className="w-4 h-4 text-violet-400" />
                Analiza 5 wymiarów Content Intelligence
              </h3>
              <div className="space-y-3">
                <CIDimension
                  label="Gęstość odpowiedzi"
                  score={15}
                  verdict="Krytycznie niska — strona nie odpowiada na żadne pytania"
                  detail="Strona zawiera wyłącznie nazwy produktów, ceny i przyciski 'Dodaj do koszyka'. Brak jakichkolwiek odpowiedzi na pytania użytkowników. AI Search wymaga, żeby strona bezpośrednio adresowała intencje zapytań — np. 'Sukienki maxi w kwiaty to hit sezonu 2025. Sprawdzają się na wesela, pikniki i wakacje. Dostępne w rozmiarach XS–3XL.'"
                />
                <CIDimension
                  label="Gęstość faktów"
                  score={22}
                  verdict="Niska — brak liczb, dat i konkretnych danych"
                  detail="Dobra treść dla AI Search zawiera co najmniej 8–12 faktów na 1000 słów: liczby, daty, nazwy marek, specyfikacje materiałów, wyniki badań. Obecna strona ma 2–3 fakty (cena, rozmiar) na 1000 słów. Dodaj: 'Len obniża temperaturę ciała o 3–4°C w porównaniu do syntetyków (badanie ITMA 2024)' lub 'Kolekcja zawiera 48 modeli w 12 kolorach sezonowych.'"
                />
                <CIDimension
                  label="Ryzyko duplikacji"
                  score={38}
                  verdict="Podwyższone — treść brzmi generycznie"
                  detail="Opisy produktów są bardzo podobne do setek innych stron e-commerce. AI Search preferuje unikalne perspektywy i oryginalne dane. Zalecenie: dodaj sekcję 'Nasz wybór redakcji' z uzasadnieniem, dlaczego te konkretne modele trafiły do kolekcji, lub 'Jak stylizujemy sukienki letnie w Velora' z konkretnymi przykładami."
                />
                <CIDimension
                  label="Gotowość do cytowania"
                  score={19}
                  verdict="Bardzo niska — brak cytowalnych twierdzeń"
                  detail="Cytowalne twierdzenia to fakty z datą, autorem lub źródłem, które AI może zacytować jako odpowiedź. Przykłady do dodania: 'Według raportu Fashion Forward 2025, sukienki lniane stanowią 34% sprzedaży letniej w Polsce', 'Kolekcja 2025 projektowana przez Annę Kowalską, absolwentkę Akademii Sztuk Pięknych w Warszawie.'"
                />
                <CIDimension
                  label="Pokrycie zapytań"
                  score={12}
                  verdict="Krytycznie niskie — 0 z 5 kluczowych zapytań zaadresowanych"
                  detail="Strona nie odpowiada na żadne z 5 najczęstszych zapytań użytkowników w tej kategorii. Każde z tych zapytań generuje tysiące wyszukiwań miesięcznie w AI Search. Dodanie sekcji FAQ z odpowiedziami na te pytania to najszybszy sposób na zwiększenie szansy cytowania."
                />
              </div>
            </div>

            {/* Signal Rewrite CTA */}
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold mb-1">Signal Rewrite — gotowa treść w 60 sekund</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                    Na podstawie tego raportu Signal Rewrite wygeneruje nową wersję treści strony — z FAQ, faktami, strukturą zoptymalizowaną pod AI Search i gotowym kodem schema.org. Wynik jest gotowy do wdrożenia w 1 klik.
                  </p>
                  <Button className="gap-2 h-9 text-xs" onClick={() => window.location.href = "/pricing"}>
                    <Sparkles className="w-3.5 h-3.5" />
                    Odblokuj Signal Rewrite
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Bottom CTA ── */}
        <div className="mt-10 rounded-2xl border border-border/30 bg-card/40 p-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-5">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <h3 className="text-xl font-black mb-3 tracking-tight">
            Twoja strona może wyglądać inaczej.<br />
            <span className="gradient-text">Sprawdź swój wynik.</span>
          </h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto leading-relaxed">
            Wklej URL swojej podstrony — produktu, kategorii, artykułu. 60 sekund. Pełna diagnostyka AI Search. Bez konta, bez karty.
          </p>
          <Button size="lg" className="gap-2.5 px-10 h-12 text-base font-semibold shadow-xl shadow-primary/25" onClick={() => navigate("/")}>
            <Search className="w-4 h-4" />
            Analizuj swoją stronę
          </Button>
          <p className="text-xs text-muted-foreground mt-4">1 audyt bezpłatnie · bez rejestracji</p>
        </div>
      </div>
    </div>
  );
}
