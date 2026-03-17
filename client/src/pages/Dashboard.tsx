import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Brain,
  Plus,
  Trash2,
  ExternalLink,
  RefreshCw,
  Lock,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  AlertCircle,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  Shield,
  Zap,
  Bot,
  Code2,
  FileText,
  ChevronDown,
  ChevronUp,
  LogIn,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const FREE_SLOTS = 1;
const TOTAL_VISIBLE_SLOTS = 5;

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [addUrl, setAddUrl] = useState("");
  const [addLabel, setAddLabel] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedPage, setExpandedPage] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: monitoredPages = [], isLoading } = trpc.monitoring.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const addMutation = trpc.monitoring.add.useMutation({
    onSuccess: () => {
      toast.success("Page added to monitoring!");
      setAddUrl("");
      setAddLabel("");
      setShowAddForm(false);
      utils.monitoring.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to add page.");
    },
  });

  const removeMutation = trpc.monitoring.remove.useMutation({
    onSuccess: () => {
      toast.success("Page removed from monitoring.");
      utils.monitoring.list.invalidate();
    },
  });

  const auditMutation = trpc.audit.run.useMutation({
    onSuccess: (data) => {
      navigate(`/results/${data.auditId}`);
    },
    onError: (err) => {
      toast.error(err.message || "Audit failed.");
    },
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addUrl.trim()) return;
    let normalized = addUrl.trim();
    if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
      normalized = "https://" + normalized;
    }
    addMutation.mutate({ url: normalized, label: addLabel.trim() || undefined });
  };

  const handleRunAudit = (page: { id: number; url: string }) => {
    auditMutation.mutate({ url: page.url, monitoredPageId: page.id });
  };

  if (authLoading) return <DashboardSkeleton />;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <DashboardNav />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <LogIn className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold mb-3">Sign in to access your Dashboard</h2>
            <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
              Monitor your pages, track AI-Readiness scores over time, and get weekly alerts when
              your score changes.
            </p>
            <Button
              onClick={() => (window.location.href = getLoginUrl())}
              className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <LogIn className="w-4 h-4" />
              Sign In for Free
            </Button>
            <p className="text-xs text-muted-foreground mt-4">
              Free plan includes 1 monitored page + 5 audits/month
            </p>
          </div>
        </div>
      </div>
    );
  }

  const usedSlots = monitoredPages.length;
  const emptyLockedSlots = Math.max(0, TOTAL_VISIBLE_SLOTS - usedSlots - (usedSlots < FREE_SLOTS ? 1 : 0));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardNav user={user} />

      <main className="container max-w-5xl mx-auto py-10 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Monitoring Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track AI-Readiness scores for your most important pages
            </p>
          </div>
          {usedSlots < FREE_SLOTS && (
            <Button
              onClick={() => setShowAddForm(!showAddForm)}
              className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Plus className="w-4 h-4" />
              Add Page
            </Button>
          )}
        </div>

        {/* Add Page Form */}
        {showAddForm && (
          <div className="rounded-2xl bg-card border border-primary/20 p-6">
            <h3 className="font-semibold mb-4">Add a page to monitor</h3>
            <form onSubmit={handleAdd} className="space-y-3">
              <div className="flex gap-3">
                <Input
                  type="url"
                  placeholder="https://yoursite.com/product-page"
                  value={addUrl}
                  onChange={(e) => setAddUrl(e.target.value)}
                  className="flex-1 bg-background border-border/60"
                  required
                />
                <Input
                  type="text"
                  placeholder="Label (optional)"
                  value={addLabel}
                  onChange={(e) => setAddLabel(e.target.value)}
                  className="w-40 bg-background border-border/60"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={addMutation.isPending}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {addMutation.isPending ? "Adding..." : "Add & Schedule Audit"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowAddForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Monitored Pages */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Monitored Pages
            </h2>
            <span className="text-xs text-muted-foreground">
              {usedSlots} / {FREE_SLOTS} free slot used
            </span>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-24 rounded-2xl bg-card border border-border/50 animate-pulse" />
              ))}
            </div>
          ) : monitoredPages.length === 0 ? (
            <div className="rounded-2xl bg-card border border-border/50 p-10 text-center">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <BarChart3 className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">No pages monitored yet</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Add your most important page to track its AI-Readiness score over time.
              </p>
              <Button
                onClick={() => setShowAddForm(true)}
                className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <Plus className="w-4 h-4" />
                Add Your First Page
              </Button>
            </div>
          ) : (
            monitoredPages.map((page) => (
              <MonitoredPageCard
                key={page.id}
                page={page}
                isExpanded={expandedPage === page.id}
                onToggle={() => setExpandedPage(expandedPage === page.id ? null : page.id)}
                onRunAudit={() => handleRunAudit(page)}
                onRemove={() => removeMutation.mutate({ id: page.id })}
                isAuditing={auditMutation.isPending}
              />
            ))
          )}

          {/* Locked slots — PLG upsell */}
          {Array.from({ length: Math.min(emptyLockedSlots + (usedSlots >= FREE_SLOTS ? 1 : 0), 4) }).map((_, i) => (
            <LockedSlot key={i} />
          ))}
        </div>

        {/* PLG Upgrade Banner */}
        <UpgradeBanner />

        {/* Recent Audits */}
        <RecentAudits />
      </main>
    </div>
  );
}

