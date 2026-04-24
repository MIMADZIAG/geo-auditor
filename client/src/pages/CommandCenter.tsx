import { type ElementType } from "react";
import { Link } from "wouter";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import type { EntityGroup, EntityPageSummary } from "@shared/entity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Activity,
  BarChart3,
  BellRing,
  Bot,
  Brain,
  Building2,
  ChevronRight,
  Database,
  FileText,
  Gauge,
  Globe,
  LayoutDashboard,
  Link2,
  LogIn,
  Network,
  Radar,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  TriangleAlert,
  Users,
  Workflow,
} from "lucide-react";

type PlanName = "free" | "starter" | "pro" | "business";

const PRODUCT_MODULES = [
  {
    title: "Entity Gap Analysis",
    description:
      "Zamiast pojedynczego URL-a porownujesz cala marke z konkurencja cytowana przez ChatGPT, Perplexity, Gemini i Google AI.",
    icon: Brain,
  },
  {
    title: "AI Share of Voice Tracker",
    description:
      "Cotygodniowe monitorowanie promptow, alerty o utracie cytowan i widok brand visibility na poziomie encji.",
    icon: Radar,
  },
  {
    title: "Tech SEO Action Center",
    description:
      "JSON-LD builder, semantic gap finder i deployment-ready rekomendacje dla contentu oraz danych strukturalnych.",
    icon: Sparkles,
  },
  {
    title: "Agency Revenue Layer",
    description:
      "White-label raporty, lead magnet embed i polaczenie wynikow GEO z GSC oraz GA4 dla zespolow klientowskich.",
    icon: Users,
  },
];

const ACTION_QUEUE = [
  {
    label: "JSON-LD pack",
    status: "Ready",
    impact: "High",
    description:
      "Wygeneruj Organization + SameAs + FAQ schema na podstawie cytowanych konkurentow i faktow o marce.",
  },
  {
    label: "Information gain diff",
    status: "Gap found",
    impact: "High",
    description:
      "Modele AI cytuja konkurencje, gdy zawiera tabele, parametry i jednoznaczne porownania - tego szuka extractor.",
  },
  {
    label: "Brand narrative refresh",
    status: "In review",
    impact: "Medium",
    description:
      "Ujednolic narracje w AI o marce: przewagi, proof points, verticals i encje wspierajace knowledge graph.",
  },
  {
    label: "White-label report",
    status: "Automate",
    impact: "MRR",
    description:
      "Przygotuj raport dla klienta lub zarzadu z SoV, utraconymi cytowaniami i lista wdrozen na kolejny sprint.",
  },
];

const MONETIZATION_CARDS = [
  {
    title: "White-label weekly reports",
    value: "Agency plan",
    description:
      "PDF z wlasnym logo, wykresami SoV i lista priorytetow do wdrozenia dla klienta.",
  },
  {
    title: "Lead magnet embed",
    value: "Pipeline",
    description:
      "Widget diagnostyczny do osadzenia na stronie agencji: szybki wynik dla domeny i capture leadow B2B.",
  },
  {
    title: "GA4 + GSC loop",
    value: "ROI proof",
    description:
      "Powiaz zmiany widocznosci w AI z ruchem, pipeline i konwersjami, zeby dowiezc case biznesowy dla CMO.",
  },
];

const ENGINE_RAILS = [
  {
    engine: "ChatGPT",
    share: 44,
    note: "brand recommendations",
    colorClass: "bg-emerald-400",
  },
  {
    engine: "Perplexity",
    share: 39,
    note: "citation-heavy answers",
    colorClass: "bg-cyan-400",
  },
  {
    engine: "Gemini",
    share: 31,
    note: "product comparisons",
    colorClass: "bg-violet-400",
  },
  {
    engine: "Google AI",
    share: 36,
    note: "overview snapshots",
    colorClass: "bg-blue-400",
  },
];

