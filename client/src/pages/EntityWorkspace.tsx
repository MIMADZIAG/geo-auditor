import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import type { EntityWorkspaceCompetitor, EntityWorkspacePrompt } from "@shared/entity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowLeft,
  BarChart3,
  Bot,
  Building2,
  Compass,
  Loader2,
  Plus,
  Radar,
  Sparkles,
  Target,
  Trash2,
  TriangleAlert,
} from "lucide-react";

function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number") return "0%";
  return `${Math.round(value)}%`;
}

function promptStatusTone(prompt: EntityWorkspacePrompt) {
  if (!prompt.isActive) return "border-border bg-muted/40 text-muted-foreground";
  if (prompt.category === "high") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (prompt.category === "medium") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  return "border-blue-500/30 bg-blue-500/10 text-blue-300";
}

function promptIntentLabel(prompt: EntityWorkspacePrompt) {
  return prompt.intentType?.replace(/_/g, " ") ?? "brand";
}

export default function EntityWorkspace() {
  const { isAuthenticated } = useAuth();
  const params = useParams<{ domain: string }>();
  const domain = decodeURIComponent(params.domain ?? "");
  const utils = trpc.useUtils();

  const [promptText, setPromptText] = useState("");
  const [promptIntent, setPromptIntent] = useState<
    "informational" | "navigational" | "commercial" | "transactional" | "comparative"
  >("commercial");
  const [competitorDomain, setCompetitorDomain] = useState("");
  const [competitorLabel, setCompetitorLabel] = useState("");

  const workspaceQuery = trpc.entity.workspace.useQuery(
    { domain },
    { enabled: isAuthenticated && domain.length > 0 }
  );

  const addPrompt = trpc.entity.addPrompt.useMutation({
    onSuccess: async () => {
      setPromptText("");
      await utils.entity.workspace.invalidate({ domain });
      await utils.entity.portfolio.invalidate();
      toast.success("Prompt dodany do biblioteki encji.");
    },
    onError: (error) => toast.error(error.message),
  });

  const togglePrompt = trpc.entity.togglePrompt.useMutation({
    onSuccess: async () => {
      await utils.entity.workspace.invalidate({ domain });
      await utils.entity.portfolio.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const deletePrompt = trpc.entity.deletePrompt.useMutation({
    onSuccess: async () => {
      await utils.entity.workspace.invalidate({ domain });
      await utils.entity.portfolio.invalidate();
      toast.success("Prompt usunięty.");
    },
    onError: (error) => toast.error(error.message),
  });

  const addCompetitor = trpc.entity.addCompetitor.useMutation({
    onSuccess: async () => {
      setCompetitorDomain("");
      setCompetitorLabel("");
      await utils.entity.workspace.invalidate({ domain });
      toast.success("Konkurent dodany do watchlisty.");
    },
    onError: (error) => toast.error(error.message),
  });

  const removeCompetitor = trpc.entity.removeCompetitor.useMutation({
    onSuccess: async () => {
      await utils.entity.workspace.invalidate({ domain });
      toast.success("Konkurent usunięty.");
    },
    onError: (error) => toast.error(error.message),
  });

  const data = workspaceQuery.data?.workspace;
  const workspace = data?.workspace;
  const portfolio = data?.portfolio;
  const prompts = data?.prompts ?? [];
  const competitors = data?.competitors ?? [];
  const pages = data?.linkedPages ?? [];

  const activePromptCount = prompts.filter((prompt: EntityWorkspacePrompt) => prompt.isActive).length;
  const coverage = portfolio?.coverageRate ?? 0;
  const shareOfVoice = portfolio?.shareOfVoice ?? 0;

  const promptClusters = useMemo(() => {
    const clusters = new Map<string, number>();
    for (const prompt of prompts) {
      const intent = promptIntentLabel(prompt);
      clusters.set(intent, (clusters.get(intent) ?? 0) + 1);
    }
    return Array.from(clusters.entries()).sort((a, b) => b[1] - a[1]);
  }, [prompts]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Bot className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-black tracking-tight">Zaloguj się, aby otworzyć workspace encji</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Entity workflow jest dostępny po zalogowaniu w GEO-Command.
          </p>
          <div className="mt-8">
            <Link href="/hub">
              <Button>Wróć do command center</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (workspaceQuery.isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="mb-6 h-10 w-80 animate-pulse rounded-xl bg-muted/40" />
          <div className="grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-28 animate-pulse rounded-2xl border border-border/40 bg-card/50" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data || !workspace) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <TriangleAlert className="mx-auto mb-4 h-10 w-10 text-amber-300" />
          <h1 className="text-3xl font-black tracking-tight">Nie znaleziono workspace encji</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Ta encja nie istnieje lub nie masz do niej dostępu.
          </p>
          <div className="mt-8">
            <Link href="/hub">
              <Button>Wróć do command center</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border/40 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/hub">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Command center
              </Button>
            </Link>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight">{workspace.name}</div>
              <div className="text-xs text-muted-foreground">{workspace.primaryDomain}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="border-primary/30 bg-primary/10 text-primary">Entity workspace</Badge>
            <Link href="/ai-monitoring">
              <Button variant="outline" size="sm" className="gap-2">
                <Radar className="h-4 w-4" />
                Monitoring
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard label="Share of Voice" value={formatPercent(shareOfVoice)} note="Agregat portfolio encji" />
          <MetricCard label="Prompt library" value={String(activePromptCount)} note="Aktywne prompty encji" />
          <MetricCard label="Coverage" value={formatPercent(coverage)} note="Ile promptów ma cytowania" />
          <MetricCard label="Competitor watchlist" value={String(competitors.length)} note="Konkurenci w watchliście" />
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <Card className="border-border/50 bg-card/70">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">Prompt library</CardTitle>
                  <CardDescription>
                    Warstwa sterująca dla monitoringu encji. Prompty są synchronizowane do monitorowanych assetów tej marki.
                  </CardDescription>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="gap-2">
                      <Plus className="h-4 w-4" />
                      Dodaj prompt
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Dodaj prompt do encji</DialogTitle>
                      <DialogDescription>
                        Prompt trafi do biblioteki encji i zostanie zsynchronizowany z monitorowanymi assetami tej marki.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="entity-prompt">Prompt</Label>
                        <Input id="entity-prompt" value={promptText} onChange={(e) => setPromptText(e.target.value)} placeholder="np. najlepsze laptopy dla graczy od x-kom" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="entity-prompt-intent">Intent</Label>
                        <Input id="entity-prompt-intent" value={promptIntent} onChange={(e) => setPromptIntent((e.target.value as typeof promptIntent) || "commercial")} placeholder="commercial" />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={() => addPrompt.mutate({ entityId: workspace.id ?? 0, phrase: promptText, intentType: promptIntent })} disabled={!workspace.id || !promptText.trim() || addPrompt.isPending} className="gap-2">
                        {addPrompt.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Dodaj prompt
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {prompts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/50 bg-background/40 p-6 text-sm text-muted-foreground">
                  Brak promptów. Dodaj pierwszy prompt, aby uruchomić workflow encji i zasilić monitoring.
                </div>
              ) : (
                prompts.map((prompt: EntityWorkspacePrompt) => (
                  <div key={prompt.id} className="rounded-2xl border border-border/40 bg-background/50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={promptStatusTone(prompt)}>{prompt.category ?? "tracked"}</Badge>
                          <Badge variant="outline">{promptIntentLabel(prompt)}</Badge>
                          {!prompt.isActive && <Badge variant="outline">paused</Badge>}
                        </div>
                        <div className="text-sm font-semibold">{prompt.prompt}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => togglePrompt.mutate({ promptId: prompt.id, isActive: !prompt.isActive })}>
                          {prompt.isActive ? "Pauzuj" : "Aktywuj"}
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-300 hover:text-red-200" onClick={() => deletePrompt.mutate({ promptId: prompt.id })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <PromptKpi label="Synced assets" value={String(prompt.syncedAssets)} />
                      <PromptKpi label="Source" value={prompt.source} />
                      <PromptKpi label="Cluster" value={prompt.intentType ?? "brand"} />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="border-border/50 bg-card/70">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg">Competitor watchlist</CardTitle>
                    <CardDescription>Domena konkurenta zasila comparison layer i planning prompt clusters.</CardDescription>
                  </div>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="sm" className="gap-2">
                        <Plus className="h-4 w-4" />
                        Dodaj
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Dodaj konkurenta</DialogTitle>
                        <DialogDescription>Watchlista zasila porównania SoV i planowanie prompt clusters.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="competitor-domain">Domena</Label>
                          <Input id="competitor-domain" value={competitorDomain} onChange={(e) => setCompetitorDomain(e.target.value)} placeholder="np. morele.net" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="competitor-label">Etykieta</Label>
                          <Textarea id="competitor-label" value={competitorLabel} onChange={(e) => setCompetitorLabel(e.target.value)} placeholder="Opcjonalna notatka lub label dla konkurenta" />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button onClick={() => addCompetitor.mutate({ entityId: workspace.id ?? 0, domain: competitorDomain, label: competitorLabel || undefined })} disabled={!workspace.id || !competitorDomain.trim() || addCompetitor.isPending} className="gap-2">
                          {addCompetitor.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                          Dodaj konkurenta
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {competitors.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border/50 bg-background/40 p-5 text-sm text-muted-foreground">Brak konkurentów w watchliście.</div>
                ) : (
                  competitors.map((competitor: EntityWorkspaceCompetitor) => (
                    <div key={competitor.id} className="rounded-2xl border border-border/40 bg-background/50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Badge variant="outline">tracked competitor</Badge>
                          <div className="mt-2 text-sm font-semibold">{competitor.domain}</div>
                          {competitor.label && <div className="mt-1 text-xs leading-5 text-muted-foreground">{competitor.label}</div>}
                        </div>
                        <Button size="sm" variant="ghost" className="text-red-300 hover:text-red-200" onClick={() => removeCompetitor.mutate({ competitorId: competitor.id })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/70">
              <CardHeader>
                <CardTitle className="text-lg">Entity execution</CardTitle>
                <CardDescription>To miejsce spina prompty, assety i execution layer monitoringu.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ExecutionRow icon={Compass} label="Prompt clusters" value={String(promptClusters.length || 0)} note="Kategorie intentów w bibliotece" />
                <ExecutionRow icon={Target} label="Synced assets" value={String(pages.length)} note="Assety zasilane prompt library" />
                <ExecutionRow icon={BarChart3} label="AI coverage" value={formatPercent(coverage)} note="Cytowania promptów w ostatnim monitoringu" />
                <ExecutionRow icon={Sparkles} label="Actionability" value={portfolio?.priorityAction ? "ready" : "pending"} note="Backlog do wdrożenia dla content/SEO/dev" />
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/70">
              <CardHeader>
                <CardTitle className="text-lg">Connected assets</CardTitle>
                <CardDescription>Monitorowane strony przypisane do tej encji.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {pages.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border/50 bg-background/40 p-5 text-sm text-muted-foreground">Ta encja nie ma jeszcze przypiętych assetów monitoringu.</div>
                ) : (
                  pages.map((page: { id: number; url: string; label: string | null; lastScore: number | null; lastCitedEngines: number | null; lastTotalEngines: number | null }) => (
                    <div key={page.id} className="rounded-2xl border border-border/40 bg-background/50 p-4">
                      <div className="text-sm font-semibold">{page.label || page.url}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{page.url}</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge variant="outline">score {page.lastScore ?? "—"}</Badge>
                        <Badge variant="outline">cited {page.lastCitedEngines ?? 0}/{page.lastTotalEngines ?? 4}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="mt-6">
          <Card className="border-border/50 bg-card/70">
            <CardHeader>
              <CardTitle className="text-lg">Entity strategy memo</CardTitle>
              <CardDescription>Operacyjny brief dla tej encji na bazie prompt library, SoV i konkurencji.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-3">
              <StrategyCard title="Primary domain" description={workspace.primaryDomain} />
              <StrategyCard title="Prompt footprint" description={`${prompts.length} promptów w bibliotece encji`} />
              <StrategyCard title="Priority action" description={portfolio?.priorityAction ?? "Dodaj więcej assetów lub promptów, aby wygenerować backlog."} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Card className="border-border/50 bg-card/70">
      <CardContent className="pt-6">
        <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
        <div className="mt-3 text-3xl font-black">{value}</div>
        <div className="mt-2 text-xs text-muted-foreground">{note}</div>
      </CardContent>
    </Card>
  );
}

function PromptKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-background/40 p-3">
      <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-sm font-semibold">{value}</div>
    </div>
  );
}

function ExecutionRow({ icon: Icon, label, value, note }: { icon: typeof Compass; label: string; value: string; note: string }) {
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

function StrategyCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-border/40 bg-background/50 p-4">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-2 text-xs leading-5 text-muted-foreground">{description}</div>
    </div>
  );
}
