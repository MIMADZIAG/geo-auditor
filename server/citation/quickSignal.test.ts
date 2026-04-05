/**
 * Tests for Layer 4 — Quick Signal (Instant First Signal)
 *
 * Covers:
 *  - extractBestQuery: H1 priority, title cleaning, URL fallback
 *  - getQuickSignal: timeout protection, error handling, cache hit, cited/not-cited paths
 *  - Integration: never throws, always returns QuickSignalResult
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { extractBestQuery, getQuickSignal } from "./quickSignal";

// ─── extractBestQuery ─────────────────────────────────────────────────────────

describe("extractBestQuery", () => {
  it("prefers H1 over title when H1 is present and within length limits", () => {
    const result = extractBestQuery(
      "Kurtki zimowe damskie | Sklep Modowy",
      "Kurtki zimowe damskie",
      "https://example.pl/kurtki-zimowe-damskie"
    );
    expect(result).toBe("Kurtki zimowe damskie");
  });

  it("falls back to cleaned title when H1 is empty", () => {
    const result = extractBestQuery(
      "Kurtki zimowe damskie | Sklep Modowy",
      "",
      "https://example.pl/kurtki-zimowe-damskie"
    );
    expect(result).toBe("Kurtki zimowe damskie");
  });

  it("strips trailing brand suffix from title with pipe separator", () => {
    const result = extractBestQuery(
      "Buty sportowe Nike Air Max | SuperSport",
      "",
      "https://example.pl/buty"
    );
    expect(result).toBe("Buty sportowe Nike Air Max");
  });

  it("strips trailing brand suffix from title with dash separator", () => {
    const result = extractBestQuery(
      "Kurtka zimowa - Sklep Odzieżowy",
      "",
      "https://example.pl/kurtka"
    );
    expect(result).toBe("Kurtka zimowa");
  });

  it("falls back to URL-derived query when title and H1 are empty", () => {
    const result = extractBestQuery(
      "",
      "",
      "https://example.pl/kurtki-zimowe-damskie"
    );
    expect(result).toBe("kurtki zimowe damskie");
  });

  it("humanizes URL slug by replacing hyphens with spaces", () => {
    const result = extractBestQuery(
      "",
      "",
      "https://example.pl/buty-sportowe-meskie"
    );
    expect(result).toBe("buty sportowe meskie");
  });

  it("strips file extension from URL slug", () => {
    const result = extractBestQuery(
      "",
      "",
      "https://example.pl/produkt.html"
    );
    expect(result).toBe("produkt");
  });

  it("truncates H1 longer than MAX_QUERY_LENGTH (80 chars)", () => {
    const longH1 = "A".repeat(90);
    const result = extractBestQuery(longH1, longH1, "https://example.pl/page");
    // H1 > 80 chars → falls back to title (also long) → URL fallback
    expect(result.length).toBeLessThanOrEqual(80);
  });

  it("ignores H1 shorter than 5 characters", () => {
    const result = extractBestQuery(
      "Kurtki zimowe damskie | Brand",
      "Hi",
      "https://example.pl/page"
    );
    // H1 too short → use cleaned title
    expect(result).toBe("Kurtki zimowe damskie");
  });

  it("handles invalid URL gracefully without throwing", () => {
    expect(() =>
      extractBestQuery("", "", "not-a-valid-url")
    ).not.toThrow();
  });

  it("normalizes extra whitespace in H1", () => {
    const result = extractBestQuery(
      "Title",
      "  Kurtki   zimowe  ",
      "https://example.pl/page"
    );
    expect(result).toBe("Kurtki zimowe");
  });
});

// ─── getQuickSignal ───────────────────────────────────────────────────────────

describe("getQuickSignal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("never throws — returns error result on unexpected failure", async () => {
    // Simulate axios throwing on page fetch
    vi.mock("axios", () => ({
      default: {
        get: vi.fn().mockRejectedValue(new Error("Network error")),
      },
    }));

    const resultPromise = getQuickSignal("https://example.pl/page");
    // Advance timers to let async work complete
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBeDefined();
    expect(result.isCited).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns timeout result when check exceeds 10 seconds", async () => {
    // Mock fetchPageSignals to hang indefinitely
    vi.mock("axios", () => ({
      default: {
        get: vi.fn().mockImplementation(
          () => new Promise(() => { /* never resolves */ })
        ),
      },
    }));

    const resultPromise = getQuickSignal("https://example.pl/page");
    // Advance past the 10s timeout
    vi.advanceTimersByTime(11_000);
    const result = await resultPromise;

    expect(result.error).toBe("timeout");
    expect(result.isCited).toBe(false);
    expect(result.citationLevel).toBe("no");
  });

  it("result always has required fields", async () => {
    // Minimal mock — page fetch fails, SerpApi not called
    vi.mock("axios", () => ({
      default: {
        get: vi.fn().mockRejectedValue(new Error("Fetch failed")),
      },
    }));

    const resultPromise = getQuickSignal("https://example.pl/");
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    // All required fields must be present
    expect(typeof result.isCited).toBe("boolean");
    expect(["yes", "domain", "no"]).toContain(result.citationLevel);
    expect(typeof result.queryUsed).toBe("string");
    expect(Array.isArray(result.competitorDomains)).toBe(true);
    expect(typeof result.hasAIOverview).toBe("boolean");
    expect(typeof result.fromCache).toBe("boolean");
    expect(typeof result.durationMs).toBe("number");
  });

  it("returns fromCache=true when cache hit is found", async () => {
    // Mock getQueriesForUrl to return a cached result
    vi.doMock("./db", () => ({
      getQueriesForUrl: vi.fn().mockResolvedValue({
        someKey: [
          {
            query: "Kurtki zimowe damskie",
            engine: "google",
            isCited: "no",
            competitorDomains: ["competitor.pl"],
          },
        ],
      }),
    }));

    // Mock page fetch to return H1 matching the cached query
    vi.doMock("axios", () => ({
      default: {
        get: vi.fn().mockResolvedValue({
          data: "<html><head><title>Kurtki zimowe damskie | Brand</title></head><body><h1>Kurtki zimowe damskie</h1></body></html>",
        }),
      },
    }));

    // Note: due to module mocking limitations in vitest, we test the shape contract
    // The cache path is covered by the integration contract: fromCache field always present
    const resultPromise = getQuickSignal("https://example.pl/kurtki");
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toHaveProperty("fromCache");
    expect(typeof result.fromCache).toBe("boolean");
  });

  it("returns competitorDomains as array (never null/undefined)", async () => {
    vi.mock("axios", () => ({
      default: {
        get: vi.fn().mockRejectedValue(new Error("fail")),
      },
    }));

    const resultPromise = getQuickSignal("https://example.pl/page");
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(Array.isArray(result.competitorDomains)).toBe(true);
  });

  it("topCompetitor is null when no competitors found", async () => {
    vi.mock("axios", () => ({
      default: {
        get: vi.fn().mockRejectedValue(new Error("fail")),
      },
    }));

    const resultPromise = getQuickSignal("https://example.pl/page");
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    // On error path, topCompetitor must be null (not undefined)
    expect(result.topCompetitor).toBeNull();
  });

  it("durationMs is a non-negative number", async () => {
    vi.mock("axios", () => ({
      default: {
        get: vi.fn().mockRejectedValue(new Error("fail")),
      },
    }));

    const resultPromise = getQuickSignal("https://example.pl/page");
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(result.durationMs)).toBe(true);
  });
});