// ─── Monitored Page Card ──────────────────────────────────────────────────────

function MonitoredPageCard({
  page,
  isExpanded,
  onToggle,
  onRunAudit,
  onRemove,
  isAuditing,
}: {
  page: {
    id: number;
    url: string;
    label: string | null;
    lastScore: number | null;
    lastAuditAt: Date | null;
    nextAuditAt: Date | null;
    lastAuditId: number | null;
  };
  isExpanded: boolean;
  onToggle: () => void;
  onRunAudit: () => void;
  onRemove: () => void;
  isAuditing: boolean;
}) {
  const [, navigate] = useLocation();
  const score = page.lastScore;
  const scoreColor = score != null ? getScoreColor(score) : "oklch(0.5 0.01 250)";

  const { data: snapshots } = trpc.monitoring.getSnapshots.useQuery(
    { monitoredPageId: page.id, limit: 8 },
    { enabled: isExpanded }
  );

  const chartData = snapshots
    ? [...snapshots].reverse().map((s, i) => ({
        name: i === snapshots.length - 1 ? "Now" : `${snapshots.length - 1 - i}w ago`,
        score: Math.round(s.overallScore),
      }))
    : [];

  const trend =
    snapshots && snapshots.length >= 2
      ? snapshots[0]!.overallScore - snapshots[1]!.overallScore
      : null;

  return (
    <div className="rounded-2xl bg-card border border-border/50 overflow-hidden">
      <div className="flex items-center gap-4 p-5">
        {/* Score */}
        <div
          className="w-14 h-14 rounded-xl flex flex-col items-center justify-center shrink-0 border"
          style={{ borderColor: `${scoreColor}40`, background: `${scoreColor}10` }}
        >
          {score != null ? (
            <>
              <span className="text-lg font-bold leading-none" style={{ color: scoreColor }}>
                {Math.round(score)}
              </span>
              <span className="text-[9px] text-muted-foreground mt-0.5">/100</span>
            </>
          ) : (
            <Clock className="w-5 h-5 text-muted-foreground" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-semibold text-sm truncate">
              {page.label || new URL(page.url).hostname}
            </span>
            {trend != null && (
              <TrendBadge trend={trend} />
            )}
          </div>
          <a
            href={page.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground truncate flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <ExternalLink className="w-3 h-3 shrink-0" />
            {page.url}
          </a>
          {page.lastAuditAt && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Last audit: {new Date(page.lastAuditAt).toLocaleDateString()} ·{" "}
              {page.nextAuditAt
                ? `Next: ${new Date(page.nextAuditAt).toLocaleDateString()}`
                : "Scheduled"}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {page.lastAuditId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/results/${page.lastAuditId}`)}
              className="h-8 text-xs gap-1.5"
            >
              View Report
              <ArrowRight className="w-3 h-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onRunAudit}
            disabled={isAuditing}
            className="h-8 w-8 p-0"
            title="Run audit now"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isAuditing ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className="h-8 w-8 p-0"
            title="Show history"
          >
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            title="Remove"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Expanded: Score History Chart */}
      {isExpanded && (
        <div className="border-t border-border/40 p-5">
          {chartData.length >= 2 ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-semibold">Score History</h4>
                <span className="text-xs text-muted-foreground">{chartData.length} data points</span>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.015 250)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "oklch(0.55 0.01 250)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: "oklch(0.55 0.01 250)" }}
                    axisLine={false}
                    tickLine={false}
                    width={28}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "oklch(0.14 0.015 250)",
                      border: "1px solid oklch(0.22 0.015 250)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(value: number) => [`${value}/100`, "AI-Readiness"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="oklch(0.65 0.22 260)"
                    strokeWidth={2}
                    dot={{ fill: "oklch(0.65 0.22 260)", r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-center py-6">
              <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Run at least 2 audits to see the score history chart.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={onRunAudit}
                className="mt-3 gap-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Run Audit Now
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Locked Slot ─────────────────────────────────────────────────────────────

function LockedSlot() {
  return (
    <div className="rounded-2xl border border-dashed border-border/40 p-5 flex items-center gap-4 opacity-60">
      <div className="w-14 h-14 rounded-xl bg-muted/30 flex items-center justify-center shrink-0">
        <Lock className="w-5 h-5 text-muted-foreground" />
      </div>
      <div className="flex-1">
        <div className="h-3 bg-muted/40 rounded w-32 mb-2" />
        <div className="h-2.5 bg-muted/30 rounded w-48" />
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => toast.info("Upgrade to Starter to unlock more monitoring slots!")}
        className="gap-1.5 text-xs shrink-0 border-primary/30 text-primary hover:bg-primary/10"
      >
        <Lock className="w-3 h-3" />
        Unlock
      </Button>
    </div>
  );
}

// ─── Trend Badge ─────────────────────────────────────────────────────────────

function TrendBadge({ trend }: { trend: number }) {
  if (Math.abs(trend) < 1) {
    return (
      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
        <Minus className="w-3 h-3" />
        No change
      </span>
    );
  }
  const isPositive = trend > 0;
  return (
    <span
      className={`flex items-center gap-0.5 text-[10px] font-semibold ${
        isPositive ? "text-emerald-400" : "text-red-400"
      }`}
    >
      {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {isPositive ? "+" : ""}
      {Math.round(trend)} pts
    </span>
  );
}

// ─── Upgrade Banner ───────────────────────────────────────────────────────────
function UpgradeBanner() {
  const [, navigate] = useLocation();
  const { data: myPlan } = trpc.payments.getMyPlan.useQuery();

  // Don't show banner if user is on a paid plan
  if (myPlan && myPlan.plan !== "free") return null;

  return (
    <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-violet-500/5 to-indigo-500/5 border border-primary/20 p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold mb-1">Upgrade to Starter — $39/month</h3>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              Monitor up to 10 pages
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              Full score history & alerts
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              50 audits/month
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              PDF export
            </span>
          </div>
        </div>
        <Button
          onClick={() => navigate("/pricing")}
          className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0 gap-2"
        >
          Upgrade
          <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Recent Audits ────────────────────────────────────────────────────────────

function RecentAudits() {
  const [, navigate] = useLocation();
  const { data: history, isLoading } = trpc.audit.myHistory.useQuery({ limit: 5 });

  if (isLoading) return null;
  if (!history || history.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
        Recent Audits
      </h2>
      <div className="space-y-2">
        {history.map((audit) => {
          const score = audit.overallScore ?? 0;
          const scoreColor = getScoreColor(score);
          return (
            <button
              key={audit.id}
              onClick={() => navigate(`/results/${audit.id}`)}
              className="w-full flex items-center gap-4 p-4 rounded-xl bg-card border border-border/50 hover:border-primary/30 transition-colors text-left"
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold"
                style={{ color: scoreColor, background: `${scoreColor}15` }}
              >
                {Math.round(score)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{audit.pageTitle || audit.url}</div>
                <div className="text-xs text-muted-foreground truncate">{audit.url}</div>
              </div>
              <div className="text-xs text-muted-foreground shrink-0">
                {new Date(audit.createdAt).toLocaleDateString()}
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Dashboard Nav ────────────────────────────────────────────────────────────

function DashboardNav({ user }: { user?: { name?: string | null } | null }) {
  const [, navigate] = useLocation();
  const { logout } = useAuth();

  return (
    <nav className="sticky top-0 z-40 border-b border-border/40 bg-background/90 backdrop-blur-xl">
      <div className="container flex items-center justify-between h-16">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <Brain className="w-4 h-4 text-primary" />
            </div>
            <span className="font-semibold text-foreground tracking-tight">GEO-Auditor</span>
          </button>
          <div className="h-4 w-px bg-border" />
          <span className="text-sm text-muted-foreground">Dashboard</span>
        </div>
        <div className="flex items-center gap-3">
          {user?.name && (
            <span className="text-xs text-muted-foreground hidden sm:block">{user.name}</span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/sandbox")}
            className="text-xs gap-1.5 text-violet-400 hover:text-violet-300 hidden sm:flex"
          >
            AI Sandbox
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/page-creator")}
            className="text-xs gap-1.5 text-emerald-400 hover:text-emerald-300 hidden sm:flex"
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI Page Creator
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="text-xs gap-1.5"
          >
            New Audit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="text-xs text-muted-foreground"
          >
            Sign Out
          </Button>
        </div>
      </div>
    </nav>
  );
}

// ─── Dashboard Skeleton ───────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="h-16 border-b border-border/40 bg-background/90" />
      <div className="container max-w-5xl mx-auto py-10 space-y-6">
        <div className="h-8 bg-muted/30 rounded w-48 animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-card border border-border/50 animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getScoreColor(score: number): string {
  if (score >= 80) return "oklch(0.72 0.18 145)";
  if (score >= 60) return "oklch(0.72 0.18 160)";
  if (score >= 40) return "oklch(0.78 0.18 75)";
  return "oklch(0.65 0.22 25)";
}
