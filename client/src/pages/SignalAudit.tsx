import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search, ArrowUpRight, Clock, BarChart2, Eye, Zap,
  ChevronRight, ChevronDown, Filter, SortAsc, SortDesc, LayoutDashboard,
  Activity, Sparkles, FileText, Star, Globe, TrendingUp,
  AlertTriangle, CheckCircle, XCircle, Plus,
} from "lucide-react";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number | null | undefined): string {
  if (score == null) return "text-muted-foreground";
  if (score >= 75) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

function scoreBg(score: number | null | undefined): string {
  if (score == null) return "border-muted/40 bg-muted/10";
  if (score >= 75) return "border-emerald-500/40 bg-emerald-500/8";
  if (score >= 50) return "border-amber-500/40 bg-amber-500/8";
  return "border-red-500/40 bg-red-500/8";
}

function scoreLabel(score: number | null | undefined): string {
  if (score == null) return "Brak danych";
  if (score >= 80) return "Świetny";
  if (score >= 65) return "Dobry";
  if (score >= 45) return "Wymaga pracy";
  return "Krytyczny";
}

function scoreLabelColor(score: number | null | undefined): string {
  if (score == null) return "text-muted-foreground";
  if (score >= 80) return "text-emerald-400";
  if (score >= 65) return "text-emerald-400";
  if (score >= 45) return "text-amber-400";
  return "text-red-400";
}

function formatDate(d: Date | string): string {
  const date = new Date(d);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "dziś";
  if (days === 1) return "wczoraj";
  if (days < 7) return `${days} dni temu`;
  return date.toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: days > 365 ? "numeric" : undefined });
}

function getDomain(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

function getPath(url: string): string {
  try { const u = new URL(url); return u.pathname === "/" ? "" : u.pathname; } catch { return ""; }
}

type SortKey = "date" | "score" | "url";
type SortDir = "asc" | "desc";

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function AuditSidebar({ user, plan }: { user: { name?: string | null } | null; plan: string }) {
  const [, navigate] = useLocation();
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => navigate("/") });

  const planColorClass = (p: string) => {
    const map: Record<string, string> = {
      free: "bg-zinc-700/50 text-zinc-300 border border-zinc-600",
      starter: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
      pro: "bg-violet-500/20 text-violet-300 border border-violet-500/30",
      business: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
    };
    return map[p] ?? "bg-zinc-700/50 text-zinc-300";
  };

  const planLabel = (p: string) => ({ free: "Free", starter: "Starter", pro: "Pro", business: "Business" }[p] ?? p);
  const isBusiness = plan === "business";
  const isPro = plan === "pro";

  return (
    <aside className="w-56 shrink-0 flex flex-col h-full border-r border-border/40 bg-background/95 backdrop-blur-sm">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-border/30">
        <Link href="/">
          <div className="flex items-center gap-2.5 cursor-pointer group">
            <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-sm font-bold tracking-tight">GEO-Auditor</span>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {/* Primary CTA */}
        <Link href="/">
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold bg-primary/15 border border-primary/25 text-primary mb-3 hover:bg-primary/20 transition-colors cursor-pointer">
            <Plus className="w-3.5 h-3.5" />
            Nowa analiza
          </div>
        </Link>

        <Link href="/hub">
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
            <LayoutDashboard className="w-3.5 h-3.5" />
            AI HUB
          </div>
        </Link>
        <Link href="/ai-monitoring">
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
            <Eye className="w-3.5 h-3.5" />
            AI Monitoring
          </div>
        </Link>
        <Link href="/page-creator">
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
            <Sparkles className="w-3.5 h-3.5" />
            Signal Rewrite
          </div>
        </Link>
        {/* Active */}
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold bg-muted/50 text-foreground">
          <Search className="w-3.5 h-3.5 text-primary" />
          Signal Audit
          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
        </div>
        <Link href="/pricing">
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
            <Star className="w-3.5 h-3.5" />
            Plany i cennik
          </div>
        </Link>

        {/* Content Creator widget */}
        <div className="mt-auto pt-3">
          <Link href="/page-creator">
            <div className="rounded-xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/8 via-teal-500/5 to-transparent p-3 cursor-pointer hover:border-emerald-500/40 transition-all group">
              <div className="flex items-center gap-1.5 mb-1.5">
                <FileText className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
                <span className="text-[11px] font-bold text-emerald-300">Content Creator</span>
                <span className="ml-auto text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">BETA</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-snug">
                Twórz nowe podstrony zoptymalizowane pod AI Search — od zera.
              </p>
              <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-emerald-400 group-hover:gap-1.5 transition-all">
                Stwórz nową stronę <ChevronRight className="w-3 h-3" />
              </div>
            </div>
          </Link>
        </div>
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-border/30 space-y-2">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${planColorClass(plan)}`}>
          {isBusiness ? <TrendingUp className="w-3.5 h-3.5" /> : isPro ? <Star className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
          <span className="font-semibold">{planLabel(plan)}</span>
        </div>
        {user?.name && (
          <div className="px-3 py-1.5 text-xs text-muted-foreground truncate">{user.name}</div>
        )}
        <button
          onClick={() => logout.mutate()}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
        >
          <XCircle className="w-3.5 h-3.5" />
          Wyloguj
        </button>
      </div>
    </aside>
  );
}

