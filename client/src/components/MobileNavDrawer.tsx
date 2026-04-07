import { useState } from "react";
import { Link } from "wouter";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Menu, Bot, Zap, LayoutDashboard, Search, Eye, PenLine, Star,
  Shield, Trophy, LogIn, ChevronRight,
} from "lucide-react";

interface MobileNavDrawerProps {
  activeRoute: "hub" | "audit" | "ai-monitoring" | "page-creator" | "pricing";
  plan: string;
  userName?: string | null;
  onLogout: () => void;
}

function planLabel(plan: string): string {
  if (plan === "business") return "Business";
  if (plan === "pro") return "Pro";
  if (plan === "starter") return "Starter";
  return "Free";
}

function planColorClass(plan: string): string {
  if (plan === "business") return "text-amber-400 bg-amber-400/10";
  if (plan === "pro") return "text-violet-400 bg-violet-400/10";
  if (plan === "starter") return "text-sky-400 bg-sky-400/10";
  return "text-muted-foreground bg-muted/30";
}

export function MobileNavDrawer({ activeRoute, plan, userName, onLogout }: MobileNavDrawerProps) {
  const [open, setOpen] = useState(false);

  const isBusiness = plan === "business";
  const isPro = plan === "pro";

  const navItems = [
    { href: "/hub", label: "AI HUB", icon: LayoutDashboard, key: "hub" },
    { href: "/audit", label: "AI Audit", icon: Search, key: "audit" },
    { href: "/ai-monitoring", label: "AI Monitoring", icon: Eye, key: "ai-monitoring" },
    { href: "/page-creator", label: "AI Writer", icon: PenLine, key: "page-creator" },
    { href: "/pricing", label: "Plany i cennik", icon: Star, key: "pricing" },
  ] as const;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground"
          aria-label="Otwórz menu"
        >
          <Menu className="w-5 h-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0 bg-card border-r border-border/40 flex flex-col">
        {/* Logo */}
        <div className="h-14 flex items-center gap-2 px-4 border-b border-border/30 shrink-0">
          <Link href="/" onClick={() => setOpen(false)}>
            <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shadow-sm shadow-primary/20">
                <Bot className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="text-sm font-bold tracking-tight">GEO-Auditor</span>
            </div>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 flex flex-col gap-0.5 overflow-y-auto">
          {/* Primary CTA */}
          <Link href="/" onClick={() => setOpen(false)}>
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors mb-2 shadow-sm shadow-primary/30">
              <Zap className="w-3.5 h-3.5" />
              Nowa analiza
            </div>
          </Link>

          {navItems.map((item) => {
            const isActive = activeRoute === item.key;
            const isHub = item.key === "hub";
            return (
              <Link key={item.key} href={item.href} onClick={() => setOpen(false)}>
                <div
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    isHub
                      ? "bg-violet-500/10 border border-violet-500/20 text-violet-400 font-semibold"
                      : isActive
                      ? "bg-muted/60 text-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  }`}
                >
                  <item.icon className="w-3.5 h-3.5 shrink-0" />
                  {item.label}
                  {isHub && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                  )}
                </div>
              </Link>
            );
          })}

          {/* AI Writer upsell widget */}
          <div className="mt-auto pt-3">
            <Link href="/page-creator" onClick={() => setOpen(false)}>
              <div className="rounded-xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/8 via-teal-500/5 to-transparent p-3 cursor-pointer hover:border-emerald-500/40 hover:from-emerald-500/12 transition-all group">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <PenLine className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
                  <span className="text-[11px] font-bold text-emerald-300">AI Writer</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-snug">
                  Uwaga! Możesz tworzyć także zoptymalizowane pod AI Search — od zera, gotowe do publikacji.
                </p>
                <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-emerald-400 group-hover:gap-1.5 transition-all">
                  Stwórz świetny content <ChevronRight className="w-3 h-3" />
                </div>
              </div>
            </Link>
          </div>
        </nav>

        {/* User + Plan footer */}
        <div className="px-3 py-4 border-t border-border/30 space-y-2 shrink-0">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${planColorClass(plan)}`}>
            {isBusiness ? <Trophy className="w-3.5 h-3.5" /> : isPro ? <Star className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
            <span className="font-semibold">{planLabel(plan)}</span>
          </div>
          {userName && (
            <div className="px-3 py-1.5 text-xs text-muted-foreground truncate">{userName}</div>
          )}
          <button
            onClick={() => { setOpen(false); onLogout(); }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            <LogIn className="w-3.5 h-3.5 rotate-180" />
            Wyloguj
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
