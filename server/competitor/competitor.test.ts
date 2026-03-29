/**
 * Competitor Intelligence — unit tests
 *
 * Covers:
 *  - extractTopCompetitorUrls: ranking, dedup, limit, target exclusion
 *  - mapFindingsToColumns: check ID → DB column mapping, category scores
 */

import { describe, it, expect } from "vitest";
import { extractTopCompetitorUrls, mapFindingsToColumns } from "./engine";
import type { AuditFindings } from "../audit/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCheck(id: string, status: "pass" | "fail" | "warning", value?: unknown) {
  return { id, status, value: value ?? null, message: "", severity: "info" as const };
}

function makeFindings(overrides: Partial<AuditFindings> = {}): AuditFindings {
  const empty = { score: 0, checks: [] };
  return {
    technical: empty,
    structuredData: empty,
    contentStructure: empty,
    eeat: empty,
    aiCrawlers: empty,
    metaTags: empty,
    ...overrides,
  } as AuditFindings;
}

/** Build the allResults array shape expected by extractTopCompetitorUrls */
function makeResults(urlLists: string[][]): Array<{ allCitedUrls: string[]; competitorDomains: string[] }> {
  return urlLists.map(urls => ({ allCitedUrls: urls, competitorDomains: [] }));
}

// ─── extractTopCompetitorUrls ─────────────────────────────────────────────────

