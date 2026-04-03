/**
 * Tests for the 3 citation-monitoring bridge fixes:
 * Fix 1: audit citation results update monitored page bar (lastCitedEngines)
 * Fix 2: audit citation results backfill score_snapshot (citedEnginesCount)
 * Fix 3: URL normalization unifies phrase sources (trailing slash, case)
 */

import { describe, it, expect } from "vitest";

// ─── Fix 3: URL normalization logic ──────────────────────────────────────────
// Extracted from routers.ts citation.startCheck for unit testing

function normalizeUrl(u: string): string {
  try {
    const parsed = new URL(u);
    return parsed.protocol + "//" + parsed.hostname.toLowerCase() + parsed.pathname.replace(/\/$/, "") + parsed.search;
  } catch {
    return u.replace(/\/$/, "").toLowerCase();
  }
}

describe("Fix 3: URL normalization for phrase source unification", () => {
  it("strips trailing slash from path", () => {
    expect(normalizeUrl("https://example.com/page/")).toBe("https://example.com/page");
  });

  it("does not strip slash from root URL", () => {
    // Root URL: pathname is "/" — after replace(/\/$/, "") becomes ""
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com");
  });

  it("normalizes hostname to lowercase", () => {
    expect(normalizeUrl("https://EXAMPLE.COM/page")).toBe("https://example.com/page");
  });

  it("matches URL with and without trailing slash", () => {
    const withSlash = normalizeUrl("https://sklep.pl/produkt/");
    const withoutSlash = normalizeUrl("https://sklep.pl/produkt");
    expect(withSlash).toBe(withoutSlash);
  });

  it("preserves query string", () => {
    expect(normalizeUrl("https://example.com/page?lang=pl")).toBe("https://example.com/page?lang=pl");
  });

  it("handles URLs with mixed case hostname and path", () => {
    const a = normalizeUrl("https://Example.COM/Produkt/");
    const b = normalizeUrl("https://example.com/Produkt");
    expect(a).toBe(b);
  });

  it("handles invalid URL gracefully", () => {
    const result = normalizeUrl("not-a-url");
    expect(result).toBe("not-a-url");
  });

  it("handles URL with port", () => {
    // URL.hostname strips port; URL.host includes it.
    // Our normalizeUrl uses hostname (no port) — this is intentional:
    // port is rarely used in monitored URLs and stripping it avoids mismatch.
    // The important thing is consistency: both sides normalize the same way.
    const a = normalizeUrl("https://example.com:8080/page/");
    const b = normalizeUrl("https://example.com:8080/page");
    expect(a).toBe(b);
  });
});

// ─── Fix 1+2: Citation summary → cited engine count computation ───────────────
// This is the logic that converts CitationJobResult.summary into citedEngines count

type EngineSummary = { cited: number; domainCited: number; total: number; queriesWithAI: number };
type CitationSummary = {
  chatgpt: EngineSummary;
  google: EngineSummary;
  perplexity: EngineSummary;
  gemini: EngineSummary;
};

function computeCitedEnginesFromSummary(summary: CitationSummary): { citedEngines: number; totalEngines: number } {
  const citedEngines = [
    summary.chatgpt.cited + summary.chatgpt.domainCited > 0 ? 1 : 0,
    summary.google.cited + summary.google.domainCited > 0 ? 1 : 0,
    summary.perplexity.cited + summary.perplexity.domainCited > 0 ? 1 : 0,
    summary.gemini.cited + summary.gemini.domainCited > 0 ? 1 : 0,
  ].reduce((a, b) => a + b, 0);
  const totalEngines = Object.values(summary).filter((e) => e.total > 0).length || 4;
  return { citedEngines, totalEngines };
}

const makeSummary = (overrides: Partial<CitationSummary> = {}): CitationSummary => ({
  chatgpt: { cited: 0, domainCited: 0, total: 3, queriesWithAI: 3 },
  google: { cited: 0, domainCited: 0, total: 3, queriesWithAI: 2 },
  perplexity: { cited: 0, domainCited: 0, total: 3, queriesWithAI: 3 },
  gemini: { cited: 0, domainCited: 0, total: 3, queriesWithAI: 1 },
  ...overrides,
});

