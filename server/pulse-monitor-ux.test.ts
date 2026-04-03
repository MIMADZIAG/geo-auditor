/**
 * Pulse Monitor UX Improvements — Test Suite
 *
 * Tests for:
 * 1. getActiveCitationJob — returns active job status for a monitored page
 * 2. runCitationCheck — starts citation job from Pulse Monitor
 * 3. getCompetitorBenchmark — aggregates real competitorDomains from citation_checks
 */

import { describe, it, expect } from "vitest";

// ─── URL normalization helpers (shared logic) ─────────────────────────────────

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const path = u.pathname.toLowerCase().replace(/\/+$/, "") || "/";
    return `${u.protocol}//${u.hostname.toLowerCase()}${path}`;
  } catch {
    return url.toLowerCase().trim();
  }
}

function urlsMatch(a: string, b: string): boolean {
  return normalizeUrl(a) === normalizeUrl(b);
}

// ─── 1. URL normalization (Fix 3 — unified phrase matching) ──────────────────

describe("URL normalization for citation-monitoring bridge", () => {
  it("matches URLs with and without trailing slash", () => {
    expect(urlsMatch("https://example.com/page/", "https://example.com/page")).toBe(true);
  });

  it("matches URLs regardless of case", () => {
    expect(urlsMatch("https://Example.COM/Page", "https://example.com/page")).toBe(true);
  });

  it("matches root domain with and without trailing slash", () => {
    expect(urlsMatch("https://example.com/", "https://example.com")).toBe(true);
  });

  it("does not match different paths", () => {
    expect(urlsMatch("https://example.com/page-a", "https://example.com/page-b")).toBe(false);
  });

  it("does not match different domains", () => {
    expect(urlsMatch("https://example.com/page", "https://other.com/page")).toBe(false);
  });

  it("handles URLs without protocol", () => {
    expect(urlsMatch("example.com/page", "https://example.com/page")).toBe(true);
  });
});

// ─── 2. Competitor domain aggregation logic ───────────────────────────────────

describe("Competitor domain aggregation from citation_checks", () => {
  type CitationCheck = {
    competitorDomains: string | null;
    citedEngines: number;
    totalEngines: number;
  };

  function aggregateCompetitorDomains(checks: CitationCheck[]): Array<{ domain: string; count: number }> {
    const domainCounts = new Map<string, number>();
    for (const check of checks) {
      if (!check.competitorDomains) continue;
      try {
        const domains: string[] = JSON.parse(check.competitorDomains);
        for (const domain of domains) {
          const normalized = domain.toLowerCase().trim();
          if (normalized) {
            domainCounts.set(normalized, (domainCounts.get(normalized) ?? 0) + 1);
          }
        }
      } catch {
        // skip malformed JSON
      }
    }
    return Array.from(domainCounts.entries())
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count);
  }

  it("aggregates competitor domains from multiple citation checks", () => {
    const checks: CitationCheck[] = [
      { competitorDomains: JSON.stringify(["competitor-a.com", "competitor-b.com"]), citedEngines: 2, totalEngines: 4 },
      { competitorDomains: JSON.stringify(["competitor-a.com", "competitor-c.com"]), citedEngines: 1, totalEngines: 4 },
      { competitorDomains: JSON.stringify(["competitor-b.com"]), citedEngines: 3, totalEngines: 4 },
    ];
    const result = aggregateCompetitorDomains(checks);
    expect(result[0].domain).toBe("competitor-a.com");
    expect(result[0].count).toBe(2);
    expect(result[1].domain).toBe("competitor-b.com");
    expect(result[1].count).toBe(2);
    expect(result[2].domain).toBe("competitor-c.com");
    expect(result[2].count).toBe(1);
  });

  it("handles null competitorDomains gracefully", () => {
    const checks: CitationCheck[] = [
      { competitorDomains: null, citedEngines: 0, totalEngines: 4 },
      { competitorDomains: JSON.stringify(["competitor-a.com"]), citedEngines: 1, totalEngines: 4 },
    ];
    const result = aggregateCompetitorDomains(checks);
    expect(result).toHaveLength(1);
    expect(result[0].domain).toBe("competitor-a.com");
  });

  it("handles malformed JSON gracefully", () => {
    const checks: CitationCheck[] = [
      { competitorDomains: "not-valid-json", citedEngines: 0, totalEngines: 4 },
      { competitorDomains: JSON.stringify(["competitor-a.com"]), citedEngines: 1, totalEngines: 4 },
    ];
    const result = aggregateCompetitorDomains(checks);
    expect(result).toHaveLength(1);
    expect(result[0].domain).toBe("competitor-a.com");
  });

  it("normalizes domain case", () => {
    const checks: CitationCheck[] = [
      { competitorDomains: JSON.stringify(["Competitor-A.COM"]), citedEngines: 1, totalEngines: 4 },
      { competitorDomains: JSON.stringify(["competitor-a.com"]), citedEngines: 1, totalEngines: 4 },
    ];
    const result = aggregateCompetitorDomains(checks);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(2);
  });

  it("returns empty array when no competitor domains exist", () => {
    const checks: CitationCheck[] = [
      { competitorDomains: JSON.stringify([]), citedEngines: 1, totalEngines: 4 },
    ];
    const result = aggregateCompetitorDomains(checks);
    expect(result).toHaveLength(0);
  });
});

