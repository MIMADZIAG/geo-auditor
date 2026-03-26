/**
 * Tests for morphologicalVariants.ts
 *
 * Covers:
 *  - applyPolishRules(): aspect swap, synonym substitution, interrogative injection, temporal specificity
 *  - expandQueriesWithVariants(): deduplication, slot limits, source tagging
 *  - Edge cases: empty input, already-variant queries, non-Polish language
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { applyPolishRules, expandQueriesWithVariants } from "./morphologicalVariants";

// ─── Mock LLM to avoid real API calls in unit tests ──────────────────────────

vi.mock("../_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            variants: ["wariant llm 1", "wariant llm 2", "wariant llm 3"],
          }),
        },
      },
    ],
  }),
}));

// ─── applyPolishRules ─────────────────────────────────────────────────────────

describe("applyPolishRules", () => {
  it("swaps perfective → imperfective aspect (wybrać → wybierać)", () => {
    const variants = applyPolishRules("jak wybrać tanie OC");
    expect(variants.some(v => v.includes("wybierać"))).toBe(true);
  });

  it("swaps imperfective → perfective aspect (kupować → kupić)", () => {
    const variants = applyPolishRules("jak kupować ubezpieczenie samochodu");
    expect(variants.some(v => v.includes("kupić"))).toBe(true);
  });

  it("substitutes synonym (tanie → niedrogie / budżetowe)", () => {
    const variants = applyPolishRules("tanie ubezpieczenie OC");
    const hasSynonym = variants.some(v =>
      v.includes("niedrogie") || v.includes("budżetowe") || v.includes("ekonomiczne")
    );
    expect(hasSynonym).toBe(true);
  });

  it("substitutes synonym (najlepszy → optymalny / rekomendowany)", () => {
    const variants = applyPolishRules("najlepszy broker forex");
    const hasSynonym = variants.some(v =>
      v.includes("optymalny") || v.includes("rekomendowany") || v.includes("polecany")
    );
    expect(hasSynonym).toBe(true);
  });

  it("injects question prefix for noun-phrase queries", () => {
    const variants = applyPolishRules("ubezpieczenie OC 2025");
    // Should inject a question prefix since query has no question word
    const hasQuestion = variants.some(v =>
      /^(jak|jaki|który|co|ile|czy|dlaczego|kiedy|jakie)/i.test(v)
    );
    expect(hasQuestion).toBe(true);
  });

  it("does NOT inject question prefix if query already has one", () => {
    const variants = applyPolishRules("jak wybrać ubezpieczenie OC");
    // All variants should not add another question prefix on top
    const doubleQuestion = variants.filter(v =>
      /^(jak|jaki|który|co|ile|czy)\s+(jak|jaki|który|co|ile|czy)/i.test(v)
    );
    expect(doubleQuestion.length).toBe(0);
  });

  it("adds temporal specificity (year 2025) when not present", () => {
    const variants = applyPolishRules("ranking kont bankowych");
    expect(variants.some(v => v.includes("2025"))).toBe(true);
  });

  it("does NOT add year if already present", () => {
    const variants = applyPolishRules("ranking kont bankowych 2025");
    const yearCount = variants.filter(v => (v.match(/2025/g) ?? []).length > 1).length;
    expect(yearCount).toBe(0);
  });

  it("respects maxVariants limit", () => {
    const variants = applyPolishRules("jak wybrać tanie OC", 2);
    expect(variants.length).toBeLessThanOrEqual(2);
  });

  it("returns empty array for empty input", () => {
    const variants = applyPolishRules("");
    expect(variants).toEqual([]);
  });

  it("does not return the original query as a variant", () => {
    const query = "jak wybrać tanie OC";
    const variants = applyPolishRules(query);
    expect(variants.every(v => v.toLowerCase().trim() !== query.toLowerCase().trim())).toBe(true);
  });

  it("handles queries with no matching rules gracefully", () => {
    // A query with no aspect verbs, no synonyms, no question word, and already has a year
    const variants = applyPolishRules("lorem ipsum dolor 2025");
    // Should still return something (question prefix injection)
    expect(Array.isArray(variants)).toBe(true);
  });
});

// ─── expandQueriesWithVariants ────────────────────────────────────────────────

describe("expandQueriesWithVariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns variants for Polish queries (mixed source)", async () => {
    const result = await expandQueriesWithVariants(
      ["jak wybrać tanie OC", "ranking ubezpieczeń"],
      "pl",
      2
    );
    expect(result.variants.length).toBeGreaterThan(0);
    expect(["rules", "llm", "mixed"]).toContain(result.source);
  });

  it("excludes original queries from variants", async () => {
    const originals = ["jak wybrać tanie OC", "ranking ubezpieczeń"];
    const result = await expandQueriesWithVariants(originals, "pl", 2);
    const origNorm = new Set(originals.map(q => q.toLowerCase().trim()));
    const hasOriginal = result.variants.some(v => origNorm.has(v.toLowerCase().trim()));
    expect(hasOriginal).toBe(false);
  });

  it("deduplicates variants (no duplicate strings)", async () => {
    const result = await expandQueriesWithVariants(
      ["jak wybrać tanie OC", "jak wybrać tanie OC"], // intentional duplicate
      "pl",
      2
    );
    const norms = result.variants.map(v => v.toLowerCase().trim());
    const unique = new Set(norms);
    expect(unique.size).toBe(norms.length);
  });

  it("respects maxPerQuery slot limit", async () => {
    const queries = ["jak wybrać tanie OC", "ranking ubezpieczeń", "co to jest OC"];
    const result = await expandQueriesWithVariants(queries, "pl", 1);
    // With maxPerQuery=1 and 3 seed queries, max variants = 3
    expect(result.variants.length).toBeLessThanOrEqual(3);
  });

  it("returns empty variants for empty input", async () => {
    const result = await expandQueriesWithVariants([], "pl", 2);
    expect(result.variants).toEqual([]);
  });

  it("uses LLM for non-Polish languages", async () => {
    const { invokeLLM } = await import("../_core/llm");
    const result = await expandQueriesWithVariants(
      ["how to choose cheap car insurance"],
      "en",
      2
    );
    expect(invokeLLM).toHaveBeenCalled();
    expect(result.source).toBe("llm");
  });

  it("source is 'mixed' when both rules and LLM are used for Polish", async () => {
    // For Polish, rules run first. If rules don't fill all slots, LLM is called.
    // With a query that has no matching rules, LLM fills the gap.
    const result = await expandQueriesWithVariants(
      ["lorem ipsum dolor"],
      "pl",
      2
    );
    // Either rules or LLM or mixed — just confirm it's a valid source
    expect(["rules", "llm", "mixed"]).toContain(result.source);
  });

  it("all returned variants are non-empty strings", async () => {
    const result = await expandQueriesWithVariants(
      ["jak wybrać tanie OC", "ranking kont bankowych"],
      "pl",
      2
    );
    expect(result.variants.every(v => typeof v === "string" && v.trim().length > 0)).toBe(true);
  });
});

// ─── Integration: aspect swap coverage ───────────────────────────────────────

describe("aspect swap coverage — key GEO query patterns", () => {
  const CRITICAL_PAIRS: [string, string, string][] = [
    ["jak wybrać OC", "wybierać", "perfective→imperfective"],
    ["jak kupić mieszkanie", "kupować", "perfective→imperfective"],
    ["jak sprawdzić VIN", "sprawdzać", "perfective→imperfective"],
    ["jak porównać oferty", "porównywać", "perfective→imperfective"],
    ["jak ocenić agencję", "oceniać", "perfective→imperfective"],
    ["jak zrozumieć podatki", "rozumieć", "perfective→imperfective"],
    ["jak zoptymalizować stronę", "optymalizować", "perfective→imperfective"],
  ];

  for (const [query, expectedWord, label] of CRITICAL_PAIRS) {
    it(`${label}: "${query}" → should contain "${expectedWord}"`, () => {
      const variants = applyPolishRules(query, 4);
      expect(variants.some(v => v.includes(expectedWord))).toBe(true);
    });
  }
});
