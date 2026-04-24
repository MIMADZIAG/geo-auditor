import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowRight,
  BarChart3,
  BellRing,
  Bot,
  Building2,
  CheckCircle2,
  Compass,
  Eye,
  LayoutDashboard,
  Radar,
  Search,
  Sparkles,
  Target,
  Workflow,
} from "lucide-react";

const COMMAND_CENTER_METRICS = [
  { label: "Monitorowane encje", value: "6", note: "brand clusters i reprezentowane domeny" },
  { label: "Prompt footprint", value: "124", note: "aktywnych promptow w warstwie trackera" },
  { label: "Portfolio AI SoV", value: "41%", note: "srednia widocznosc na ostatnich cytowaniach" },
  { label: "Execution alerts", value: "8", note: "spadki, luki semantyczne, brak cytowan" },
];

const PROMPT_LIBRARY = [
  { prompt: "najlepsze laptopy dla graczy od x-kom", category: "commercial", source: "user_added", syncedAssets: 3 },
  { prompt: "x-kom vs morele laptopy gamingowe", category: "comparison", source: "onboarding", syncedAssets: 2 },
  { prompt: "opinie o x-kom dla firm", category: "trust", source: "suggested", syncedAssets: 1 },
];

const CONNECTED_ASSETS = [
  { title: "Homepage", url: "https://x-kom.pl", score: "72", cited: "3/4" },
  { title: "Category page", url: "https://x-kom.pl/laptopy-i-komputery/laptopy", score: "68", cited: "2/4" },
  { title: "Comparison / editorial", url: "https://x-kom.pl/blog/jaki-laptop-do-gier", score: "61", cited: "1/4" },
];

const ACTION_ITEMS = [
  "Brakuje comparison table na assetach category i blog.",
  "FAQ schema nie wspiera promptow how-to i comparison.",
  "Trust / reputation klaster ma zbyt malo dedykowanych assetow.",
];