// ─── Audit Row Card ───────────────────────────────────────────────────────────

type AuditItem = {
  id: number;
  url: string;
  overallScore: number | null;
  status: string;
  createdAt: Date | string;
  pageTitle?: string | null;
  pageType?: string | null;
  llmTopPriority?: string | null;
  llmScoreGain?: number | null;
  llmDifficulty?: string | null;
};

function AuditCard({ audit, showDomain = true }: { audit: AuditItem; showDomain?: boolean }) {
  const domain = getDomain(audit.url);
  const path = getPath(audit.url);
  const score = audit.overallScore;
  const isCompleted = audit.status === "completed";
  const isFailed = audit.status === "failed";

  return (
    <div className={`rounded-xl border transition-all hover:border-border/80 hover:shadow-sm group ${scoreBg(score)}`}>
      {/* Main row */}
      <div className="flex items-center gap-4 p-4">
        {/* Score orb */}
        <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center shrink-0 font-bold text-base ${score != null ? (score >= 75 ? "border-emerald-500 text-emerald-400" : score >= 50 ? "border-amber-500 text-amber-400" : "border-red-500 text-red-400") : "border-muted text-muted-foreground"}`}>
          {isFailed ? <XCircle className="w-5 h-5 text-red-400" /> : score != null ? Math.round(score) : "–"}
        </div>

        {/* URL + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-semibold truncate">{audit.pageTitle || domain}</p>
            {audit.pageType && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground shrink-0">{audit.pageType}</span>
            )}
          </div>
          {showDomain && <p className="text-xs text-muted-foreground truncate">{domain}{path}</p>}
          {!showDomain && path && <p className="text-xs text-muted-foreground truncate font-mono">{path || "/"}</p>}
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDate(audit.createdAt)}
            </span>
            {isCompleted && score != null && (
              <span className={`text-xs font-medium ${scoreLabelColor(score)}`}>
                {scoreLabel(score)}
              </span>
            )}
            {isFailed && (
              <span className="text-xs text-red-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Błąd analizy
              </span>
            )}
            {audit.llmScoreGain != null && audit.llmScoreGain > 0 && (
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                +{audit.llmScoreGain} pkt możliwe
              </span>
            )}
          </div>
        </div>

        {/* Quick action links */}
        {isCompleted && (
          <div className="flex items-center gap-2 shrink-0">
            <Link href={`/results/${audit.id}`}>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 border-border/60 hover:border-primary/40 hover:text-primary">
                <BarChart2 className="w-3.5 h-3.5" />
                Wyniki
              </Button>
            </Link>
            <Link href={`/results/${audit.id}?tab=citation`}>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 border-border/60 hover:border-violet-500/40 hover:text-violet-400">
                <Eye className="w-3.5 h-3.5" />
                AI Check
              </Button>
            </Link>
            <Link href={`/results/${audit.id}?tab=rewrite`}>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 border-border/60 hover:border-emerald-500/40 hover:text-emerald-400">
                <Sparkles className="w-3.5 h-3.5" />
                Rewrite
              </Button>
            </Link>
          </div>
        )}
        {!isCompleted && !isFailed && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" />
            W trakcie...
          </div>
        )}
      </div>

      {/* Top priority hint */}
      {audit.llmTopPriority && (
        <div className="px-4 pb-3 flex items-start gap-2">
          <div className="w-1 h-1 rounded-full bg-amber-400 mt-1.5 shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="text-amber-400 font-medium">Priorytet: </span>
            {audit.llmTopPriority}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Domain Group ────────────────────────────────────────────────────────────

function DomainGroup({ domain, audits, defaultOpen = true }: { domain: string; audits: AuditItem[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  const completed = audits.filter(a => a.status === "completed");
  const avgScore = completed.length > 0
    ? Math.round(completed.reduce((s, a) => s + (a.overallScore ?? 0), 0) / completed.length)
    : null;
  const bestScore = completed.length > 0
    ? Math.max(...completed.map(a => a.overallScore ?? 0))
    : null;

  return (
    <div className="mb-6">
      {/* Domain header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border/50 bg-card/40 hover:bg-card/70 transition-colors group mb-2"
      >
        <Globe className="w-4 h-4 text-primary/70 shrink-0" />
        <span className="text-sm font-semibold flex-1 text-left">{domain}</span>

        {/* Domain stats */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Activity className="w-3 h-3" />
            {audits.length} {audits.length === 1 ? "audyt" : audits.length < 5 ? "audyty" : "audytów"}
          </span>
          {avgScore != null && (
            <span className={`flex items-center gap-1 font-medium ${scoreColor(avgScore)}`}>
              <BarChart2 className="w-3 h-3" />
              śr. {avgScore}/100
            </span>
          )}
          {bestScore != null && (
            <span className={`flex items-center gap-1 font-medium ${scoreColor(bestScore)}`}>
              <TrendingUp className="w-3 h-3" />
              max {Math.round(bestScore)}/100
            </span>
          )}
        </div>

        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Subpages list */}
      {open && (
        <div className="space-y-2 pl-4 border-l-2 border-primary/15 ml-2">
          {audits.map(audit => (
            <AuditCard key={audit.id} audit={audit} showDomain={false} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SignalAudit() {
  const { user, isAuthenticated } = useAuth();
  const authLoading = !isAuthenticated && user === null;
  const [, navigate] = useLocation();

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [scoreFilter, setScoreFilter] = useState<"all" | "great" | "ok" | "poor">("all");
  const [collapsedDomains, setCollapsedDomains] = useState<Set<string>>(new Set());

  const { data: history, isLoading } = trpc.audit.myHistory.useQuery(
    { limit: 200 },
    { enabled: !!user }
  );

  const { data: usageStats } = trpc.audit.getUsageStats.useQuery(undefined, { enabled: !!user });

  const plan = (user as { plan?: string } | null)?.plan ?? "free";

  // Filter + sort
  const filtered = useMemo(() => {
    if (!history) return [];
    let items = [...history];

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(a =>
        a.url.toLowerCase().includes(q) ||
        (a.pageTitle ?? "").toLowerCase().includes(q)
      );
    }

    // Score filter
    if (scoreFilter !== "all") {
      items = items.filter(a => {
        const s = a.overallScore;
        if (s == null) return scoreFilter === "poor";
        if (scoreFilter === "great") return s >= 75;
        if (scoreFilter === "ok") return s >= 50 && s < 75;
        if (scoreFilter === "poor") return s < 50;
        return true;
      });
    }

    // Sort
    items.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortKey === "score") {
        cmp = (a.overallScore ?? -1) - (b.overallScore ?? -1);
      } else if (sortKey === "url") {
        cmp = getDomain(a.url).localeCompare(getDomain(b.url));
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    return items;
  }, [history, search, sortKey, sortDir, scoreFilter]);

  // Domain grouping: auto-enable when >1 unique domain
  const uniqueDomains = useMemo(() => {
    if (!history) return new Set<string>();
    return new Set(history.map(a => getDomain(a.url)));
  }, [history]);
  const isGrouped = uniqueDomains.size > 1;

  // Group filtered audits by domain
  const groupedByDomain = useMemo(() => {
    if (!isGrouped) return null;
    const groups = new Map<string, AuditItem[]>();
    for (const audit of filtered) {
      const d = getDomain(audit.url);
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d)!.push(audit);
    }
    // Sort domains by most recent audit
    return Array.from(groups.entries()).sort((a, b) => {
      const latestA = Math.max(...a[1].map(x => new Date(x.createdAt).getTime()));
      const latestB = Math.max(...b[1].map(x => new Date(x.createdAt).getTime()));
      return latestB - latestA;
    });
  }, [filtered, isGrouped]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  // Auth guard
  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Search className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-lg font-semibold">Zaloguj się, aby zobaczyć historię</h2>
          <p className="text-sm text-muted-foreground">Historia analiz jest dostępna po zalogowaniu.</p>
          <Button onClick={() => window.location.href = getLoginUrl()} className="gap-2">
            <Zap className="w-4 h-4" />
            Zaloguj się
          </Button>
        </div>
      </div>
    );
  }

  const totalAudits = history?.length ?? 0;
  const completedAudits = history?.filter(a => a.status === "completed").length ?? 0;
  const avgScore = completedAudits > 0
    ? Math.round((history ?? []).filter(a => a.overallScore != null).reduce((s, a) => s + (a.overallScore ?? 0), 0) / completedAudits)
    : null;
  const bestScore = completedAudits > 0
    ? Math.max(...(history ?? []).filter(a => a.overallScore != null).map(a => a.overallScore ?? 0))
    : null;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AuditSidebar user={user} plan={plan} />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-8 pt-8 pb-6 border-b border-border/30 bg-background/95 backdrop-blur-sm shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-semibold tracking-widest text-primary/70 uppercase">Signal Audit</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Historia analiz</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Wszystkie przeprowadzone audyty Signal Audit — kliknij, aby przejść do wyników.
              </p>
            </div>
            <Link href="/">
              <Button className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
                <Plus className="w-4 h-4" />
                Nowa analiza
              </Button>
            </Link>
          </div>

          {/* KPI row */}
          {totalAudits > 0 && (
            <div className="grid grid-cols-4 gap-4 mt-6">
              {[
                { label: "Łącznie analiz", value: totalAudits, icon: Activity, color: "text-foreground" },
                { label: "Ukończonych", value: completedAudits, icon: CheckCircle, color: "text-emerald-400" },
                { label: "Średni wynik", value: avgScore != null ? `${avgScore}/100` : "–", icon: BarChart2, color: avgScore != null ? scoreColor(avgScore) : "text-muted-foreground" },
                { label: "Najlepszy wynik", value: bestScore != null ? `${Math.round(bestScore)}/100` : "–", icon: TrendingUp, color: bestScore != null ? scoreColor(bestScore) : "text-muted-foreground" },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="rounded-xl border border-border/50 bg-card/50 p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <Icon className={`w-4 h-4 ${color}`} />
                    <span className="text-xs">{label}</span>
                  </div>
                  <span className={`text-xl font-bold tabular-nums ${color}`}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Filters bar */}
        <div className="px-8 py-4 border-b border-border/20 bg-background/80 shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-48 max-w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Szukaj po URL lub tytule..."
                className="pl-9 h-8 text-xs bg-muted/30 border-border/50"
              />
            </div>

            {/* Score filter */}
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              {(["all", "great", "ok", "poor"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setScoreFilter(f)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    scoreFilter === f
                      ? f === "all" ? "bg-primary/20 text-primary border border-primary/30"
                        : f === "great" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : f === "ok" ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        : "bg-red-500/20 text-red-400 border border-red-500/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent"
                  }`}
                >
                  {f === "all" ? "Wszystkie" : f === "great" ? "≥75" : f === "ok" ? "50–74" : "<50"}
                </button>
              ))}
            </div>

            {/* Sort */}
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-xs text-muted-foreground">Sortuj:</span>
              {(["date", "score", "url"] as const).map(key => (
                <button
                  key={key}
                  onClick={() => toggleSort(key)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
                    sortKey === key
                      ? "bg-muted/60 text-foreground border-border/60"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/30 border-transparent"
                  }`}
                >
                  {key === "date" ? "Data" : key === "score" ? "Wynik" : "URL"}
                  {sortKey === key && (sortDir === "desc" ? <SortDesc className="w-3 h-3" /> : <SortAsc className="w-3 h-3" />)}
                </button>
              ))}
            </div>

            {/* Count */}
            <span className="text-xs text-muted-foreground shrink-0">
              {filtered.length} {filtered.length === 1 ? "wynik" : filtered.length < 5 ? "wyniki" : "wyników"}
            </span>
          </div>
        </div>

        {/* Audit list */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 && totalAudits === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6">
                <Search className="w-8 h-8 text-primary/60" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Brak analiz</h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-6">
                Nie przeprowadziłeś jeszcze żadnej analizy Signal Audit. Zacznij od sprawdzenia swojej pierwszej strony.
              </p>
              <Link href="/">
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  Sprawdź pierwszą stronę
                </Button>
              </Link>
            </div>
          ) : filtered.length === 0 ? (
            /* No results for filter */
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm text-muted-foreground">Brak wyników dla wybranych filtrów.</p>
              <button onClick={() => { setSearch(""); setScoreFilter("all"); }} className="text-xs text-primary hover:underline mt-2">
                Wyczyść filtry
              </button>
            </div>
          ) : isGrouped && groupedByDomain ? (
            // Domain-grouped view
            <div className="max-w-4xl">
              {groupedByDomain.map(([domain, audits]) => (
                <DomainGroup
                  key={domain}
                  domain={domain}
                  audits={audits}
                  defaultOpen={!collapsedDomains.has(domain)}
                />
              ))}
            </div>
          ) : (
            // Flat list (single domain)
            <div className="space-y-3 max-w-4xl">
              {filtered.map(audit => (
                <AuditCard key={audit.id} audit={audit} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
