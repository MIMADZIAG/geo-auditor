/**
 * narrativeGenerator.test.ts
 *
 * Tests for the LLM-based citation narrative generator.
 * Mocks invokeLLM to avoid real API calls and test all code paths:
 *  - LLM success with structured output
 *  - LLM failure → template fallback
 *  - Cache hit (same auditId returns cached result)
 *  - Zero citations scenario
 *  - Full citations scenario
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock invokeLLM before importing the module under test ─────────────────────
vi.mock("../_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import { invokeLLM } from "../_core/llm";
import { generateCitationNarrative, clearNarrativeCache } from "./narrativeGenerator";

const mockInvokeLLM = vi.mocked(invokeLLM);

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_TOP_GAPS = [
  {
    label: "FAQ Schema",
    category: "schema" as const,
    categoryLabel: "Dane strukturalne",
    competitorPassCount: 5,
    competitorTotal: 5,
    targetValue: null as number | null,
    impact: "FAQ schema increases citation rate by 3x",
    recommendation: "Add FAQ schema to the page",
  },
];

function makeInput(overrides: Partial<Parameters<typeof generateCitationNarrative>[0]> = {}) {
  return {
    auditId: 9999,
    url: "https://example.com/produkt",
    citedEngineCount: 0,
    totalEngines: 4,
    citingEngines: [],
    missingEngines: ["chatgpt", "google", "perplexity", "gemini"],
    totalChecks: 20,
    topGaps: DEFAULT_TOP_GAPS,
    language: "pl",
    ...overrides,
  };
}

function makeLLMResponse(content: object) {
  return {
    choices: [{ message: { content: JSON.stringify(content) } }],
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("generateCitationNarrative", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearNarrativeCache();
  });

  it("returns LLM-generated narrative on success", async () => {
    mockInvokeLLM.mockResolvedValueOnce(makeLLMResponse({
      verdict: "Twoja strona nie jest cytowana przez żadne AI.",
      diagnosis: "Brak FAQ schema to główna przyczyna.",
      rootCauseGap: "Dodaj FAQ schema do strony produktowej.",
      primaryAction: "Wdróż FAQ schema w ciągu 24h.",
      confidence: "high",
    }) as any);

    const result = await generateCitationNarrative(makeInput());

    expect(result.source).toBe("llm");
    expect(result.confidence).toBe("high");
    expect(result.verdict).toContain("nie jest cytowana");
    expect(result.primaryAction).toContain("FAQ schema");
  });

  it("falls back to template when LLM throws", async () => {
    mockInvokeLLM.mockRejectedValueOnce(new Error("LLM timeout"));

    const result = await generateCitationNarrative(makeInput());

    expect(result.source).toBe("template");
    expect(result.confidence).toBe("low");
    expect(result.verdict).toBeTruthy();
    expect(result.primaryAction).toBeTruthy();
  });

  it("falls back to template when LLM returns malformed JSON", async () => {
    mockInvokeLLM.mockResolvedValueOnce({
      choices: [{ message: { content: "not valid json {{" } }],
    } as any);

    const result = await generateCitationNarrative(makeInput());

    expect(result.source).toBe("template");
    expect(result.confidence).toBe("low");
  });

  it("falls back to template when LLM returns empty content", async () => {
    mockInvokeLLM.mockResolvedValueOnce({
      choices: [{ message: { content: "" } }],
    } as any);

    const result = await generateCitationNarrative(makeInput());

    expect(result.source).toBe("template");
  });

  it("returns cached result on second call with same auditId", async () => {
    mockInvokeLLM.mockResolvedValue(makeLLMResponse({
      verdict: "Cached verdict",
      diagnosis: "Cached diagnosis",
      rootCauseGap: null,
      primaryAction: "Cached action",
      confidence: "medium",
    }) as any);

    const first = await generateCitationNarrative(makeInput());
    const second = await generateCitationNarrative(makeInput());

    // LLM should only be called once — second result comes from cache
    expect(mockInvokeLLM).toHaveBeenCalledTimes(1);
    expect(first.verdict).toBe(second.verdict);
  });

  it("does not use cache for different auditIds", async () => {
    mockInvokeLLM.mockResolvedValue(makeLLMResponse({
      verdict: "Verdict",
      diagnosis: "Diagnosis",
      rootCauseGap: null,
      primaryAction: "Action",
      confidence: "medium",
    }) as any);

    await generateCitationNarrative(makeInput({ auditId: 1 }));
    await generateCitationNarrative(makeInput({ auditId: 2 }));

    expect(mockInvokeLLM).toHaveBeenCalledTimes(2);
  });

  it("generates positive template for fully cited page", async () => {
    mockInvokeLLM.mockRejectedValueOnce(new Error("fail"));

    const result = await generateCitationNarrative(makeInput({
      citedEngineCount: 4,
      citingEngines: ["chatgpt", "google", "perplexity", "gemini"],
      missingEngines: [],
    }));

    expect(result.source).toBe("template");
    // Template for full citation should be positive
    expect(result.verdict).toBeTruthy();
    expect(result.confidence).toBe("low");
  });

  it("handles topGaps in LLM prompt without throwing", async () => {
    mockInvokeLLM.mockResolvedValueOnce(makeLLMResponse({
      verdict: "Verdict with gaps",
      diagnosis: "Diagnosis with gaps",
      rootCauseGap: "FAQ schema brakuje",
      primaryAction: "Dodaj FAQ schema",
      confidence: "high",
    }) as any);

    const result = await generateCitationNarrative(makeInput({
      topGaps: [
        {
          label: "FAQ Schema",
          category: "schema" as const,
          categoryLabel: "Dane strukturalne",
          competitorPassCount: 5,
          competitorTotal: 5,
          targetValue: null,
          impact: "FAQ schema increases citation rate by 3x",
          recommendation: "Add FAQ schema to the page",
        },
      ],
    }));

    expect(result.source).toBe("llm");
    expect(result.rootCauseGap).toBeTruthy();
  });
});