const DATA_MOAT_ITEMS = [
  {
    title: "Cache warstwa zapytan",
    value: "14 dni",
    description:
      "Powtarzane prompty sa serwowane z bazy wynikow, a nie za kazdym razem z drogich API.",
  },
  {
    title: "Cheap-model routing",
    value: "LLM tiering",
    description:
      "Tansze modele obsluguja parsowanie, klasyfikacje i enrich, drozsze sa rezerwowane dla insightow premium.",
  },
  {
    title: "Data moat",
    value: "Shared learning",
    description:
      "Kazde odswiezenie promptu wzbogaca baze benchmarkow o konkurentach, prompt clusters i AI response patterns.",
  },
];

function getHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] ?? url;
  }
}

function getRootDomain(hostname: string) {
  const clean = hostname.replace(/^www\./, "");
  const parts = clean.split(".");
  if (parts.length <= 2) return clean;
  return parts.slice(-2).join(".");
}

function toBrandName(domain: string) {
  const base = domain.split(".")[0] ?? domain;
  return base
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatPercent(value: number | null | undefined, fallback = 0) {
  const safeValue = value ?? fallback;
  return `${Math.round(safeValue)}%`;
}

function formatDateLabel(date: Date | null | undefined) {
  if (!date) return "brak odswiezenia";
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "dzisiaj";
  if (diffDays === 1) return "wczoraj";
  if (diffDays < 7) return `${diffDays} dni temu`;
  return new Date(date).toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "short",
  });
}

function planTone(plan: PlanName) {
  switch (plan) {
    case "business":
      return {
        label: "Business",
        className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
      };
    case "pro":
      return {
        label: "Pro",
        className: "border-violet-500/30 bg-violet-500/10 text-violet-300",
      };
    case "starter":
      return {
        label: "Starter",
        className: "border-blue-500/30 bg-blue-500/10 text-blue-300",
      };
    default:
      return {
        label: "Free",
        className: "border-border bg-muted/40 text-muted-foreground",
      };
  }
}

function sentimentTone(label: "positive" | "neutral" | "negative" | "modelled") {
  if (label === "positive") {
    return {
      label: "Pozytywny",
      className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    };
  }
  if (label === "negative") {
    return {
      label: "Ryzyko",
      className: "border-red-500/30 bg-red-500/10 text-red-300",
    };
  }
  if (label === "modelled") {
    return {
      label: "Modelowany",
      className: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    };
  }
  return {
    label: "Neutralny",
    className: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  };
}

function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 h-12 w-72 animate-pulse rounded-xl bg-muted/40" />
        <div className="grid gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-32 animate-pulse rounded-2xl border border-border/40 bg-card/50"
            />
          ))}
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <div className="h-[420px] animate-pulse rounded-2xl border border-border/40 bg-card/50" />
          <div className="h-[420px] animate-pulse rounded-2xl border border-border/40 bg-card/50" />
        </div>
      </div>
    </div>
  );
}

