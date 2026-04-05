/**
 * ScoreReveal — Emotional payoff after the full Citation Intelligence sequence.
 *
 * Architecture (Profound/Perplexity engineering standard):
 * - Appears AFTER EmotionalTensionFeed completes (400ms delay post-isDone).
 * - Animates X/4 with count-up (0→X, 1.2s ease-out cubic).
 * - SVG ring fills progressively as count-up runs — visual and numeric in sync.
 * - Three emotional variants: 0/4 (critical), 1-2/4 (opportunity), 3-4/4 (leader).
 * - Fade-in + slide-up on mount — feels like a reveal, not a pop-in.
 * - Does NOT duplicate the completed-state hero (which shows AI Visibility Score /100).
 *   This component is the bridge between running and completed states.
 * - Per-engine status grid: each engine reveals sequentially with staggered delay.
 */

import { useEffect, useRef, useState } from "react";
import { useCountUp } from "../hooks/useCountUp";
import { ENGINE_CONFIG, ALL_ENGINES } from "../../../shared/visibilityScore";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScoreRevealEngine {
  engine: "chatgpt" | "google" | "perplexity" | "gemini";
  cited: boolean;
}

interface Props {
  /** Number of engines that cited the page (0–4) */
  citedEngines: number;
  /** Total engines checked */
  totalEngines: number;
  /** Per-engine citation status for the breakdown grid */
  engineResults: ScoreRevealEngine[];
  /** Whether to start the reveal animation */
  visible: boolean;
  /** Top competitor domain for personalized pain messaging (e.g. "zalando.pl") */
  topCompetitor?: string | null;
}

// ─── Emotional copy variants ──────────────────────────────────────────────────

interface EmotionalVariant {
  headline: string;
  subtext: string;
  ringColor: string;
  ringBg: string;
  badgeColor: string;
  badgeText: string;
  glowClass: string;
}

function getEmotionalVariant(cited: number, total: number): EmotionalVariant {
  const ratio = cited / total;

  if (cited === 0) {
    return {
      headline: "Żaden silnik AI Cię nie poleca",
      subtext: "To punkt startowy. Każda zmiana, którą wprowadzisz, ma szansę na pierwsze cytowanie.",
      ringColor: "#ef4444",
      ringBg: "rgba(239,68,68,0.08)",
      badgeColor: "bg-red-500/15 border-red-500/25 text-red-400",
      badgeText: "Niewidoczny",
      glowClass: "shadow-red-500/10",
    };
  }

  if (ratio <= 0.5) {
    return {
      headline: cited === 1 ? "1 silnik AI Cię cytuje" : `${cited} silniki AI Cię cytują`,
      subtext: "Dobry start. Pozostałe silniki są w zasięgu — wymagają kilku konkretnych zmian.",
      ringColor: "#f59e0b",
      ringBg: "rgba(245,158,11,0.08)",
      badgeColor: "bg-amber-500/15 border-amber-500/25 text-amber-400",
      badgeText: "Widoczny częściowo",
      glowClass: "shadow-amber-500/10",
    };
  }

  if (ratio < 1) {
    return {
      headline: `${cited} z ${total} silników AI Cię cytuje`,
      subtext: "Silna pozycja. Jeden krok od pełnej widoczności w AI Search.",
      ringColor: "#10b981",
      ringBg: "rgba(16,185,129,0.08)",
      badgeColor: "bg-emerald-500/15 border-emerald-500/25 text-emerald-400",
      badgeText: "Dobrze widoczny",
      glowClass: "shadow-emerald-500/10",
    };
  }

  // 4/4
  return {
    headline: "Wszystkie silniki AI Cię cytują",
    subtext: "Twoja strona jest w pełni widoczna w AI Search. Teraz czas na monitoring i utrzymanie pozycji.",
    ringColor: "#6366f1",
    ringBg: "rgba(99,102,241,0.08)",
    badgeColor: "bg-indigo-500/15 border-indigo-500/25 text-indigo-400",
    badgeText: "Lider AI Search",
    glowClass: "shadow-indigo-500/15",
  };
}

// ─── SVG Ring ─────────────────────────────────────────────────────────────────

interface RingProps {
  /** Current animated value (0 to total) */
  value: number;
  total: number;
  color: string;
  size?: number;
  strokeWidth?: number;
}

