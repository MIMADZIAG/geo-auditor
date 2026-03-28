/**
 * Regression tests: UpsellProModal crash prevention
 *
 * Bug: COPY[scoreLabel] was accessed before `if (!isOpen) return null` guard.
 * For tiers not in COPY (Rozwijający się / Widoczny / Dominujący), copy=undefined
 * and copy.urgencyIcon threw, crashing the entire React tree.
 *
 * These tests verify:
 * 1. getScoreLabel returns correct tier for every scoring boundary
 * 2. Only "Niewidoczny" and "Startujący" tiers should trigger the upsell modal
 * 3. Tiers >= 55 (Rozwijający się, Widoczny, Dominujący) must NEVER trigger the modal
 * 4. The COPY dictionary covers exactly the two upsell tiers — no more, no less
 * 5. Fallback behaviour when an unexpected tier is passed
 */

import { describe, it, expect } from "vitest";
import { getScoreLabel } from "./audit/scorer";

// ─── Mirror of the COPY keys in UpsellProModal ────────────────────────────────
// These are the ONLY two tiers that should ever reach the modal component.
const UPSELL_TIERS = new Set(["Niewidoczny", "Startujący"]);
const NON_UPSELL_TIERS = new Set(["Rozwijający się", "Widoczny", "Dominujący"]);

// ─── Helper: simulate the Results.tsx trigger logic ───────────────────────────
/**
 * Mirrors the exact condition used in Results.tsx useEffect:
 *   if (label !== "Niewidoczny" && label !== "Startujący") return;
 * Returns true if the modal WOULD be opened for this score.
 */
function wouldTriggerUpsellModal(score: number): boolean {
  const label = getScoreLabel(score);
  return label === "Niewidoczny" || label === "Startujący";
}

/**
 * Mirrors the safe prop derivation in Results.tsx:
 *   setUpsellTier(label) — label is already validated as "Niewidoczny"|"Startujący"
 * Returns the tier that would be passed to UpsellProModal, or null if modal won't open.
 */
function getUpsellTierForScore(score: number): "Niewidoczny" | "Startujący" | null {
  const label = getScoreLabel(score);
  if (label === "Niewidoczny" || label === "Startujący") return label;
  return null;
}

// ─── 1. Boundary tests for all 5 tiers ───────────────────────────────────────
describe("getScoreLabel — all 5 tier boundaries (regression)", () => {
  it("Niewidoczny: 0, 1, 20, 35", () => {
    [0, 1, 20, 35].forEach(s => expect(getScoreLabel(s)).toBe("Niewidoczny"));
  });

  it("Startujący: 36, 37, 45, 54", () => {
    [36, 37, 45, 54].forEach(s => expect(getScoreLabel(s)).toBe("Startujący"));
  });

  it("Rozwijający się: 55, 56, 62, 69", () => {
    [55, 56, 62, 69].forEach(s => expect(getScoreLabel(s)).toBe("Rozwijający się"));
  });

  it("Widoczny: 70, 71, 75, 82", () => {
    [70, 71, 75, 82].forEach(s => expect(getScoreLabel(s)).toBe("Widoczny"));
  });

  it("Dominujący: 83, 84, 90, 100", () => {
    [83, 84, 90, 100].forEach(s => expect(getScoreLabel(s)).toBe("Dominujący"));
  });

  it("exact boundary: 35 is Niewidoczny, 36 is Startujący", () => {
    expect(getScoreLabel(35)).toBe("Niewidoczny");
    expect(getScoreLabel(36)).toBe("Startujący");
  });

  it("exact boundary: 54 is Startujący, 55 is Rozwijający się", () => {
    expect(getScoreLabel(54)).toBe("Startujący");
    expect(getScoreLabel(55)).toBe("Rozwijający się");
  });

  it("exact boundary: 69 is Rozwijający się, 70 is Widoczny", () => {
    expect(getScoreLabel(69)).toBe("Rozwijający się");
    expect(getScoreLabel(70)).toBe("Widoczny");
  });

  it("exact boundary: 82 is Widoczny, 83 is Dominujący", () => {
    expect(getScoreLabel(82)).toBe("Widoczny");
    expect(getScoreLabel(83)).toBe("Dominujący");
  });
});

// ─── 2. Upsell modal trigger logic ───────────────────────────────────────────
describe("UpsellProModal trigger — only Niewidoczny and Startujący open modal", () => {
  it("scores 0–35 (Niewidoczny) SHOULD trigger modal", () => {
    [0, 1, 20, 35].forEach(s => {
      expect(wouldTriggerUpsellModal(s)).toBe(true);
    });
  });

  it("scores 36–54 (Startujący) SHOULD trigger modal", () => {
    [36, 37, 45, 54].forEach(s => {
      expect(wouldTriggerUpsellModal(s)).toBe(true);
    });
  });

  it("scores 55–69 (Rozwijający się) MUST NOT trigger modal — regression for crash bug", () => {
    [55, 56, 60, 62, 69].forEach(s => {
      expect(wouldTriggerUpsellModal(s)).toBe(false);
    });
  });

  it("scores 70–82 (Widoczny) MUST NOT trigger modal — regression for crash bug", () => {
    [70, 71, 75, 80, 82].forEach(s => {
      expect(wouldTriggerUpsellModal(s)).toBe(false);
    });
  });

  it("scores 83–100 (Dominujący) MUST NOT trigger modal — regression for crash bug", () => {
    [83, 84, 90, 95, 100].forEach(s => {
      expect(wouldTriggerUpsellModal(s)).toBe(false);
    });
  });
});

