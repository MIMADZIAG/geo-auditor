import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { X, TrendingUp, Brain, BarChart3, Eye, Zap, ArrowRight, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";

// Only these two labels trigger the modal — all other tiers are safe
type UpsellTier = "Niewidoczny" | "Startujący";

interface UpsellProModalProps {
  isOpen: boolean;
  onClose: () => void;
  scoreLabel: UpsellTier;
  score: number;
}

const COPY: Record<UpsellTier, {
  urgency: string;
  headline: string;
  subheadline: string;
  badge: string;
  badgeColor: string;
  gainText: string;
  ctaText: string;
  urgencyIcon: React.ElementType;
}> = {
  Niewidoczny: {
    urgency: "Twoja strona jest praktycznie niewidoczna dla AI Search",
    headline: "Twoja strona traci klientów na rzecz konkurentów w AI Search — każdego dnia.",
    subheadline: "ChatGPT, Perplexity i Google AI Overviews cytują inne strony zamiast Twojej. Plan Pro daje Ci narzędzia, żeby to zmienić.",
    badge: "Dolne 20% widoczności",
    badgeColor: "oklch(0.65 0.22 25)",
    gainText: "Strony takie jak Twoja zyskują średnio 18–28 pkt po wdrożeniu rekomendacji Pro.",
    ctaText: "Odblokowuję plan Pro — poprawiam widoczność",
    urgencyIcon: Flame,
  },
  Startujący: {
    urgency: "Twoja strona rzadko pojawia się w odpowiedziach AI",
    headline: "Masz solidne podstawy — brakuje Ci narzędzi, żeby wskoczyć do czołówki AI Search.",
    subheadline: "Twoja strona jest w dolnych 40% widoczności. Plan Pro odblokowuje Content Intelligence, monitoring i analizę konkurencji.",
    badge: "Dolne 40% widoczności",
    badgeColor: "oklch(0.78 0.18 75)",
    gainText: "Użytkownicy planu Pro notują średnio 15–25 pkt wzrostu po pierwszym miesiącu optymalizacji.",
    ctaText: "Przejdź na plan Pro — zacznij rosnąć",
    urgencyIcon: TrendingUp,
  },
};

const PRO_FEATURES = [
  {
    icon: Brain,
    title: "Content Intelligence",
    desc: "AI analizuje Twoją treść pod kątem 5 wymiarów cytowalności — Answer Density, Factual Density, Citation Readiness i więcej.",
    color: "oklch(0.72 0.18 280)",
  },
  {
    icon: Eye,
    title: "Monitoring 50 podstron",
    desc: "Automatyczne cotygodniowe audyty. Dowiesz się natychmiast, gdy Twój wynik spada lub konkurent Cię wyprzedza.",
    color: "oklch(0.72 0.18 145)",
  },
  {
    icon: BarChart3,
    title: "Analiza konkurencji",
    desc: "Sprawdź, dlaczego 3 konkurentów jest cytowanych zamiast Ciebie — i co konkretnie robią inaczej.",
    color: "oklch(0.72 0.18 200)",
  },
  {
    icon: Zap,
    title: "200 audytów miesięcznie",
    desc: "Audytuj cały sklep, blog lub portfolio klientów. Bez limitów na jedną podstronę.",
    color: "oklch(0.78 0.18 75)",
  },
];

export default function UpsellProModal({ isOpen, onClose, scoreLabel, score }: UpsellProModalProps) {
  const [, navigate] = useLocation();
  const overlayRef = useRef<HTMLDivElement>(null);

  // ── Early return BEFORE any COPY access ──────────────────────────────────────
  // This prevents crashes when scoreLabel is not a key of COPY (defensive guard)
  if (!isOpen) return null;
  const copy = COPY[scoreLabel] ?? COPY["Startujący"];
  const UrgencyIcon = copy.urgencyIcon;

  return (
    <_UpsellProModalInner
      overlayRef={overlayRef}
      onClose={onClose}
      navigate={navigate}
      copy={copy}
      UrgencyIcon={UrgencyIcon}
      score={score}
    />
  );
}

// Inner component — only rendered when isOpen=true and copy is guaranteed defined
function _UpsellProModalInner({
  overlayRef,
  onClose,
  navigate,
  copy,
  UrgencyIcon,
  score,
}: {
  overlayRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  navigate: (path: string) => void;
  copy: typeof COPY[UpsellTier];
  UrgencyIcon: React.ElementType;
  score: number;
}) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const handleCTA = () => {
    onClose();
    navigate("/pricing");
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "oklch(0 0 0 / 0.75)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border bg-card shadow-2xl"
        style={{ borderColor: "oklch(0.3 0.05 280 / 0.6)" }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          aria-label="Zamknij"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header gradient band */}
        <div
          className="px-6 pt-6 pb-5 rounded-t-2xl"
          style={{ background: "linear-gradient(135deg, oklch(0.18 0.04 280 / 0.8), oklch(0.15 0.02 250 / 0.9))" }}
        >
          {/* Urgency badge */}
          <div className="flex items-center gap-2 mb-3">
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
              style={{ background: `${copy.badgeColor}20`, color: copy.badgeColor, border: `1px solid ${copy.badgeColor}40` }}
            >
              <UrgencyIcon className="w-3 h-3" />
              {copy.badge}
            </div>
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-primary/15 text-primary border border-primary/30">
              Wynik: {score}/100
            </div>
          </div>

          <h2 className="text-lg font-bold text-foreground leading-snug mb-2">
            {copy.headline}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {copy.subheadline}
          </p>
        </div>

        {/* Features grid */}
        <div className="px-6 py-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Co odblokowujesz w planie Pro
          </p>
          <div className="space-y-3">
            {PRO_FEATURES.map((feat) => (
              <div
                key={feat.title}
                className="flex items-start gap-3 p-3 rounded-xl border"
                style={{ background: `${feat.color}08`, borderColor: `${feat.color}20` }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${feat.color}15` }}
                >
                  <feat.icon className="w-4 h-4" style={{ color: feat.color }} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">{feat.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{feat.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Social proof / gain estimate */}
          <div className="mt-4 px-3 py-2.5 rounded-xl bg-primary/8 border border-primary/20">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-semibold text-primary">📈 </span>
              {copy.gainText}
            </p>
          </div>
        </div>

        {/* CTA footer */}
        <div className="px-6 pb-6 flex flex-col gap-2">
          <Button
            onClick={handleCTA}
            className="w-full gap-2 font-semibold"
            size="lg"
          >
            {copy.ctaText}
            <ArrowRight className="w-4 h-4" />
          </Button>
          <button
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            Zostanę na planie darmowym — kontynuuj przeglądanie raportu
          </button>
        </div>
      </div>
    </div>
  );
}
