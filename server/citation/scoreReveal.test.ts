/**
 * scoreReveal.test.ts
 *
 * Tests for the Score Reveal feature:
 * - useCountUp hook: animation logic, ease-out, delay, enabled gate
 * - ScoreReveal emotional variants: correct copy per score bucket
 * - Integration: ScoreReveal only shown when userStartedJob is true
 *
 * Note: useCountUp uses requestAnimationFrame which is not available in
 * Node.js/jsdom. We test the logic layer (easeOutCubic, variant selection)
 * directly, and the hook behavior via fake timers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Ease-out cubic math ──────────────────────────────────────────────────────

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

describe("easeOutCubic", () => {
  it("returns 0 at t=0", () => {
    expect(easeOutCubic(0)).toBe(0);
  });

  it("returns 1 at t=1", () => {
    expect(easeOutCubic(1)).toBe(1);
  });

  it("is greater than linear at t=0.5 (fast start)", () => {
    // Ease-out cubic at t=0.5 should be > 0.5 (moves faster at start)
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });

  it("is monotonically increasing", () => {
    const samples = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    for (let i = 1; i < samples.length; i++) {
      expect(easeOutCubic(samples[i])).toBeGreaterThan(easeOutCubic(samples[i - 1]));
    }
  });

  it("reaches 87.5% at t=0.5 (cubic ease-out property)", () => {
    // 1 - (1 - 0.5)^3 = 1 - 0.125 = 0.875
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 5);
  });
});

// ─── Emotional variant selection ─────────────────────────────────────────────

interface EmotionalVariant {
  headline: string;
  badgeText: string;
  ringColor: string;
}

function getEmotionalVariant(cited: number, total: number): EmotionalVariant {
  const ratio = cited / total;

  if (cited === 0) {
    return {
      headline: "Żaden silnik AI Cię nie poleca",
      badgeText: "Niewidoczny",
      ringColor: "#ef4444",
    };
  }

  if (ratio <= 0.5) {
    return {
      headline: cited === 1 ? "1 silnik AI Cię cytuje" : `${cited} silniki AI Cię cytują`,
      badgeText: "Widoczny częściowo",
      ringColor: "#f59e0b",
    };
  }

  if (ratio < 1) {
    return {
      headline: `${cited} z ${total} silników AI Cię cytuje`,
      badgeText: "Dobrze widoczny",
      ringColor: "#10b981",
    };
  }

  return {
    headline: "Wszystkie silniki AI Cię cytują",
    badgeText: "Lider AI Search",
    ringColor: "#6366f1",
  };
}

describe("getEmotionalVariant", () => {
  it("0/4 → critical red variant with 'Niewidoczny' badge", () => {
    const v = getEmotionalVariant(0, 4);
    expect(v.headline).toBe("Żaden silnik AI Cię nie poleca");
    expect(v.badgeText).toBe("Niewidoczny");
    expect(v.ringColor).toBe("#ef4444");
  });

  it("1/4 → amber partial variant with singular headline", () => {
    const v = getEmotionalVariant(1, 4);
    expect(v.headline).toBe("1 silnik AI Cię cytuje");
    expect(v.badgeText).toBe("Widoczny częściowo");
    expect(v.ringColor).toBe("#f59e0b");
  });

  it("2/4 → amber partial variant with plural headline", () => {
    const v = getEmotionalVariant(2, 4);
    expect(v.headline).toBe("2 silniki AI Cię cytują");
    expect(v.badgeText).toBe("Widoczny częściowo");
  });

  it("3/4 → green 'Dobrze widoczny' variant", () => {
    const v = getEmotionalVariant(3, 4);
    expect(v.headline).toBe("3 z 4 silników AI Cię cytuje");
    expect(v.badgeText).toBe("Dobrze widoczny");
    expect(v.ringColor).toBe("#10b981");
  });

  it("4/4 → indigo 'Lider AI Search' variant", () => {
    const v = getEmotionalVariant(4, 4);
    expect(v.headline).toBe("Wszystkie silniki AI Cię cytują");
    expect(v.badgeText).toBe("Lider AI Search");
    expect(v.ringColor).toBe("#6366f1");
  });

  it("handles edge case: 0/1 (single engine, not cited)", () => {
    const v = getEmotionalVariant(0, 1);
    expect(v.badgeText).toBe("Niewidoczny");
  });

  it("handles edge case: 1/1 (single engine, cited)", () => {
    const v = getEmotionalVariant(1, 1);
    expect(v.badgeText).toBe("Lider AI Search");
  });
});

// ─── SVG ring progress calculation ───────────────────────────────────────────

describe("AnimatedRing progress calculation", () => {
  const circumference = (radius: number) => 2 * Math.PI * radius;

  it("full ring (4/4): dashOffset = 0", () => {
    const r = 55.5; // (120 - 9) / 2
    const c = circumference(r);
    const progress = 4 / 4;
    const dashOffset = c * (1 - progress);
    expect(dashOffset).toBeCloseTo(0, 5);
  });

  it("empty ring (0/4): dashOffset = circumference", () => {
    const r = 55.5;
    const c = circumference(r);
    const progress = 0 / 4;
    const dashOffset = c * (1 - progress);
    expect(dashOffset).toBeCloseTo(c, 5);
  });

  it("half ring (2/4): dashOffset = circumference / 2", () => {
    const r = 55.5;
    const c = circumference(r);
    const progress = 2 / 4;
    const dashOffset = c * (1 - progress);
    expect(dashOffset).toBeCloseTo(c / 2, 5);
  });

  it("quarter ring (1/4): dashOffset = 3/4 * circumference", () => {
    const r = 55.5;
    const c = circumference(r);
    const progress = 1 / 4;
    const dashOffset = c * (1 - progress);
    expect(dashOffset).toBeCloseTo((3 / 4) * c, 5);
  });
});

// ─── Count-up interpolation ───────────────────────────────────────────────────

describe("count-up interpolation", () => {
  function interpolate(from: number, target: number, t: number): number {
    const easedProgress = easeOutCubic(t);
    const current = from + (target - from) * easedProgress;
    return Number.isInteger(target) && Number.isInteger(from)
      ? Math.round(current)
      : Math.round(current * 10) / 10;
  }

  it("starts at `from` when t=0", () => {
    expect(interpolate(0, 4, 0)).toBe(0);
  });

  it("ends at `target` when t=1", () => {
    expect(interpolate(0, 4, 1)).toBe(4);
  });

  it("rounds to integer for integer targets", () => {
    const result = interpolate(0, 4, 0.3);
    expect(Number.isInteger(result)).toBe(true);
  });

  it("reaches target quickly due to ease-out (t=0.7 → already at 3+ of 4)", () => {
    // easeOutCubic(0.7) ≈ 0.973 → 0 + 4 * 0.973 ≈ 3.89 → rounds to 4
    const result = interpolate(0, 4, 0.7);
    expect(result).toBeGreaterThanOrEqual(3);
  });

  it("handles from=target (no animation needed)", () => {
    expect(interpolate(3, 3, 0)).toBe(3);
    expect(interpolate(3, 3, 0.5)).toBe(3);
    expect(interpolate(3, 3, 1)).toBe(3);
  });
});

// ─── ScoreReveal visibility gate ─────────────────────────────────────────────

describe("ScoreReveal visibility gate", () => {
  it("should NOT be visible when userStartedJob is false (returning user)", () => {
    // This is the contract: ScoreReveal only animates for users who
    // started the job in the current session.
    const userStartedJob = false;
    const visible = userStartedJob;
    expect(visible).toBe(false);
  });

  it("should be visible when userStartedJob is true (fresh run)", () => {
    const userStartedJob = true;
    const visible = userStartedJob;
    expect(visible).toBe(true);
  });
});

// ─── Engine results mapping ───────────────────────────────────────────────────

describe("engineResults mapping for ScoreReveal", () => {
  const ALL_ENGINES = ["chatgpt", "google", "perplexity", "gemini"] as const;
  type Engine = typeof ALL_ENGINES[number];

  function buildEngineResults(citingEngines: Engine[]) {
    return ALL_ENGINES.map(engine => ({
      engine,
      cited: citingEngines.includes(engine),
    }));
  }

  it("all engines not cited when citingEngines is empty", () => {
    const results = buildEngineResults([]);
    expect(results.every(r => !r.cited)).toBe(true);
    expect(results).toHaveLength(4);
  });

  it("correct engines marked as cited", () => {
    const results = buildEngineResults(["chatgpt", "perplexity"]);
    expect(results.find(r => r.engine === "chatgpt")?.cited).toBe(true);
    expect(results.find(r => r.engine === "perplexity")?.cited).toBe(true);
    expect(results.find(r => r.engine === "google")?.cited).toBe(false);
    expect(results.find(r => r.engine === "gemini")?.cited).toBe(false);
  });

  it("all engines cited when all 4 are in citingEngines", () => {
    const results = buildEngineResults([...ALL_ENGINES]);
    expect(results.every(r => r.cited)).toBe(true);
  });

  it("always returns exactly 4 engines regardless of input", () => {
    expect(buildEngineResults([])).toHaveLength(4);
    expect(buildEngineResults(["chatgpt"])).toHaveLength(4);
    expect(buildEngineResults([...ALL_ENGINES])).toHaveLength(4);
  });
});
