import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Zap, Eye, Clock, BarChart2, Plus, AlertTriangle, CheckCircle,
  Lock, ChevronRight, RefreshCw, Star, Target, Sparkles, Shield,
  Globe, ArrowUpRight, Activity, FileText, Search, Bot, Trophy,
  Flame, Info, Brain, LogIn,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreColor(score: number | null | undefined): string {
  if (score == null) return "text-muted-foreground";
  if (score >= 75) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

function scoreBorderColor(score: number | null | undefined): string {
  if (score == null) return "border-muted";
  if (score >= 75) return "border-emerald-500";
  if (score >= 50) return "border-amber-500";
  return "border-red-500";
}

function scoreLabel(score: number | null | undefined): string {
  if (score == null) return "Brak danych";
  if (score >= 80) return "Świetny";
  if (score >= 65) return "Dobry";
  if (score >= 45) return "Wymaga pracy";
  return "Krytyczny";
}

function planLabel(plan: string): string {
  const map: Record<string, string> = { free: "Free", starter: "Starter", pro: "Pro", business: "Business" };
  return map[plan] ?? plan;
}

function planColorClass(plan: string): string {
  const map: Record<string, string> = {
    free: "bg-zinc-700/50 text-zinc-300 border border-zinc-600",
    starter: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
    pro: "bg-violet-500/20 text-violet-300 border border-violet-500/30",
    business: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
  };
  return map[plan] ?? "bg-zinc-700/50 text-zinc-300";
}

// ─── Usage Meter ─────────────────────────────────────────────────────────────

function UsageMeter({ used, limit, plan }: { used: number; limit: number; plan: string }) {
  const isUnlimited = limit > 9999;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const isWarning = pct >= 70;
  const isCritical = pct >= 90;

  return (
    <div className={`rounded-xl border p-4 transition-colors ${
      isCritical ? "border-red-500/30 bg-red-500/5" :
      isWarning ? "border-amber-500/30 bg-amber-500/5" :
      "border-border bg-card"
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Activity className={`w-4 h-4 ${isCritical ? "text-red-400" : isWarning ? "text-amber-400" : "text-muted-foreground"}`} />
          <span className="text-sm font-medium">Audyty w tym miesiącu</span>
        </div>
        <span className={`text-sm font-bold tabular-nums ${isCritical ? "text-red-400" : isWarning ? "text-amber-400" : "text-foreground"}`}>
          {used} / {isUnlimited ? "∞" : limit}
        </span>
      </div>
      {!isUnlimited && (
        <Progress
          value={pct}
          className={`h-1.5 ${isCritical ? "[&>div]:bg-red-500" : isWarning ? "[&>div]:bg-amber-500" : "[&>div]:bg-violet-500"}`}
        />
      )}
      {isCritical && plan !== "business" && (
        <p className="text-xs text-red-400 mt-2 flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          Prawie wyczerpany limit —{" "}
          <Link href="/pricing" className="underline font-medium hover:text-red-300">rozszerz plan</Link>
        </p>
      )}
      {isWarning && !isCritical && plan !== "business" && (
        <p className="text-xs text-amber-400 mt-2 flex items-center gap-1.5">
          <Info className="w-3 h-3 shrink-0" />
          Zostało {limit - used} audytów —{" "}
          <Link href="/pricing" className="underline font-medium hover:text-amber-300">rozważ upgrade</Link>
        </p>
      )}
      {!isWarning && !isUnlimited && plan === "free" && (
        <p className="text-xs text-muted-foreground mt-2">
          Plan Free: {limit - used} audytów do końca miesiąca.{" "}
          <Link href="/pricing" className="text-violet-400 hover:text-violet-300 underline">Upgrade</Link>
        </p>
      )}
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon, label, value, sub, colorClass, iconColor,
}: {
  icon: React.ElementType; label: string; value: string | number;
  sub?: string; colorClass?: string; iconColor?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        <Icon className={`w-4 h-4 ${iconColor ?? ""}`} />
        <span className="text-xs">{label}</span>
      </div>
      <span className={`text-2xl font-bold tabular-nums ${colorClass ?? "text-foreground"}`}>{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

// ─── Locked Feature Card ──────────────────────────────────────────────────────

function LockedFeatureCard({
  icon: Icon, title, description, requiredPlan,
}: {
  icon: React.ElementType; title: string; description: string; requiredPlan: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-4 relative overflow-hidden group cursor-default">
      <div className="absolute inset-0 bg-background/70 backdrop-blur-[2px] flex flex-col items-center justify-center z-10 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl">
        <Lock className="w-5 h-5 text-violet-400 mb-2" />
        <span className="text-xs text-center text-muted-foreground px-4">
          Dostępne w planie <span className="text-violet-400 font-semibold">{requiredPlan}</span>
        </span>
        <Link href="/pricing">
          <Button size="sm" className="mt-3 bg-violet-600 hover:bg-violet-700 text-white text-xs h-7 gap-1">
            <Zap className="w-3 h-3" /> Odblokuj
          </Button>
        </Link>
      </div>
      <div className="flex items-start gap-3 opacity-60">
        <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-violet-400" />
        </div>
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <div className="absolute top-2 right-2">
        <Lock className="w-3.5 h-3.5 text-muted-foreground/40" />
      </div>
    </div>
  );
}

// ─── Audit Row ────────────────────────────────────────────────────────────────

type AuditItem = {
  id: number;
  url: string;
  overallScore: number | null;
  status: string;
  createdAt: Date | string;
  llmTopPriority?: string | null;
  llmDifficulty?: string | null;
  llmScoreGain?: number | null;
  pageTitle?: string | null;
};

function AuditRow({ audit }: { audit: AuditItem }) {
  const score = audit.overallScore;
  const domain = (() => { try { return new URL(audit.url).hostname; } catch { return audit.url; } })();
  const path = (() => { try { const u = new URL(audit.url); return u.pathname === "/" ? "" : u.pathname; } catch { return ""; } })();
  const date = new Date(audit.createdAt).toLocaleDateString("pl-PL", { day: "numeric", month: "short" });

  return (
    <Link href={`/results/${audit.id}`}>
      <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors group cursor-pointer">
        <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center shrink-0 font-bold text-sm ${scoreBorderColor(score)} ${scoreColor(score)}`}>
          {score != null ? Math.round(score) : "–"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{audit.pageTitle || domain}</p>
          <p className="text-xs text-muted-foreground truncate">{domain}{path}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-muted-foreground">{date}</span>
            {audit.llmScoreGain != null && audit.llmScoreGain > 0 && (
              <span className="text-xs text-violet-400 font-medium">+{audit.llmScoreGain} pkt potencjału</span>
            )}
            {audit.llmDifficulty === "easy" && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-medium">Łatwa naprawa</span>
            )}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
      </div>
    </Link>
  );
}

// ─── Monitored Page Card ──────────────────────────────────────────────────────

type MonitoredPageItem = {
  id: number;
  url: string;
  label: string | null;
  lastScore: number | null;
  lastAuditAt: Date | null;
  lastAuditId: number | null;
};

function MonitoredPageCard({ page, onRemove }: { page: MonitoredPageItem; onRemove: (id: number) => void }) {
  const score = page.lastScore;
  const domain = (() => { try { return new URL(page.url).hostname; } catch { return page.url; } })();
  const lastAudit = page.lastAuditAt
    ? new Date(page.lastAuditAt).toLocaleDateString("pl-PL", { day: "numeric", month: "short" })
    : "Brak danych";

  return (
    <div className={`rounded-xl border p-4 bg-card ${
      score == null ? "border-border" :
      score >= 75 ? "border-emerald-500/20" :
      score >= 50 ? "border-amber-500/20" :
      "border-red-500/20"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{page.label || domain}</p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{page.url}</p>
        </div>
        <div className={`text-2xl font-bold tabular-nums shrink-0 ${scoreColor(score)}`}>
          {score != null ? Math.round(score) : "–"}
        </div>
      </div>
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>{lastAudit}</span>
        </div>
        <div className="flex items-center gap-2">
          {page.lastAuditId && (
            <Link href={`/results/${page.lastAuditId}`}>
              <Button size="sm" variant="outline" className="h-6 text-xs">Raport</Button>
            </Link>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
            onClick={(e) => { e.preventDefault(); onRemove(page.id); }}
          >
            Usuń
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard Nav ────────────────────────────────────────────────────────────

function DashboardTopNav({ plan, user }: { plan: string; user?: { name?: string | null } | null }) {
  const { logout } = useAuth();

  return (
    <header className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/">
          <div className="flex items-center gap-2 font-bold text-lg cursor-pointer hover:opacity-80 transition-opacity">
            <Brain className="w-5 h-5 text-violet-400" />
            <span>GEO<span className="text-violet-400">-Auditor</span></span>
          </div>
        </Link>
        <nav className="hidden md:flex items-center gap-5 text-sm text-muted-foreground">
          <Link href="/dashboard" className="text-foreground font-medium">Dashboard</Link>
          <Link href="/sandbox" className="hover:text-foreground transition-colors">AI Sandbox</Link>
          <Link href="/page-creator" className="hover:text-foreground transition-colors">Page Creator</Link>
          <Link href="/pricing" className="hover:text-foreground transition-colors">Plany</Link>
        </nav>
        <div className="flex items-center gap-3">
          {user?.name && (
            <span className="text-xs text-muted-foreground hidden sm:block">{user.name}</span>
          )}
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${planColorClass(plan)}`}>
            {planLabel(plan)}
          </span>
          <Link href="/">
            <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5 h-8 text-xs">
              <Plus className="w-3.5 h-3.5" /> Nowy audyt
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="text-xs text-muted-foreground h-8 hidden sm:flex"
          >
            Wyloguj
          </Button>
        </div>
      </div>
    </header>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="h-14 border-b border-border bg-background/95" />
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="h-8 bg-muted/30 rounded-lg w-64 animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-card border border-border animate-pulse" />
          ))}
        </div>
        <div className="h-16 rounded-xl bg-card border border-border animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-80 rounded-xl bg-card border border-border animate-pulse" />
          <div className="h-80 rounded-xl bg-card border border-border animate-pulse" />
        </div>
      </div>
    </div>
  );
}