export default function Preview() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border/40 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight">GEO-Command Preview</div>
              <div className="text-xs text-muted-foreground">
                Stabilny ekran podgladu bez logowania i bez danych z produkcji
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/">
              <Button variant="outline" size="sm" className="gap-2">
                <Search className="h-4 w-4" />
                Home
              </Button>
            </Link>
            <Link href="/hub">
              <Button size="sm" className="gap-2">
                <LayoutDashboard className="h-4 w-4" />
                Zobacz /hub
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Card className="border-border/50 bg-gradient-to-br from-card via-card to-primary/5">
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-primary/30 bg-primary/10 text-primary">
                /preview
              </Badge>
              <Badge variant="secondary">bez logowania</Badge>
              <Badge variant="secondary">seeded data</Badge>
            </div>
            <div className="max-w-3xl space-y-3">
              <CardTitle className="text-3xl font-black tracking-tight sm:text-4xl">
                To jest najprostsze miejsce do sprawdzania postepow frontendu.
              </CardTitle>
              <CardDescription className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Ekran preview pokazuje reprezentatywne widoki produktu na przykladowych
                danych. Dzieki temu nie musisz logowac sie ani czekac na konkretne dane,
                zeby zobaczyc jak aplikacja aktualnie wyglada.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-border/40 bg-background/50 p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Compass className="h-4 w-4 text-primary" />
                Jak korzystac z preview
              </div>
              <ol className="space-y-3 text-sm text-muted-foreground">
                <li className="flex gap-3">
                  <span className="font-semibold text-foreground">1.</span>
                  Otworz podglad portu 3000 w swoim srodowisku Cursor / Cloud.
                </li>
                <li className="flex gap-3">
                  <span className="font-semibold text-foreground">2.</span>
                  W adresie dopisz <span className="font-mono text-foreground">/preview</span>.
                </li>
                <li className="flex gap-3">
                  <span className="font-semibold text-foreground">3.</span>
                  Odswiezaj strone po moich wiekszych zmianach, a zobaczysz aktualny stan UI.
                </li>
                <li className="flex gap-3">
                  <span className="font-semibold text-foreground">4.</span>
                  Gdy chcesz wejsc glebiej, kliknij przyciski i przejdz do realnych route'ow aplikacji.
                </li>
              </ol>
            </div>
            <div className="rounded-2xl border border-border/40 bg-background/50 p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                Co tutaj zobaczysz
              </div>
              <div className="space-y-3 text-sm text-muted-foreground">
                <PreviewLine icon={LayoutDashboard} text="GEO-Command command center" />
                <PreviewLine icon={Building2} text="Entity workspace detail page" />
                <PreviewLine icon={Target} text="Prompt library i connected assets" />
                <PreviewLine icon={Radar} text="Monitoring i execution layer" />
                <PreviewLine icon={Sparkles} text="Strategiczne i wdrozeniowe sekcje produktu" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="command-center" className="mt-6">
          <TabsList>
            <TabsTrigger value="command-center">Command Center</TabsTrigger>
            <TabsTrigger value="entity-workspace">Entity Workspace</TabsTrigger>
            <TabsTrigger value="preview-flow">Jak sprawdzac</TabsTrigger>
          </TabsList>

          <TabsContent value="command-center">
            <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
              <Card className="border-border/50 bg-card/70">
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <CardTitle className="text-lg">Preview: GEO-Command /hub</CardTitle>
                      <CardDescription>
                        Reprezentatywny widok command center na danych seedowanych.
                      </CardDescription>
                    </div>
                    <Link href="/hub">
                      <Button size="sm" className="gap-2">
                        Otworz realny /hub <ArrowRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {COMMAND_CENTER_METRICS.map((metric) => (
                      <PreviewMetricCard key={metric.label} {...metric} />
                    ))}
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <PreviewPanel
                      icon={BarChart3}
                      title="Entity Gap Analysis"
                      items={[
                        "Comparison cluster ma wysoki potencjal, ale brak owned assetu.",
                        "Prompty trust / reputation nie maja dedykowanego contentu.",
                        "Kategoria transactional ma za niski poziom coverage.",
                      ]}
                    />
                    <PreviewPanel
                      icon={Workflow}
                      title="Action Center"
                      items={[
                        "Dodaj comparison table na category page.",
                        "Wzmocnij FAQ / trust sections na homepage.",
                        "Zbuduj asset pod prompt cluster: problem-solving.",
                      ]}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/50 bg-card/70">
                <CardHeader>
                  <CardTitle className="text-lg">Preview checklist</CardTitle>
                  <CardDescription>
                    Co sprawdzac po kazdej wiekszej zmianie UI.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <PreviewLine icon={Eye} text="Czy hierarchia i spacing sa czytelne" />
                  <PreviewLine icon={BellRing} text="Czy karty KPI sa zrozumiale bez tlumaczenia" />
                  <PreviewLine icon={Radar} text="Czy prompt / SoV / monitoring sa widoczne od razu" />
                  <PreviewLine icon={Sparkles} text="Czy produkt wyglada jak system operacyjny, nie raport" />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="entity-workspace">
            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <Card className="border-border/50 bg-card/70">
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <CardTitle className="text-lg">Preview: Entity Workspace</CardTitle>
                      <CardDescription>
                        Widok encji z prompt library, watchlista konkurentow i connected assets.
                      </CardDescription>
                    </div>
                    <Link href="/hub/entity/x-kom.pl">
                      <Button size="sm" className="gap-2">
                        Otworz realny route <ArrowRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-4">
                    <PreviewMetricCard label="Share of Voice" value="47%" note="agregat portfolio encji" />
                    <PreviewMetricCard label="Prompt library" value="18" note="aktywnych promptow encji" />
                    <PreviewMetricCard label="Coverage" value="39%" note="ile promptow ma cytowania" />
                    <PreviewMetricCard label="Competitors" value="4" note="watchlista encji" />
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-border/40 bg-background/50 p-4">
                      <div className="mb-3 text-sm font-semibold">Prompt library</div>
                      <div className="space-y-3">
                        {PROMPT_LIBRARY.map((prompt) => (
                          <div key={prompt.prompt} className="rounded-xl border border-border/40 bg-background/60 p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="secondary">{prompt.category}</Badge>
                              <Badge variant="outline">{prompt.source}</Badge>
                            </div>
                            <div className="mt-2 text-sm font-medium">{prompt.prompt}</div>
                            <div className="mt-2 text-xs text-muted-foreground">
                              Synced assets: {prompt.syncedAssets}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border/40 bg-background/50 p-4">
                      <div className="mb-3 text-sm font-semibold">Connected assets</div>
                      <div className="space-y-3">
                        {CONNECTED_ASSETS.map((asset) => (
                          <div key={asset.url} className="rounded-xl border border-border/40 bg-background/60 p-3">
                            <div className="text-sm font-medium">{asset.title}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{asset.url}</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Badge variant="outline">score {asset.score}</Badge>
                              <Badge variant="outline">cited {asset.cited}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/50 bg-card/70">
                <CardHeader>
                  <CardTitle className="text-lg">Co oceniac tutaj</CardTitle>
                  <CardDescription>
                    Najwazniejsze rzeczy przy podgladzie entity detail page.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  {ACTION_ITEMS.map((item) => (
                    <div key={item} className="rounded-xl border border-border/40 bg-background/50 p-3">
                      {item}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="preview-flow">
            <Card className="border-border/50 bg-card/70">
              <CardHeader>
                <CardTitle className="text-lg">Najprostsza droga, krok po kroku</CardTitle>
                <CardDescription>
                  Instrukcja dla osoby nietechnicznej, jak uruchomic i sprawdzac preview.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <StepRow
                  step="1"
                  title="Znajdz preview portu 3000"
                  body="W swoim panelu Cloud / Cursor poszukaj sekcji z portami albo browser preview. Interesuje Cie port 3000."
                />
                <StepRow
                  step="2"
                  title="Otworz aplikacje w przegladarce"
                  body="Po kliknieciu portu 3000 otworzy sie frontend. Jezeli widzisz strone glowne, wszystko dziala."
                />
                <StepRow
                  step="3"
                  title="Dopisz /preview"
                  body="W pasku adresu dopisz na koncu /preview i zatwierdz Enterem. To jest stabilny ekran podgladu."
                />
                <StepRow
                  step="4"
                  title="Odswiezaj po moich zmianach"
                  body="Gdy napisze Ci, ze zakonczylem wiekszy krok, po prostu odswiez /preview. Zobaczysz aktualny wyglad bez logowania i bez danych produkcyjnych."
                />
                <StepRow
                  step="5"
                  title="Gdy chcesz zejsc glebiej"
                  body="Z /preview mozesz przejsc do /hub albo /hub/entity/x-kom.pl i sprawdzic realne route'y aplikacji."
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function PreviewMetricCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-background/50 p-4">
      <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-3 text-3xl font-black">{value}</div>
      <div className="mt-2 text-xs text-muted-foreground">{note}</div>
    </div>
  );
}

function PreviewPanel({
  icon: Icon,
  title,
  items,
}: {
  icon: typeof BarChart3;
  title: string;
  items: string[];
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-background/50 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item} className="rounded-xl border border-border/40 bg-background/60 p-3 text-sm text-muted-foreground">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewLine({
  icon: Icon,
  text,
}: {
  icon: typeof Search;
  text: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 text-primary" />
      <span>{text}</span>
    </div>
  );
}

function StepRow({
  step,
  title,
  body,
}: {
  step: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-4 rounded-2xl border border-border/40 bg-background/50 p-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
        {step}
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="mt-1 text-sm text-muted-foreground">{body}</div>
      </div>
    </div>
  );
}