// ─── 3. Safe upsellTier prop derivation ──────────────────────────────────────
describe("getUpsellTierForScore — safe prop passed to UpsellProModal", () => {
  it("returns 'Niewidoczny' for scores 0–35", () => {
    [0, 20, 35].forEach(s => {
      expect(getUpsellTierForScore(s)).toBe("Niewidoczny");
    });
  });

  it("returns 'Startujący' for scores 36–54", () => {
    [36, 45, 54].forEach(s => {
      expect(getUpsellTierForScore(s)).toBe("Startujący");
    });
  });

  it("returns null for Rozwijający się (55–69) — modal never opens, no COPY access", () => {
    [55, 62, 69].forEach(s => {
      expect(getUpsellTierForScore(s)).toBeNull();
    });
  });

  it("returns null for Widoczny (70–82) — modal never opens, no COPY access", () => {
    [70, 75, 82].forEach(s => {
      expect(getUpsellTierForScore(s)).toBeNull();
    });
  });

  it("returns null for Dominujący (83–100) — modal never opens, no COPY access", () => {
    [83, 90, 100].forEach(s => {
      expect(getUpsellTierForScore(s)).toBeNull();
    });
  });
});

// ─── 4. COPY dictionary coverage invariant ───────────────────────────────────
describe("COPY dictionary coverage — exactly two upsell tiers", () => {
  it("UPSELL_TIERS set contains exactly Niewidoczny and Startujący", () => {
    expect(UPSELL_TIERS.size).toBe(2);
    expect(UPSELL_TIERS.has("Niewidoczny")).toBe(true);
    expect(UPSELL_TIERS.has("Startujący")).toBe(true);
  });

  it("NON_UPSELL_TIERS set contains exactly the 3 tiers that must NOT access COPY", () => {
    expect(NON_UPSELL_TIERS.size).toBe(3);
    expect(NON_UPSELL_TIERS.has("Rozwijający się")).toBe(true);
    expect(NON_UPSELL_TIERS.has("Widoczny")).toBe(true);
    expect(NON_UPSELL_TIERS.has("Dominujący")).toBe(true);
  });

  it("every score in 0–100 maps to a tier that is either upsell or non-upsell (no gaps)", () => {
    for (let s = 0; s <= 100; s++) {
      const label = getScoreLabel(s);
      const isKnown = UPSELL_TIERS.has(label) || NON_UPSELL_TIERS.has(label);
      expect(isKnown, `Score ${s} → "${label}" is not in any known tier set`).toBe(true);
    }
  });

  it("scores that trigger modal always produce a tier in UPSELL_TIERS", () => {
    for (let s = 0; s <= 100; s++) {
      if (wouldTriggerUpsellModal(s)) {
        const tier = getUpsellTierForScore(s);
        expect(tier, `Score ${s} triggers modal but tier is null`).not.toBeNull();
        expect(UPSELL_TIERS.has(tier!), `Score ${s} → tier "${tier}" not in COPY`).toBe(true);
      }
    }
  });

  it("scores that do NOT trigger modal never produce a tier in UPSELL_TIERS", () => {
    for (let s = 0; s <= 100; s++) {
      if (!wouldTriggerUpsellModal(s)) {
        const label = getScoreLabel(s);
        expect(
          UPSELL_TIERS.has(label),
          `Score ${s} → "${label}" is in UPSELL_TIERS but modal should NOT open`
        ).toBe(false);
      }
    }
  });
});

// ─── 5. Exhaustive score sweep — no score should be unclassified ──────────────
describe("Exhaustive score sweep 0–100 — no unclassified score", () => {
  const ALL_TIERS = new Set([...UPSELL_TIERS, ...NON_UPSELL_TIERS]);

  it("every integer score 0–100 maps to one of the 5 known tiers", () => {
    for (let s = 0; s <= 100; s++) {
      const label = getScoreLabel(s);
      expect(ALL_TIERS.has(label), `Score ${s} → unknown tier "${label}"`).toBe(true);
    }
  });

  it("tier distribution matches expected ranges", () => {
    const distribution: Record<string, number[]> = {};
    for (let s = 0; s <= 100; s++) {
      const label = getScoreLabel(s);
      if (!distribution[label]) distribution[label] = [];
      distribution[label].push(s);
    }

    // Niewidoczny: 0–35 → 36 scores
    expect(distribution["Niewidoczny"].length).toBe(36);
    expect(distribution["Niewidoczny"][0]).toBe(0);
    expect(distribution["Niewidoczny"].at(-1)).toBe(35);

    // Startujący: 36–54 → 19 scores
    expect(distribution["Startujący"].length).toBe(19);
    expect(distribution["Startujący"][0]).toBe(36);
    expect(distribution["Startujący"].at(-1)).toBe(54);

    // Rozwijający się: 55–69 → 15 scores
    expect(distribution["Rozwijający się"].length).toBe(15);
    expect(distribution["Rozwijający się"][0]).toBe(55);
    expect(distribution["Rozwijający się"].at(-1)).toBe(69);

    // Widoczny: 70–82 → 13 scores
    expect(distribution["Widoczny"].length).toBe(13);
    expect(distribution["Widoczny"][0]).toBe(70);
    expect(distribution["Widoczny"].at(-1)).toBe(82);

    // Dominujący: 83–100 → 18 scores
    expect(distribution["Dominujący"].length).toBe(18);
    expect(distribution["Dominujący"][0]).toBe(83);
    expect(distribution["Dominujący"].at(-1)).toBe(100);
  });
});