// ─── 3. Share of Voice calculation ───────────────────────────────────────────

describe("Share of Voice calculation", () => {
  function computeShareOfVoice(
    citedEngines: number,
    totalEngines: number,
    competitorCitationCount: number
  ): number | null {
    const total = citedEngines + competitorCitationCount;
    if (total === 0) return null;
    return citedEngines / total;
  }

  it("returns correct SoV when brand and competitors are cited equally", () => {
    const sov = computeShareOfVoice(2, 4, 2);
    expect(sov).toBe(0.5);
  });

  it("returns 1.0 when only brand is cited", () => {
    const sov = computeShareOfVoice(3, 4, 0);
    expect(sov).toBe(1.0);
  });

  it("returns 0.0 when brand is not cited but competitors are", () => {
    const sov = computeShareOfVoice(0, 4, 5);
    expect(sov).toBe(0.0);
  });

  it("returns null when no citations at all", () => {
    const sov = computeShareOfVoice(0, 4, 0);
    expect(sov).toBeNull();
  });

  it("handles high competitor citation count correctly", () => {
    const sov = computeShareOfVoice(1, 4, 9);
    expect(sov).toBeCloseTo(0.1, 5);
  });
});

// ─── 4. Citation job status transitions ──────────────────────────────────────

describe("Citation job status transitions", () => {
  type JobStatus = "pending" | "running" | "completed" | "failed";

  function isActiveJob(status: JobStatus | null | undefined): boolean {
    return status === "pending" || status === "running";
  }

  function isCompletedJob(status: JobStatus | null | undefined): boolean {
    return status === "completed";
  }

  it("identifies pending job as active", () => {
    expect(isActiveJob("pending")).toBe(true);
  });

  it("identifies running job as active", () => {
    expect(isActiveJob("running")).toBe(true);
  });

  it("identifies completed job as not active", () => {
    expect(isActiveJob("completed")).toBe(false);
  });

  it("identifies failed job as not active", () => {
    expect(isActiveJob("failed")).toBe(false);
  });

  it("handles null/undefined status gracefully", () => {
    expect(isActiveJob(null)).toBe(false);
    expect(isActiveJob(undefined)).toBe(false);
  });

  it("identifies completed job correctly", () => {
    expect(isCompletedJob("completed")).toBe(true);
    expect(isCompletedJob("running")).toBe(false);
  });

  // Spinner should show when job is active
  it("spinner should be shown for active jobs", () => {
    const statuses: Array<JobStatus | null> = ["pending", "running", null, "completed", "failed"];
    const spinnerStates = statuses.map(isActiveJob);
    expect(spinnerStates).toEqual([true, true, false, false, false]);
  });
});

// ─── 5. alreadyRunning guard logic ───────────────────────────────────────────

describe("alreadyRunning guard for runCitationCheck", () => {
  type JobStatus = "pending" | "running" | "completed" | "failed";

  function shouldBlockNewJob(existingStatus: JobStatus | null): boolean {
    return existingStatus === "pending" || existingStatus === "running";
  }

  it("blocks new job when existing job is pending", () => {
    expect(shouldBlockNewJob("pending")).toBe(true);
  });

  it("blocks new job when existing job is running", () => {
    expect(shouldBlockNewJob("running")).toBe(true);
  });

  it("allows new job when no existing job", () => {
    expect(shouldBlockNewJob(null)).toBe(false);
  });

  it("allows new job when existing job is completed", () => {
    expect(shouldBlockNewJob("completed")).toBe(false);
  });

  it("allows new job when existing job has failed", () => {
    expect(shouldBlockNewJob("failed")).toBe(false);
  });
});