describe("extractTopCompetitorUrls", () => {
  const target = "obi.pl";

  it("returns top-N entries sorted by citation frequency descending", () => {
    const results = makeResults([
      [
        "https://leroymerlin.pl/panele",
        "https://leroymerlin.pl/panele",
        "https://leroymerlin.pl/panele",
        "https://komfort.pl/panele",
        "https://komfort.pl/panele",
        "https://bricomarche.pl/page",
      ],
    ]);
    const result = extractTopCompetitorUrls(results, target, 5);
    expect(result[0].url).toContain("leroymerlin.pl");
    expect(result[0].citationCount).toBe(3);
    expect(result[1].url).toContain("komfort.pl");
    expect(result[1].citationCount).toBe(2);
  });

  it("excludes URLs from the target domain", () => {
    const results = makeResults([
      [
        "https://obi.pl/panele",
        "https://obi.pl/panele",
        "https://leroymerlin.pl/panele",
      ],
    ]);
    const result = extractTopCompetitorUrls(results, target, 5);
    expect(result.every(r => !r.url.includes("obi.pl"))).toBe(true);
    expect(result.length).toBe(1);
  });

  it("deduplicates identical URLs into a single entry with count", () => {
    const results = makeResults([
      Array(5).fill("https://leroymerlin.pl/panele"),
    ]);
    const result = extractTopCompetitorUrls(results, target, 5);
    expect(result.length).toBe(1);
    expect(result[0].citationCount).toBe(5);
  });

  it("respects the topN limit", () => {
    const urls = Array.from({ length: 20 }, (_, i) => `https://site${i}.pl/page`);
    const results = makeResults([urls]);
    const result = extractTopCompetitorUrls(results, target, 3);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("returns empty array for empty input", () => {
    expect(extractTopCompetitorUrls([], target, 5)).toEqual([]);
  });

  it("assigns sequential ranks starting from 1", () => {
    const results = makeResults([
      ["https://a.pl/p", "https://a.pl/p", "https://b.pl/p"],
    ]);
    const result = extractTopCompetitorUrls(results, target, 5);
    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(2);
  });

  it("aggregates URLs across multiple result objects", () => {
    const results = makeResults([
      ["https://leroymerlin.pl/panele"],
      ["https://leroymerlin.pl/panele"],
      ["https://komfort.pl/panele"],
    ]);
    const result = extractTopCompetitorUrls(results, target, 5);
    const lm = result.find(r => r.url.includes("leroymerlin"));
    expect(lm?.citationCount).toBe(2);
  });
});

// ─── mapFindingsToColumns ─────────────────────────────────────────────────────

describe("mapFindingsToColumns", () => {
  it("maps category scores to correct column names", () => {
    const findings = makeFindings({
      technical:        { score: 82, checks: [] },
      structuredData:   { score: 61, checks: [] },
      contentStructure: { score: 73, checks: [] },
      eeat:             { score: 55, checks: [] },
      aiCrawlers:       { score: 91, checks: [] },
      metaTags:         { score: 78, checks: [] },
    });
    const cols = mapFindingsToColumns(findings, 73, 450);
    expect(cols.overallScore).toBe(73);
    expect(cols.technicalScore).toBe(82);
    expect(cols.structuredDataScore).toBe(61);
    expect(cols.contentStructureScore).toBe(73);
    expect(cols.eeatScore).toBe(55);
    expect(cols.aiCrawlersScore).toBe(91);
    expect(cols.metaTagsScore).toBe(78);
    expect(cols.tech_response_time_ms).toBe(450);
  });

  it("maps https check → tech_https = 1 when status=pass", () => {
    const findings = makeFindings({
      technical: { score: 80, checks: [makeCheck("https", "pass")] },
    });
    const cols = mapFindingsToColumns(findings, 80, 300);
    expect(cols.tech_https).toBe(1);
  });

  it("maps https check → tech_https = 0 when status=fail", () => {
    const findings = makeFindings({
      technical: { score: 40, checks: [makeCheck("https", "fail")] },
    });
    const cols = mapFindingsToColumns(findings, 40, 300);
    expect(cols.tech_https).toBe(0);
  });

  it("maps robots_disallow_page (inverted) → tech_robots_disallow = 1 when status=fail (bad condition present)", () => {
    // checkBad: 1 when status=fail (the bad condition is present)
    const findings = makeFindings({
      technical: { score: 60, checks: [makeCheck("robots_disallow_page", "fail")] },
    });
    const cols = mapFindingsToColumns(findings, 60, 300);
    expect(cols.tech_robots_disallow).toBe(1);
  });

  it("maps robots_disallow_page (inverted) → tech_robots_disallow = 0 when status=pass (no block)", () => {
    const findings = makeFindings({
      technical: { score: 80, checks: [makeCheck("robots_disallow_page", "pass")] },
    });
    const cols = mapFindingsToColumns(findings, 80, 300);
    expect(cols.tech_robots_disallow).toBe(0);
  });

  it("maps faq_schema check → sd_faq_schema = 1 when pass", () => {
    const findings = makeFindings({
      structuredData: { score: 70, checks: [makeCheck("faq_schema", "pass")] },
    });
    const cols = mapFindingsToColumns(findings, 70, 300);
    expect(cols.sd_faq_schema).toBe(1);
  });

  it("maps faq_schema check → sd_faq_schema = 0 when fail", () => {
    const findings = makeFindings({
      structuredData: { score: 40, checks: [makeCheck("faq_schema", "fail")] },
    });
    const cols = mapFindingsToColumns(findings, 40, 300);
    expect(cols.sd_faq_schema).toBe(0);
  });

  it("maps h1_present check → cs_h1_present = 1 when pass", () => {
    const findings = makeFindings({
      contentStructure: { score: 80, checks: [makeCheck("h1_present", "pass")] },
    });
    const cols = mapFindingsToColumns(findings, 80, 300);
    expect(cols.cs_h1_present).toBe(1);
  });

  it("maps author_byline check → eeat_author_byline = 1 when pass", () => {
    const findings = makeFindings({
      eeat: { score: 60, checks: [makeCheck("author_byline", "pass")] },
    });
    const cols = mapFindingsToColumns(findings, 60, 300);
    expect(cols.eeat_author_byline).toBe(1);
  });

  it("returns null for missing checks (check not found → null)", () => {
    const findings = makeFindings({ technical: { score: 80, checks: [] } });
    const cols = mapFindingsToColumns(findings, 80, 300);
    expect(cols.tech_https).toBeNull();
  });

  it("does not throw for unknown check IDs", () => {
    const findings = makeFindings({
      technical: { score: 80, checks: [makeCheck("unknown_future_check_xyz", "pass")] },
    });
    expect(() => mapFindingsToColumns(findings, 80, 300)).not.toThrow();
  });

  it("rounds scores to integers", () => {
    const findings = makeFindings({
      technical: { score: 82.7, checks: [] },
    });
    const cols = mapFindingsToColumns(findings, 72.3, 300);
    expect(cols.overallScore).toBe(72);
    expect(cols.technicalScore).toBe(83);
  });
});