function UnauthenticatedPreview() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border/40 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight">GEO-Command</div>
              <div className="text-xs text-muted-foreground">
                Entity visibility intelligence for AI Search
              </div>
            </div>
          </div>
          <Button onClick={() => (window.location.href = getLoginUrl())} className="gap-2">
            <LogIn className="h-4 w-4" />
            Zaloguj i otworz command center
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <Card className="overflow-hidden border-border/50 bg-gradient-to-br from-card via-card to-primary/5">
          <CardHeader className="space-y-4">
            <Badge className="w-fit border-primary/30 bg-primary/10 text-primary">
              GEO-Command preview
            </Badge>
            <div className="max-w-3xl space-y-3">
              <CardTitle className="text-3xl font-black tracking-tight sm:text-4xl">
                Zarzadzaj widocznoscia encji i Share of Voice w AI z jednego miejsca.
              </CardTitle>
              <CardDescription className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Ten widok przestawia produkt z jednorazowego audytu URL-a na platforme B2B
                dla marek i agencji: monitoring promptow, analiza konkurencji, techniczne
                deploymenty i raportowanie dla klienta.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => (window.location.href = getLoginUrl())} className="gap-2">
                <LogIn className="h-4 w-4" />
                Wejdz do dashboardu
              </Button>
              <Link href="/">
                <Button variant="outline" className="gap-2">
                  <Search className="h-4 w-4" />
                  Wroc do quick scan
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {PRODUCT_MODULES.map((module) => (
              <div
                key={module.title}
                className="rounded-2xl border border-border/50 bg-background/60 p-4"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <module.icon className="h-5 w-5" />
                </div>
                <div className="mb-1 text-sm font-semibold">{module.title}</div>
                <div className="text-xs leading-5 text-muted-foreground">{module.description}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EntityCard({ entity }: { entity: EntityGroup }) {
  const representative = entity.representative ?? entity.pages[0];
  const canQueryEntity = Boolean(representative && representative.id > 0);
  const benchmarkQuery = trpc.monitoring.getCompetitorBenchmark.useQuery(
    { monitoredPageId: representative?.id ?? 0 },
    { staleTime: 60_000, enabled: canQueryEntity }
  );
  const sentimentQuery = trpc.monitoring.getSentimentDashboard.useQuery(
    { monitoredPageId: representative?.id ?? 0 },
    { staleTime: 60_000, enabled: canQueryEntity }
  );
  const phraseCoverageQuery = trpc.monitoring.getPhraseCoverage.useQuery(
    { monitoredPageId: representative?.id ?? 0 },
    { staleTime: 60_000, enabled: canQueryEntity }
  );

  const liveShareOfVoice = benchmarkQuery.data?.shareOfVoice;
  const modelledShareOfVoice =
    entity.coverageRate != null
      ? Math.max(18, Math.min(92, Math.round(entity.coverageRate * 0.9)))
      : 32;
  const shareOfVoice = liveShareOfVoice != null
    ? Math.round(liveShareOfVoice * 100)
    : modelledShareOfVoice;

  const liveSentiment = sentimentQuery.data?.sentimentLabel ?? null;
  const sentiment = sentimentTone(liveSentiment ?? "modelled");
  const topCompetitors =
    benchmarkQuery.data?.topCompetitorDomains?.slice(0, 3).map((item) => item.domain) ??
    ["benchmark in progress", "collecting competitors"];
  const themes =
    sentimentQuery.data?.themes?.slice(0, 3) ??
    [
      "entity authority",
      "commercial prompts",
      "knowledge graph completeness",
    ];
  const phraseTotal = phraseCoverageQuery.data?.total ?? entity.promptEstimate;
  const phraseCited =
    phraseCoverageQuery.data?.cited ??
    Math.max(1, Math.round((phraseTotal * shareOfVoice) / 100));

  const actionLine =
    shareOfVoice < 30
      ? "Priorytet: uruchom gap analysis i schema deployment dla promptow z niska cytowalnoscia."
      : shareOfVoice < 55
        ? "Priorytet: rozbuduj info gain oraz proof points, zeby przejac prompty porownawcze."
        : "Priorytet: utrzymaj momentum i rozszerz monitoring o kolejne prompt clusters.";

  return (
    <Card className="border-border/50 bg-card/70">
      <CardHeader className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">{entity.brandName}</CardTitle>
                <CardDescription className="text-xs">{entity.domain}</CardDescription>
              </div>
            </div>
          </div>
          <Badge className={sentiment.className}>{sentiment.label}</Badge>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border/40 bg-background/60 p-3">
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Share of Voice
            </div>
            <div className="mt-2 text-2xl font-black">{shareOfVoice}%</div>
            <div className="mt-1 text-xs text-muted-foreground">
              latest AI visibility benchmark
            </div>
          </div>
          <div className="rounded-xl border border-border/40 bg-background/60 p-3">
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Prompt coverage
            </div>
            <div className="mt-2 text-2xl font-black">
              {phraseCited}/{phraseTotal}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              promptow z ostatniego monitoringu
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border/40 bg-background/50 p-3">
            <div className="mb-1 text-xs font-medium text-muted-foreground">
              Encja i assety
            </div>
            <div className="text-sm font-semibold">
              {entity.pages.length} monitorowanych assetow
            </div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">
              Ostatnie odswiezenie:{" "}
              {formatDateLabel(
                representative?.lastCitationAt ?? representative?.lastAuditAt
              )}
            </div>
          </div>
          <div className="rounded-xl border border-border/40 bg-background/50 p-3">
            <div className="mb-1 text-xs font-medium text-muted-foreground">
              Top competitor
            </div>
            <div className="text-sm font-semibold">{topCompetitors[0] ?? "collecting data"}</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">
              Porownanie oparte o ostatnie cytowania i snapshot visibility.
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Dlaczego AI cytuje innych
          </div>
          <div className="flex flex-wrap gap-2">
            {themes.map((theme) => (
              <Badge key={theme} variant="secondary" className="bg-muted/60 text-foreground">
                {theme}
              </Badge>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <div>
              <div className="text-sm font-semibold text-amber-100">Nastepna akcja</div>
              <div className="mt-1 text-xs leading-5 text-amber-100/75">{actionLine}</div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {topCompetitors.map((competitor) => (
            <Badge key={competitor} variant="outline" className="border-border/50">
              {competitor}
            </Badge>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/ai-monitoring">
            <Button size="sm" className="gap-2">
              <Radar className="h-4 w-4" />
              Otworz tracker
            </Button>
          </Link>
          <Link href="/audit">
            <Button size="sm" variant="outline" className="gap-2">
              <Sparkles className="h-4 w-4" />
              Przejdz do audytu
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CommandCenter() {
  const { user, loading: authLoading, isAuthenticated, logout } = useAuth();

  const entityPortfolioQuery = trpc.entity.portfolio.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const planQuery = trpc.payments.getMyPlan.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const portfolio = entityPortfolioQuery.data;
  const entities = portfolio?.entities ?? [];
  const summary = portfolio?.summary;
  const priorityEntities = entities.slice(0, 4);
  const plan = (planQuery.data?.plan ?? "free") as PlanName;
  const planBadge = planTone(plan);
  const avgReadiness = summary?.avgReadinessScore ?? 58;
  const avgCoverage = summary?.avgCoverageRate ?? 34;
  const promptFootprint = summary?.totalPrompts ?? 96;
  const activeAlerts = summary?.activeAlertEntities ?? 4;
  const totalPages = summary?.totalPages ?? entities.reduce((sum, entity) => sum + entity.pages.length, 0);
  const momentumScore = avgCoverage >= 50 ? 12 : avgCoverage >= 35 ? 6 : 2;

  const focusEntity = priorityEntities[0];
  const focusName = focusEntity?.brandName ?? "Twoja marka";
  const focusDomain = focusEntity?.domain ?? "twojamarka.pl";
  const gapRows = [
    {
      prompt: `najlepsze alternatywy dla ${focusName.toLowerCase()}`,
      explanation:
        "Konkurencja dostarcza porownania, tabele parametrow i jednoznaczne use cases w sekcji FAQ.",
      action: "Dodaj comparison block + FAQ schema + proof points.",
    },
    {
      prompt: `ranking ${focusName.toLowerCase()} i konkurencji`,
      explanation:
        "Modele AI preferuja strony z aktualnymi benchmarkami i jasno nazwanymi segmentami produktowymi.",
      action: "Wdrozenie info gain extractor oraz quarterly benchmark pages.",
    },
    {
      prompt: `${focusName.toLowerCase()} opinie b2b`,
      explanation:
        "LLM szukaja reputacyjnych encji: case studies, sameAs links, autorzy i sygnaly zrodla.",
      action: "Ujednolic SameAs, Organization schema i sekcje trust assets.",
    },
  ];

  if (authLoading || entityPortfolioQuery.isLoading) return <DashboardSkeleton />;
  if (!isAuthenticated) return <UnauthenticatedPreview />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border/40 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight">GEO-Command</div>
              <div className="text-xs text-muted-foreground">
                Entity visibility management for AI Search
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge className={planBadge.className}>{planBadge.label}</Badge>
            <Link href="/">
              <Button variant="outline" size="sm" className="gap-2">
                <Search className="h-4 w-4" />
                Quick scan
              </Button>
            </Link>
            <Button variant="ghost" size="sm" className="gap-2" onClick={logout}>
              <LogIn className="h-4 w-4 rotate-180" />
              Wyloguj
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:px-8">
        <aside className="space-y-4 lg:sticky lg:top-24 lg:h-fit">
          <Card className="border-border/50 bg-card/70">
            <CardHeader className="space-y-3">
              <Badge className="w-fit border-primary/30 bg-primary/10 text-primary">
                Command Center
              </Badge>
              <CardTitle className="text-lg">
                Platforma do zarzadzania widocznoscia encji w AI
              </CardTitle>
              <CardDescription className="text-sm leading-6">
                Zamiast jednorazowego skanu URL-a masz portfolio marek, promptow, action
                items i revenue workflows dla agencji.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { icon: LayoutDashboard, label: "Entity command" },
                { icon: Radar, label: "AI SoV tracker" },
                { icon: Sparkles, label: "Tech SEO deployments" },
                { icon: FileText, label: "White-label reporting" },
                { icon: Database, label: "Data moat" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-2 rounded-xl border border-border/40 bg-background/40 px-3 py-2.5 text-sm"
                >
                  <item.icon className="h-4 w-4 text-primary" />
                  <span>{item.label}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/70">
            <CardHeader>
              <CardTitle className="text-base">Co sprzedajesz klientowi</CardTitle>
              <CardDescription>
                Raportuj utracone cytowania, wdrozenia i wzrost SoV zamiast samego score URL-a.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <BellRing className="mt-0.5 h-4 w-4 text-amber-300" />
                Alerty o spadkach z ChatGPT i Google AI
              </div>
              <div className="flex items-start gap-2">
                <Workflow className="mt-0.5 h-4 w-4 text-violet-300" />
                Action queue dla dev, content i SEO
              </div>
              <div className="flex items-start gap-2">
                <Users className="mt-0.5 h-4 w-4 text-emerald-300" />
                White-label delivery dla agencji
              </div>
            </CardContent>
          </Card>
        </aside>

        <main className="space-y-6">
          <Card className="overflow-hidden border-border/50 bg-gradient-to-br from-card via-card to-primary/5">
            <CardHeader className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-primary/30 bg-primary/10 text-primary">
                  Entity-first dashboard
                </Badge>
                <Badge variant="secondary" className="bg-muted/60">
                  B2B SaaS direction
                </Badge>
              </div>

              <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-3xl space-y-3">
                  <CardTitle className="text-3xl font-black tracking-tight sm:text-4xl">
                    {user?.name ? `${user.name.split(" ")[0]},` : "GEO team,"} zarzadzasz juz nie
                    audytem URL-a, tylko pozycja marki w AI.
                  </CardTitle>
                  <CardDescription className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                    GEO-Command spina Entity Gap Analysis, monitoring Share of Voice,
                    deploymenty technicznego SEO i reporting agency-ready w jednym hubie.
                    To warstwa operacyjna dla marek, ktore chca kontrolowac, jak modele AI
                    odpowiadaja na pytania o ich kategorie.
                  </CardDescription>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link href="/ai-monitoring">
                    <Button className="gap-2">
                      <Radar className="h-4 w-4" />
                      Otworz AI tracker
                    </Button>
                  </Link>
                  <Link href="/audit">
                    <Button variant="outline" className="gap-2">
                      <ShieldCheck className="h-4 w-4" />
                      Uruchom techniczny audit
                    </Button>
                  </Link>
                </div>
              </div>
            </CardHeader>

            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Monitorowane encje"
                value={String(entities.length || 6)}
                description="brand clusters i reprezentowane domeny"
                icon={Building2}
              />
              <MetricCard
                label="Prompt footprint"
                value={String(promptFootprint)}
                description="aktywnych promptow w warstwie trackera"
                icon={Target}
              />
              <MetricCard
                label="Portfolio AI SoV"
                value={formatPercent(avgCoverage, 34)}
                description="srednia widocznosc na ostatnich cytowaniach"
                icon={BarChart3}
              />
              <MetricCard
                label="Execution alerts"
                value={String(activeAlerts)}
                description="spadki, luki semantyczne, brak cytowan"
                icon={BellRing}
              />
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
            <Card className="border-border/50 bg-card/70">
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg">Architektura nowego produktu</CardTitle>
                    <CardDescription>
                      Cztery warstwy, ktore zmieniaja narzedzie z vitamin tool na platforme
                      operacyjna dla AI Search.
                    </CardDescription>
                  </div>
                  <Badge className="border-violet-500/30 bg-violet-500/10 text-violet-200">
                    product rebuild
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                {PRODUCT_MODULES.map((module) => (
                  <div
                    key={module.title}
                    className="rounded-2xl border border-border/40 bg-background/50 p-4"
                  >
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <module.icon className="h-5 w-5" />
                    </div>
                    <div className="mb-1 text-sm font-semibold">{module.title}</div>
                    <div className="text-xs leading-5 text-muted-foreground">
                      {module.description}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/70">
              <CardHeader>
                <CardTitle className="text-lg">Health of account</CardTitle>
                <CardDescription>
                  Operacyjny snapshot konta po przesunieciu produktu na monitoring encji.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <StatusRow
                  icon={Gauge}
                  label="Sredni readiness"
                  value={`${avgReadiness}/100`}
                  note="warstwa techniczna + content"
                />
                <StatusRow
                  icon={TrendingUp}
                  label="Momentum"
                  value={`${momentumScore >= 0 ? "+" : ""}${momentumScore}`}
                  note="zmiana wzgledem poprzedniego audytu"
                />
                <StatusRow
                  icon={Activity}
                  label="Ostatnie assety"
                  value={String(totalPages || 3)}
                  note="monitorowane strony i sekcje marki"
                />
                <StatusRow
                  icon={Network}
                  label="Knowledge graph"
                  value={entities.length > 0 ? "aktywny" : "bootstrap"}
                  note={`glowna encja: ${focusDomain}`}
                />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
            <Card className="border-border/50 bg-card/70">
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg">Entity Gap Analysis</CardTitle>
                    <CardDescription>
                      Priorytetowe prompty i powody, dla ktorych konkurencja trafia do odpowiedzi
                      AI szybciej niz Twoja marka.
                    </CardDescription>
                  </div>
                  <Badge variant="secondary" className="bg-muted/60">
                    focus: {focusName}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {gapRows.map((row) => (
                  <div
                    key={row.prompt}
                    className="rounded-2xl border border-border/40 bg-background/50 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="border-primary/30 bg-primary/10 text-primary">
                        prompt
                      </Badge>
                      <div className="text-sm font-semibold">{row.prompt}</div>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
                      <p className="text-xs leading-5 text-muted-foreground">{row.explanation}</p>
                      <div className="flex flex-wrap gap-2">
                        {["ChatGPT", "Perplexity", "Gemini", "Google AI"].map((engine) => (
                          <Badge key={engine} variant="outline" className="border-border/50">
                            {engine}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-100/90">
                      <span className="font-semibold">Recommended action:</span> {row.action}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/70">
              <CardHeader>
                <CardTitle className="text-lg">Action center</CardTitle>
                <CardDescription>
                  Moduly, ktore zamieniaja insight w kod, raport lub task dla zespolu.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {ACTION_QUEUE.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-border/40 bg-background/50 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold">{item.label}</div>
                      <div className="flex gap-2">
                        <Badge variant="outline">{item.status}</Badge>
                        <Badge className="border-primary/30 bg-primary/10 text-primary">
                          {item.impact}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-2 text-xs leading-5 text-muted-foreground">
                      {item.description}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
            <Card className="border-border/50 bg-card/70">
              <CardHeader>
                <CardTitle className="text-lg">AI SERP tracker</CardTitle>
                <CardDescription>
                  Ciagly monitoring glownych silnikow AI wymusza retencje i zamienia audit w
                  recurring workflow.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {ENGINE_RAILS.map((engine) => (
                  <div key={engine.engine} className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">{engine.engine}</div>
                        <div className="text-xs text-muted-foreground">{engine.note}</div>
                      </div>
                      <div className="text-sm font-semibold">{engine.share}% coverage</div>
                    </div>
                    <div className="h-2 rounded-full bg-muted/60">
                      <div
                        className={`h-2 rounded-full ${engine.colorClass}`}
                        style={{ width: `${engine.share}%` }}
                      />
                    </div>
                  </div>
                ))}

                <Separator className="bg-border/40" />

                <div className="grid gap-3 md:grid-cols-3">
                  <TrackerInfoCard
                    icon={BellRing}
                    title="Alerting"
                    description="Slack i e-mail, gdy marka wypada z promptow strategicznych."
                  />
                  <TrackerInfoCard
                    icon={Globe}
                    title="Prompt library"
                    description="50-500 zapytan na brand, category, comparison i local intent."
                  />
                  <TrackerInfoCard
                    icon={Workflow}
                    title="Weekly operating cadence"
                    description="Raport do klienta lub growth teamu z diffem wzgledem poprzedniego tygodnia."
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/70">
              <CardHeader>
                <CardTitle className="text-lg">Agency OS</CardTitle>
                <CardDescription>
                  Warstwa monetyzacji i dystrybucji skierowana do agencji oraz enterprise.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {MONETIZATION_CARDS.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-2xl border border-border/40 bg-background/50 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold">{item.title}</div>
                      <Badge variant="secondary" className="bg-muted/60">
                        {item.value}
                      </Badge>
                    </div>
                    <div className="mt-2 text-xs leading-5 text-muted-foreground">
                      {item.description}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
            <Card className="border-border/50 bg-card/70">
              <CardHeader>
                <CardTitle className="text-lg">Priority entity portfolio</CardTitle>
                <CardDescription>
                  Najwazniejsze encje do obrony lub rozbudowy w AI Search. Widok oparty o
                  monitoring, snapshoty SoV i sentiment.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-2">
                {(priorityEntities.length > 0 ? priorityEntities : [{
                  entityKey: "twojamarka.pl",
                  domain: "twojamarka.pl",
                  brandName: "Twoja Marka",
                  representativePageId: 0,
                  representative: {
                    id: 0,
                    url: "https://twojamarka.pl",
                    label: "Brand root",
                    lastScore: 58,
                    lastAuditAt: null,
                    lastCitationAt: null,
                    lastCitedEngines: 1,
                    lastTotalEngines: 4,
                    scheduleFrequency: 7,
                  } satisfies EntityPageSummary,
                  pages: [{
                    id: 0,
                    url: "https://twojamarka.pl",
                    label: "Brand root",
                    lastScore: 58,
                    lastAuditAt: null,
                    lastCitationAt: null,
                    lastCitedEngines: 1,
                    lastTotalEngines: 4,
                    scheduleFrequency: 7,
                  } satisfies EntityPageSummary],
                  avgScore: 58,
                  avgReadinessScore: 58,
                  avgVisibilityScore: 24,
                  coverageRate: 25,
                  promptEstimate: 14,
                  promptCount: 14,
                  citedPromptCount: 3,
                  shareOfVoice: 24,
                  topCompetitors: ["benchmark in progress"],
                  topThemes: ["entity authority", "commercial prompts"],
                  sentimentLabel: "modelled",
                  sentimentScore: null,
                  priorityAction: "Dodaj comparison block + FAQ schema + proof points.",
                  activeAlerts: 1,
                  dataSource: "fallback",
                  lastUpdatedAt: null,
                } satisfies EntityGroup]).map((entity) => (
                  <EntityCard key={entity.domain} entity={entity} />
                ))}
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/70">
              <CardHeader>
                <CardTitle className="text-lg">Unit economics</CardTitle>
                <CardDescription>
                  Przewaga produktowa nie moze opierac sie na najdrozszych modelach i ciaglym
                  ponawianiu tych samych zapytan.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {DATA_MOAT_ITEMS.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-2xl border border-border/40 bg-background/50 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold">{item.title}</div>
                      <Badge variant="outline">{item.value}</Badge>
                    </div>
                    <div className="mt-2 text-xs leading-5 text-muted-foreground">
                      {item.description}
                    </div>
                  </div>
                ))}

                <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4">
                  <div className="flex items-start gap-3">
                    <Database className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div>
                      <div className="text-sm font-semibold">Data moat roadmap</div>
                      <div className="mt-1 text-xs leading-5 text-primary/85">
                        Cache promptow, normalizacja konkurentow i wspolna baza odpowiedzi AI to
                        warstwa, ktora jednoczesnie poprawia marze i jakosc benchmarku.
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/50 bg-card/70">
            <CardHeader>
              <CardTitle className="text-lg">Integracje i executive narrative</CardTitle>
              <CardDescription>
                Ten kierunek produktu zamyka petle: visibility - deployment - reporting - ROI.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <IntegrationCard
                icon={Link2}
                title="GA4 + GSC connectors"
                description="Pokazujesz, jak zmiana widocznosci w AI przeklada sie na ruch, assisted conversions i pipeline."
              />
              <IntegrationCard
                icon={ShieldCheck}
                title="Brand protection"
                description="Kontrolujesz, czy modele AI rozumieja marke poprawnie, bez spadku sentymentu lub utraty top promptow."
              />
              <IntegrationCard
                icon={Brain}
                title="Executive scorecard"
                description="CMO widzi nie tylko wynik audytu, ale tez SoV, ryzyka i backlog wdrozen gotowy na sprint lub raport klienta."
              />
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  description,
  icon: Icon,
}: {
  label: string;
  value: string;
  description: string;
  icon: ElementType;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-background/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {label}
          </div>
          <div className="mt-3 text-3xl font-black tracking-tight">{value}</div>
          <div className="mt-2 text-xs leading-5 text-muted-foreground">{description}</div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function StatusRow({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: ElementType;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-background/50 p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs text-muted-foreground">{note}</div>
        </div>
      </div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function TrackerInfoCard({
  icon: Icon,
  title,
  description,
}: {
  icon: ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-background/50 p-4">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="mb-1 text-sm font-semibold">{title}</div>
      <div className="text-xs leading-5 text-muted-foreground">{description}</div>
    </div>
  );
}

function IntegrationCard({
  icon: Icon,
  title,
  description,
}: {
  icon: ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-background/50 p-4">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="mb-1 text-sm font-semibold">{title}</div>
      <div className="text-xs leading-5 text-muted-foreground">{description}</div>
      <div className="mt-4 flex items-center gap-1 text-xs font-medium text-primary">
        Explore module <ChevronRight className="h-3.5 w-3.5" />
      </div>
    </div>
  );
}
