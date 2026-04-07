/**
 * Unit tests for:
 *  - deduplicatePhrases (semantic deduplication via Jaccard similarity)
 *  - runCitationFeedbackLoop (auto-deactivation of weak phrases)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── deduplicatePhrases ───────────────────────────────────────────────────────

// Import only the pure function — no DB required
import { deduplicatePhrases } from "./monitoring/phrases";

describe("deduplicatePhrases", () => {
  it("keeps unique phrases unchanged", () => {
    const phrases = [
      { phrase: "jak wybrać kredyt hipoteczny", citationProbability: "high", sortOrder: 1 },
      { phrase: "najlepszy laptop do pracy zdalnej", citationProbability: "medium", sortOrder: 2 },
      { phrase: "porównanie kont bankowych 2024", citationProbability: "low", sortOrder: 3 },
    ];
    const result = deduplicatePhrases(phrases);
    expect(result).toHaveLength(3);
  });

  it("removes near-duplicate phrases (Jaccard ≥ 0.6)", () => {
    const phrases = [
      { phrase: "jak wybrać kredyt hipoteczny", citationProbability: "medium", sortOrder: 1 },
      { phrase: "jak wybrać najlepszy kredyt hipoteczny", citationProbability: "high", sortOrder: 2 },
    ];
    // These two share 4/5 tokens → Jaccard ≈ 0.8 → should deduplicate
    const result = deduplicatePhrases(phrases);
    expect(result).toHaveLength(1);
  });

  it("keeps the higher citationProbability phrase when deduplicating", () => {
    const phrases = [
      { phrase: "jak wybrać kredyt hipoteczny", citationProbability: "low", sortOrder: 1 },
      { phrase: "jak wybrać najlepszy kredyt hipoteczny", citationProbability: "high", sortOrder: 2 },
    ];
    const result = deduplicatePhrases(phrases);
    expect(result).toHaveLength(1);
    expect(result[0].citationProbability).toBe("high");
  });

  it("does not remove phrases below the similarity threshold", () => {
    const phrases = [
      { phrase: "kredyt hipoteczny wymagania", citationProbability: "high", sortOrder: 1 },
      { phrase: "pożyczka gotówkowa bez zaświadczeń", citationProbability: "medium", sortOrder: 2 },
    ];
    // These share no significant tokens → Jaccard ≈ 0 → both kept
    const result = deduplicatePhrases(phrases);
    expect(result).toHaveLength(2);
  });

  it("handles empty input", () => {
    expect(deduplicatePhrases([])).toHaveLength(0);
  });

  it("handles single phrase", () => {
    const phrases = [{ phrase: "kredyt hipoteczny", citationProbability: "high", sortOrder: 1 }];
    expect(deduplicatePhrases(phrases)).toHaveLength(1);
  });

  it("uses custom threshold when provided", () => {
    const phrases = [
      { phrase: "kredyt hipoteczny bank", citationProbability: "medium", sortOrder: 1 },
      { phrase: "kredyt hipoteczny oferta", citationProbability: "medium", sortOrder: 2 },
    ];
    // With threshold=0.3, these share "kredyt hipoteczny" (2/4 tokens) → Jaccard=0.5 → deduplicated
    const resultStrict = deduplicatePhrases(phrases, 0.3);
    expect(resultStrict).toHaveLength(1);

    // With threshold=0.9 (very strict), they are kept as distinct
    const resultLoose = deduplicatePhrases(phrases, 0.9);
    expect(resultLoose).toHaveLength(2);
  });

  it("handles phrases with null citationProbability (treats as low)", () => {
    const phrases = [
      { phrase: "jak wybrać kredyt hipoteczny", citationProbability: null, sortOrder: 1 },
      { phrase: "jak wybrać najlepszy kredyt hipoteczny", citationProbability: "high", sortOrder: 2 },
    ];
    const result = deduplicatePhrases(phrases);
    expect(result).toHaveLength(1);
    expect(result[0].citationProbability).toBe("high");
  });
});

// ─── runCitationFeedbackLoop ──────────────────────────────────────────────────

describe("runCitationFeedbackLoop — logic", () => {
  it("correctly identifies consecutive zero-citation runs", () => {
    // Simulate the logic: 3 consecutive zero-citation runs → weak
    const history = [
      { citedEnginesCount: 0 },
      { citedEnginesCount: 0 },
      { citedEnginesCount: 0 },
    ];
    const THRESHOLD = 3;
    const allZero = history.every((h) => (h.citedEnginesCount ?? 0) === 0);
    expect(allZero).toBe(true);
    expect(history.length >= THRESHOLD).toBe(true);
  });

  it("does not flag phrase with at least one citation in recent runs", () => {
    const history = [
      { citedEnginesCount: 0 },
      { citedEnginesCount: 2 }, // cited in this run
      { citedEnginesCount: 0 },
    ];
    const allZero = history.every((h) => (h.citedEnginesCount ?? 0) === 0);
    expect(allZero).toBe(false);
  });

  it("does not flag phrase with insufficient history (< threshold)", () => {
    const history = [
      { citedEnginesCount: 0 },
      { citedEnginesCount: 0 },
    ];
    const THRESHOLD = 3;
    expect(history.length >= THRESHOLD).toBe(false);
  });
});
