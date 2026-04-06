import { useLocation, Link } from "wouter";
import { Bot, LayoutDashboard, Activity, Plus, LogIn, ChevronDown, User, Eye } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";

interface ResultsSidebarProps {
  activeTab: "visibility" | "optimization" | "rewrite";
  onTabChange: (tab: "visibility" | "optimization" | "rewrite") => void;
  auditUrl?: string;
  citedEngines?: number;
  totalEngines?: number;
  citationStatus?: string;
}

export function ResultsSidebar({
  activeTab,
  onTabChange,
  auditUrl,
  citedEngines,
  totalEngines = 4,
  citationStatus,
}: ResultsSidebarProps) {
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();

  const navItems = [
    {
      id: "visibility" as const,
      label: "AI Visibility Check",
      sublabel: citationStatus === "done"
        ? `${citedEngines ?? 0}/${totalEngines} silników`
        : citationStatus === "running"
        ? "Analizuję…"
        : "Jednorazowe sprawdzenie",
      icon: (
        <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
          <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5"/>
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2"/>
          <circle cx="8" cy="8" r="1" fill="currentColor"/>
        </svg>
      ),
      accent: citationStatus === "done"
        ? (citedEngines ?? 0) > 0 ? "text-emerald-400" : "text-amber-400"
        : "text-primary",
    },
    {
      id: "optimization" as const,
      label: "Diagnoza techniczna",
      sublabel: "Signal Audit",
      icon: <Activity className="w-4 h-4" />,
      accent: "text-violet-400",
    },
    {
      id: "rewrite" as const,
      label: "Przepisz treść",
      sublabel: "Signal Rewrite",
      icon: (
        <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
          <path d="M2 12L6 4l4 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M3.5 9.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M10 4l2 2-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      accent: "text-purple-400",
    },
  ];

  return (
    <aside className="w-[200px] shrink-0 h-full flex flex-col border-r border-border/30 bg-card/40 backdrop-blur-sm">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-border/20 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shadow-sm shadow-primary/30">
          <Bot className="w-3.5 h-3.5 text-primary-foreground" />
        </div>
        <span className="text-sm font-bold tracking-tight text-foreground">GEO-Auditor</span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {/* Dashboard link */}
        <button
          onClick={() => navigate("/dashboard")}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors group"
        >
          <LayoutDashboard className="w-4 h-4 shrink-0" />
          <span className="text-xs font-medium">AI Visibility Hub</span>
        </button>

        {/* Separator */}
        <div className="h-px bg-border/20 mx-2 my-2" />

        {/* Audit tabs */}
        <div className="px-2 mb-1">
          <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest">Ten audyt</span>
        </div>

        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-start gap-2.5 px-2.5 py-2.5 rounded-lg transition-all ${
                isActive
                  ? "bg-primary/10 border border-primary/20 text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              }`}
            >
              <span className={`mt-0.5 shrink-0 ${isActive ? item.accent : ""}`}>{item.icon}</span>
              <div className="text-left min-w-0">
                <div className={`text-xs font-semibold leading-tight ${isActive ? "text-foreground" : ""}`}>
                  {item.label}
                </div>
                <div className={`text-[10px] mt-0.5 leading-tight ${isActive ? item.accent : "text-muted-foreground/60"}`}>
                  {item.sublabel}
                </div>
              </div>
            </button>
          );
        })}

        {/* Separator */}
        <div className="h-px bg-border/20 mx-2 my-2" />

        {/* Monitor link — track changes over time */}
        <Link href="/pulse">
          <div className="w-full flex items-start gap-2.5 px-2.5 py-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer">
            <Eye className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="text-left min-w-0">
              <div className="text-xs font-semibold leading-tight">Śledź zmiany</div>
              <div className="text-[10px] mt-0.5 leading-tight text-muted-foreground/60">AI Visibility Monitor</div>
            </div>
          </div>
        </Link>

        {/* New audit */}
        <button
          onClick={() => navigate("/")}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span className="text-xs font-medium">Nowy audyt</span>
        </button>
      </nav>

      {/* URL display */}
      {auditUrl && (
        <div className="px-3 py-2 border-t border-border/20 shrink-0">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 shrink-0" />
            <span className="text-[10px] text-muted-foreground/60 truncate leading-tight">
              {auditUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </span>
          </div>
        </div>
      )}

      {/* User section */}
      <div className="px-3 py-3 border-t border-border/20 shrink-0">
        {isAuthenticated && user ? (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
              <User className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-foreground truncate leading-tight">{user.name?.split(" ")[0] ?? "Użytkownik"}</div>
              <div className="text-[10px] text-muted-foreground/60 leading-tight">
                {(user as { plan?: string }).plan === "business" ? "Business" : (user as { plan?: string }).plan === "pro" ? "Pro" : "Free"}
              </div>
            </div>
            <ChevronDown className="w-3 h-3 text-muted-foreground/40 shrink-0" />
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => (window.location.href = getLoginUrl())}
            className="w-full gap-1.5 text-xs h-8"
          >
            <LogIn className="w-3 h-3" /> Zaloguj się
          </Button>
        )}
      </div>
    </aside>
  );
}