function AnimatedRing({ value, total, color, size = 120, strokeWidth = 8 }: RingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? value / total : 0;
  // Offset: 0 = full ring, circumference = empty ring
  const dashOffset = circumference * (1 - progress);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="rotate-[-90deg]"
      aria-hidden="true"
    >
      {/* Track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.05)"
        strokeWidth={strokeWidth}
      />
      {/* Progress arc */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        style={{ transition: "stroke-dashoffset 0.05s linear" }}
      />
    </svg>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function ScoreReveal({ citedEngines, totalEngines, engineResults, visible, topCompetitor }: Props) {
  const [mounted, setMounted] = useState(false);
  const mountedRef = useRef(false);

  // Trigger mount animation after a 400ms delay — gives EmotionalTensionFeed time to
  // display its final state before the reveal appears.
  useEffect(() => {
    if (!visible || mountedRef.current) return;
    const timer = setTimeout(() => {
      setMounted(true);
      mountedRef.current = true;
    }, 400);
    return () => clearTimeout(timer);
  }, [visible]);

  // Count-up: 0 → citedEngines, 1.2s ease-out, starts 200ms after mount
  const { value: animatedCount } = useCountUp({
    target: citedEngines,
    from: 0,
    duration: 1200,
    enabled: mounted,
    delay: 200,
  });

  const variant = getEmotionalVariant(citedEngines, totalEngines);

  if (!visible) return null;

  return (
    <div
      className={`
        rounded-2xl border overflow-hidden
        transition-all duration-700 ease-out
        shadow-2xl ${variant.glowClass}
        ${mounted
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-4"
        }
      `}
      style={{ borderColor: `${variant.ringColor}30`, background: variant.ringBg }}
    >
      {/* Header bar */}
      <div className="px-5 pt-4 pb-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">
          Wynik Citation Intelligence
        </span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${variant.badgeColor}`}>
          {variant.badgeText}
        </span>
      </div>

      {/* Main reveal area */}
      <div className="px-5 py-6">
        <div className="flex items-center gap-6">
          {/* Ring + count */}
          <div className="relative flex-shrink-0 w-[120px] h-[120px]">
            <AnimatedRing
              value={animatedCount}
              total={totalEngines}
              color={variant.ringColor}
              size={120}
              strokeWidth={9}
            />
            {/* Center number */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className="text-4xl font-black tabular-nums leading-none"
                style={{ color: variant.ringColor }}
              >
                {animatedCount}
              </span>
              <span className="text-xs text-zinc-500 font-medium mt-0.5">
                /{totalEngines}
              </span>
            </div>
          </div>

          {/* Headline + subtext */}
          <div className="flex-1 min-w-0">
            <h3
              className="text-lg font-bold leading-tight mb-2"
              style={{ color: variant.ringColor }}
            >
              {variant.headline}
            </h3>
            {/* Personalized pain state — show competitor when 0/4 or 1/4 */}
            {topCompetitor && citedEngines <= 1 ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-orange-500/8 border border-orange-500/20">
                  <span className="text-[10px] text-orange-400/70 font-medium shrink-0">Zamiast Ciebie:</span>
                  <span className="text-sm font-bold text-orange-300 font-mono truncate">{topCompetitor}</span>
                </div>
                <p className="text-xs text-zinc-500 leading-relaxed">{variant.subtext}</p>
              </div>
            ) : (
              <p className="text-sm text-zinc-400 leading-relaxed">{variant.subtext}</p>
            )}
          </div>
        </div>

        {/* Per-engine breakdown — staggered reveal */}
        <div className="mt-5 pt-4 border-t border-white/5">
          <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-semibold mb-3">
            Status w silnikach AI
          </p>
          <div className="grid grid-cols-4 gap-2">
            {ALL_ENGINES.map((engine, idx) => {
              const cfg = ENGINE_CONFIG[engine];
              const result = engineResults.find(r => r.engine === engine);
              const isCited = result?.cited ?? false;
              // Stagger: each engine reveals 120ms after the previous
              const staggerDelay = 200 + idx * 120;

              return (
                <div
                  key={engine}
                  className={`
                    flex flex-col items-center gap-1.5 p-2.5 rounded-xl border
                    transition-all duration-500 ease-out
                    ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}
                    ${isCited
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-white/5 bg-zinc-800/30"
                    }
                  `}
                  style={{
                    transitionDelay: mounted ? `${staggerDelay}ms` : "0ms",
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: isCited ? cfg.color : "#3f3f46" }}
                  >
                    {cfg.shortLabel[0]}
                  </div>
                  <span className="text-[10px] text-zinc-400 text-center leading-tight font-medium">
                    {cfg.shortLabel}
                  </span>
                  <span className={`text-[9px] font-semibold ${isCited ? "text-emerald-400" : "text-zinc-600"}`}>
                    {isCited ? "✓ Cytuje" : "– Brak"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