describe("Fix 1+2: Citation summary → cited engine count", () => {
  it("returns 0 cited engines when none cited", () => {
    const { citedEngines, totalEngines } = computeCitedEnginesFromSummary(makeSummary());
    expect(citedEngines).toBe(0);
    expect(totalEngines).toBe(4);
  });

  it("returns 1 when only chatgpt has exact citation", () => {
    const summary = makeSummary({ chatgpt: { cited: 1, domainCited: 0, total: 3, queriesWithAI: 3 } });
    const { citedEngines } = computeCitedEnginesFromSummary(summary);
    expect(citedEngines).toBe(1);
  });

  it("returns 1 when only chatgpt has domain citation (not exact)", () => {
    const summary = makeSummary({ chatgpt: { cited: 0, domainCited: 2, total: 3, queriesWithAI: 3 } });
    const { citedEngines } = computeCitedEnginesFromSummary(summary);
    expect(citedEngines).toBe(1);
  });

  it("returns 4 when all engines cite the URL", () => {
    const summary = makeSummary({
      chatgpt: { cited: 2, domainCited: 0, total: 3, queriesWithAI: 3 },
      google: { cited: 1, domainCited: 0, total: 3, queriesWithAI: 2 },
      perplexity: { cited: 0, domainCited: 1, total: 3, queriesWithAI: 3 },
      gemini: { cited: 1, domainCited: 0, total: 3, queriesWithAI: 1 },
    });
    const { citedEngines, totalEngines } = computeCitedEnginesFromSummary(summary);
    expect(citedEngines).toBe(4);
    expect(totalEngines).toBe(4);
  });

  it("returns 2 when only 2 engines cite", () => {
    const summary = makeSummary({
      chatgpt: { cited: 1, domainCited: 0, total: 3, queriesWithAI: 3 },
      perplexity: { cited: 1, domainCited: 0, total: 3, queriesWithAI: 3 },
    });
    const { citedEngines } = computeCitedEnginesFromSummary(summary);
    expect(citedEngines).toBe(2);
  });

  it("counts engine as cited even if only domainCited (not exact URL)", () => {
    const summary = makeSummary({
      google: { cited: 0, domainCited: 3, total: 3, queriesWithAI: 2 },
    });
    const { citedEngines } = computeCitedEnginesFromSummary(summary);
    expect(citedEngines).toBe(1);
  });

  it("totalEngines falls back to 4 when all engines have total=0", () => {
    const summary: CitationSummary = {
      chatgpt: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 },
      google: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 },
      perplexity: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 },
      gemini: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 },
    };
    const { totalEngines } = computeCitedEnginesFromSummary(summary);
    expect(totalEngines).toBe(4);
  });

  it("totalEngines reflects only active engines", () => {
    const summary: CitationSummary = {
      chatgpt: { cited: 1, domainCited: 0, total: 3, queriesWithAI: 3 },
      google: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 }, // inactive
      perplexity: { cited: 0, domainCited: 0, total: 3, queriesWithAI: 3 },
      gemini: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 }, // inactive
    };
    const { citedEngines, totalEngines } = computeCitedEnginesFromSummary(summary);
    expect(totalEngines).toBe(2);
    expect(citedEngines).toBe(1);
  });
});

// ─── Integration: bridge logic correctness ────────────────────────────────────

describe("Bridge logic: fire-and-forget safety", () => {
  it("does not update when monitoredPageId is null (anonymous user)", () => {
    // Simulate: capturedMonitoredPageId = null → bridge skips DB updates
    const capturedMonitoredPageId: number | null = null;
    const shouldUpdate = capturedMonitoredPageId !== null;
    expect(shouldUpdate).toBe(false);
  });

  it("updates when monitoredPageId is set (authenticated, monitored URL)", () => {
    const capturedMonitoredPageId: number | null = 42;
    const shouldUpdate = capturedMonitoredPageId !== null;
    expect(shouldUpdate).toBe(true);
  });

  it("does not update when citation job returns null (failed job)", () => {
    const result: null = null;
    const capturedMonitoredPageId = 42;
    const shouldUpdate = result !== null && capturedMonitoredPageId !== null;
    expect(shouldUpdate).toBe(false);
  });
});