// ─── Not Authenticated ────────────────────────────────────────────────────────

function NotAuthenticated() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border h-14 flex items-center px-4">
        <Link href="/">
          <div className="flex items-center gap-2 font-bold text-lg cursor-pointer">
            <Brain className="w-5 h-5 text-violet-400" />
            <span>GEO<span className="text-violet-400">-Auditor</span></span>
          </div>
        </Link>
      </header>
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-violet-500/10 flex items-center justify-center mx-auto mb-6">
            <LogIn className="w-8 h-8 text-violet-400" />
          </div>
          <h2 className="text-2xl font-bold mb-3">Zaloguj się, aby zobaczyć Dashboard</h2>
          <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
            Monitoruj swoje strony, śledź wyniki AI-Readiness w czasie i otrzymuj alerty,
            gdy wynik się zmieni.
          </p>
          <Button
            onClick={() => (window.location.href = getLoginUrl())}
            className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
          >
            <LogIn className="w-4 h-4" />
            Zaloguj się za darmo
          </Button>
          <p className="text-xs text-muted-foreground mt-4">
            Plan Free: 1 monitorowana strona + 5 audytów/mies.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [newUrl, setNewUrl] = useState("");
  const [showAddMonitoring, setShowAddMonitoring] = useState(false);
  const utils = trpc.useUtils();

  const { data: history, isLoading: historyLoading } = trpc.audit.myHistory.useQuery(
    { limit: 10 },
    { enabled: isAuthenticated }
  );
  const { data: monitoredPages, isLoading: monitoringLoading } = trpc.monitoring.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );
  const { data: planData } = trpc.payments.getMyPlan.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );
  const { data: usageStats } = trpc.audit.getUsageStats.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const addMonitoring = trpc.monitoring.add.useMutation({
    onSuccess: () => {
      utils.monitoring.list.invalidate();
      setNewUrl("");
      setShowAddMonitoring(false);
      toast.success("Strona dodana do monitoringu!");
    },
    onError: (e) => toast.error(e.message),
  });
  const removeMonitoring = trpc.monitoring.remove.useMutation({
    onSuccess: () => {
      utils.monitoring.list.invalidate();
      toast.success("Usunięto z monitoringu");
    },
    onError: (e) => toast.error(e.message),
  });

  if (authLoading) return <DashboardSkeleton />;
  if (!isAuthenticated) return <NotAuthenticated />;

  const plan = planData?.plan ?? "free";
  const limits = planData?.limits;
  const auditsLimit = limits?.auditsPerMonth ?? 5;
  const monitoringLimit = limits?.monitoredPages ?? 1;
  const auditsUsed = usageStats?.auditsThisMonth ?? 0;
  const avgScore = usageStats?.avgScore;
  const bestScore = usageStats?.bestScore;
  const totalAudits = usageStats?.totalAudits ?? 0;

  const isPaid = plan !== "free";
  const isPro = plan === "pro" || plan === "business";
  const isBusiness = plan === "business";

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Dzień dobry" : hour < 18 ? "Cześć" : "Dobry wieczór";
  const firstName = user?.name?.split(" ")[0] ?? "Użytkowniku";

  const handleAddMonitoring = () => {
    if (!newUrl.trim()) return;
    let url = newUrl.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }
    addMonitoring.mutate({ url });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardTopNav plan={plan} user={user} />

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">

        {/* ── HERO ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{greeting}, {firstName}! 👋</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {totalAudits === 0
                ? "Uruchom swój pierwszy audyt i sprawdź widoczność w AI Search."
                : `Łącznie wykonałeś ${totalAudits} audyt${totalAudits === 1 ? "" : totalAudits < 5 ? "y" : "ów"}.`}
            </p>
          </div>
          <Link href="/">
            <Button className="bg-violet-600 hover:bg-violet-700 text-white gap-2 h-10 px-5 text-sm font-semibold shadow-lg shadow-violet-900/30">
              <Zap className="w-4 h-4" /> Uruchom nowy audyt
            </Button>
          </Link>
        </div>

        {/* ── STATS ROW ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            icon={BarChart2}
            label="Średni wynik AI"
            value={avgScore != null ? `${avgScore}/100` : "–"}
            sub={scoreLabel(avgScore)}
            colorClass={scoreColor(avgScore)}
            iconColor={scoreColor(avgScore)}
          />
          <StatCard
            icon={Trophy}
            label="Najlepszy wynik"
            value={bestScore != null ? `${bestScore}/100` : "–"}
            sub={bestScore != null ? "Twój rekord" : "Brak danych"}
            colorClass={bestScore != null && bestScore >= 75 ? "text-emerald-400" : bestScore != null ? "text-amber-400" : undefined}
            iconColor={bestScore != null && bestScore >= 75 ? "text-emerald-400" : "text-amber-400"}
          />
          <StatCard
            icon={Flame}
            label="Audyty w tym mies."
            value={auditsUsed}
            sub={`z ${auditsLimit > 9999 ? "∞" : auditsLimit} w planie`}
            iconColor="text-orange-400"
          />
          <StatCard
            icon={Globe}
            label="Monitorowane strony"
            value={monitoredPages?.length ?? 0}
            sub={`z ${monitoringLimit > 9999 ? "∞" : monitoringLimit} w planie`}
            iconColor="text-blue-400"
          />
        </div>

        {/* ── USAGE METER ── */}
        <UsageMeter used={auditsUsed} limit={auditsLimit} plan={plan} />

        {/* ── MAIN GRID ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* LEFT — Recent Audits */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" /> Ostatnie audyty
              </h2>
              <Link href="/">
                <Button size="sm" variant="ghost" className="text-xs gap-1 text-muted-foreground hover:text-foreground h-7">
                  <Plus className="w-3 h-3" /> Nowy audyt
                </Button>
              </Link>
            </div>

            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {historyLoading ? (
                <div className="p-8 text-center text-muted-foreground text-sm">Ładowanie historii...</div>
              ) : !history || history.length === 0 ? (
                <div className="p-10 text-center">
                  <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm font-medium">Brak audytów</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">
                    Uruchom pierwszy audyt i sprawdź widoczność swojej strony w AI Search.
                  </p>
                  <Link href="/">
                    <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white">
                      Uruchom audyt
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {history.map((audit) => (
                    <AuditRow key={audit.id} audit={audit} />
                  ))}
                </div>
              )}
            </div>

            {!isPaid && history && history.length >= 3 && (
              <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-violet-300">Widzisz tylko ostatnie audyty</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Plan Starter odblokuje pełną historię, eksport PDF i monitoring 10 stron.
                  </p>
                </div>
                <Link href="/pricing">
                  <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white shrink-0 text-xs gap-1">
                    <Zap className="w-3 h-3" /> Upgrade
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* RIGHT — Plan + Quick Actions */}
          <div className="space-y-4">

            {/* Plan card */}
            <div className={`rounded-xl border p-5 ${
              isBusiness ? "border-amber-500/30 bg-amber-500/5" :
              isPro ? "border-violet-500/30 bg-violet-500/5" :
              plan === "starter" ? "border-blue-500/30 bg-blue-500/5" :
              "border-border bg-card"
            }`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs text-muted-foreground">Twój plan</p>
                  <p className="text-xl font-bold mt-0.5">{planLabel(plan)}</p>
                </div>
                {isBusiness ? <Trophy className="w-8 h-8 text-amber-400" /> :
                 isPro ? <Star className="w-8 h-8 text-violet-400" /> :
                 plan === "starter" ? <Zap className="w-8 h-8 text-blue-400" /> :
                 <Shield className="w-8 h-8 text-muted-foreground" />}
              </div>

              {plan === "free" && (
                <>
                  <p className="text-xs text-muted-foreground mb-3">Odblokuj pełne możliwości GEO-Auditora</p>
                  <div className="space-y-1.5 mb-4">
                    {["50 audytów/mies.", "Pełna historia audytów", "Monitoring 10 stron", "Eksport PDF"].map((f) => (
                      <div key={f} className="flex items-center gap-2 text-xs">
                        <CheckCircle className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                  <Link href="/pricing">
                    <Button className="w-full bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold gap-1.5">
                      <Zap className="w-3.5 h-3.5" /> Starter — $39/mies.
                    </Button>
                  </Link>
                </>
              )}

              {plan === "starter" && (
                <>
                  <p className="text-xs text-muted-foreground mb-3">Odblokuj analizę konkurencji i 200 audytów miesięcznie</p>
                  <Link href="/pricing">
                    <Button className="w-full bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold gap-1.5">
                      <ArrowUpRight className="w-3.5 h-3.5" /> Upgrade do Pro — $99/mies.
                    </Button>
                  </Link>
                </>
              )}

              {isPro && !isBusiness && (
                <>
                  <p className="text-xs text-muted-foreground mb-3">Odblokuj white-label raporty, API i integracje</p>
                  <Link href="/pricing">
                    <Button className="w-full bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold gap-1.5">
                      <Trophy className="w-3.5 h-3.5" /> Upgrade do Business
                    </Button>
                  </Link>
                </>
              )}

              {isBusiness && (
                <p className="text-xs text-emerald-400 flex items-center gap-1.5 mt-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Masz dostęp do wszystkich funkcji
                </p>
              )}
            </div>

            {/* Quick Actions */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Target className="w-4 h-4 text-muted-foreground" /> Szybkie akcje
              </h3>
              <div className="space-y-2">
                <Link href="/">
                  <Button variant="outline" className="w-full justify-start gap-2 text-sm h-9">
                    <Search className="w-4 h-4 text-violet-400" /> Nowy audyt URL
                  </Button>
                </Link>
                <Link href="/sandbox">
                  <Button variant="outline" className="w-full justify-start gap-2 text-sm h-9">
                    <Bot className="w-4 h-4 text-blue-400" /> AI Sandbox
                  </Button>
                </Link>
                <Link href="/page-creator">
                  <Button variant="outline" className="w-full justify-start gap-2 text-sm h-9">
                    <FileText className="w-4 h-4 text-emerald-400" /> AI Page Creator
                  </Button>
                </Link>
                <Link href="/pricing">
                  <Button variant="outline" className="w-full justify-start gap-2 text-sm h-9">
                    <Star className="w-4 h-4 text-amber-400" /> Plany i cennik
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* ── MONITORED PAGES ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-muted-foreground" /> Monitoring stron
              {monitoredPages && monitoredPages.length > 0 && (
                <Badge variant="secondary" className="text-xs">{monitoredPages.length}</Badge>
              )}
            </h2>
            <Button
              size="sm"
              variant="outline"
              className="text-xs gap-1 h-7"
              onClick={() => setShowAddMonitoring(!showAddMonitoring)}
            >
              <Plus className="w-3 h-3" /> Dodaj stronę
            </Button>
          </div>

          {showAddMonitoring && (
            <div className="rounded-xl border border-border bg-card p-4 mb-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://twoja-strona.pl/produkt"
                  className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 text-foreground placeholder:text-muted-foreground"
                  onKeyDown={(e) => e.key === "Enter" && handleAddMonitoring()}
                />
                <Button
                  size="sm"
                  className="bg-violet-600 hover:bg-violet-700 text-white shrink-0"
                  onClick={handleAddMonitoring}
                  disabled={addMonitoring.isPending}
                >
                  {addMonitoring.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Dodaj"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 text-muted-foreground"
                  onClick={() => setShowAddMonitoring(false)}
                >
                  Anuluj
                </Button>
              </div>
              {!isPaid && (
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  Plan Free: 1 monitorowana strona.{" "}
                  <Link href="/pricing" className="text-violet-400 underline">Upgrade</Link> dla więcej.
                </p>
              )}
            </div>
          )}

          {monitoringLoading ? (
            <div className="text-sm text-muted-foreground">Ładowanie...</div>
          ) : !monitoredPages || monitoredPages.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <Eye className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm font-medium">Brak monitorowanych stron</p>
              <p className="text-xs text-muted-foreground mt-1 mb-3">
                Dodaj stronę, aby automatycznie śledzić zmiany wyników AI-Readiness.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="text-xs gap-1"
                onClick={() => setShowAddMonitoring(true)}
              >
                <Plus className="w-3 h-3" /> Dodaj pierwszą stronę
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {monitoredPages.map((page) => (
                <MonitoredPageCard
                  key={page.id}
                  page={page}
                  onRemove={(id) => removeMonitoring.mutate({ id })}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── LOCKED FEATURES ── */}
        {!isPro && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Lock className="w-4 h-4 text-muted-foreground" /> Odblokuj więcej możliwości
              </h2>
              <Link href="/pricing">
                <Button size="sm" variant="ghost" className="text-xs text-violet-400 hover:text-violet-300 gap-1 h-7">
                  Zobacz plany <ChevronRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <LockedFeatureCard
                icon={BarChart2}
                title="Analiza konkurencji"
                description="Porównaj widoczność AI swojej domeny z 3 konkurentami."
                requiredPlan="Pro"
              />
              <LockedFeatureCard
                icon={FileText}
                title="Eksport PDF"
                description="Pobierz profesjonalny raport PDF gotowy do prezentacji klientowi."
                requiredPlan="Starter"
              />
              <LockedFeatureCard
                icon={Globe}
                title="Monitoring 50 stron"
                description="Śledź zmiany wyników AI-Readiness dla całego sklepu."
                requiredPlan="Pro"
              />
            </div>
          </div>
        )}

        {/* ── TIP ── */}
        <div className="rounded-xl border border-border bg-card/50 p-5 flex flex-col md:flex-row items-start md:items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-violet-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Wskazówka: Optymalizuj strony produktowe jako pierwsze</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Google AI Overviews najczęściej cytuje strony z jasną strukturą H1/H2, FAQ i schema.org.
              Zacznij od stron z najniższym wynikiem AI-Readiness.
            </p>
          </div>
          <Link href="/">
            <Button size="sm" variant="outline" className="shrink-0 text-xs gap-1">
              Sprawdź stronę <ArrowUpRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>

      </main>
    </div>
  );
}
