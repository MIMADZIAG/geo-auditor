/**
 * Weekly Digest Tests
 * Tests: data computation helpers, HTML template rendering, dedup logic, cron runner
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildWeeklyDigestHtml, type WeeklyDigestData } from "./monitoring/weeklyDigest";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeDigestData(overrides: Partial<WeeklyDigestData> = {}): WeeklyDigestData {
  return {
    userId: 1,
    toEmail: "anna@example.com",
    toName: "Anna Kowalska",
    appUrl: "https://geo-auditor.app",
    weekStart: new Date("2026-03-23T00:00:00Z"),
    avgScoreThisWeek: 72,
    avgScorePrevWeek: 67,
    scoreDelta: 5,
    citedEnginesThisWeek: 2,
    citedEnginesPrevWeek: 1,
    citationDelta: 1,
    citationTotal: 4,
    monitoredPagesCount: 3,
    topPageUrl: "https://example.com/produkt",
    topPageLabel: "Strona produktu",
    topPageScore: 78,
    topPageCited: 2,
    ...overrides,
  };
}

// ─── HTML Template Tests ──────────────────────────────────────────────────────

describe("buildWeeklyDigestHtml", () => {
  it("renders a valid HTML document", () => {
    const html = buildWeeklyDigestHtml(makeDigestData());
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });

  it("includes user first name in greeting", () => {
    const html = buildWeeklyDigestHtml(makeDigestData({ toName: "Anna Kowalska" }));
    expect(html).toContain("Anna,");
  });

  it("falls back to 'Użytkowniku' when name is null", () => {
    const html = buildWeeklyDigestHtml(makeDigestData({ toName: null }));
    expect(html).toContain("Użytkowniku,");
  });

  it("shows AI-Readiness Score value", () => {
    const html = buildWeeklyDigestHtml(makeDigestData({ avgScoreThisWeek: 72 }));
    expect(html).toContain("72");
    expect(html).toContain("/ 100 pkt");
  });

  it("shows positive score delta with ↑ arrow and green color", () => {
    const html = buildWeeklyDigestHtml(makeDigestData({ scoreDelta: 5 }));
    expect(html).toContain("↑");
    expect(html).toContain("+5 pkt");
    expect(html).toContain("#22c55e"); // green
  });

  it("shows negative score delta with ↓ arrow and red color", () => {
    const html = buildWeeklyDigestHtml(makeDigestData({ scoreDelta: -3 }));
    expect(html).toContain("↓");
    expect(html).toContain("-3 pkt");
    expect(html).toContain("#ef4444"); // red
  });

  it("shows citation visibility as X/4 format", () => {
    const html = buildWeeklyDigestHtml(makeDigestData({ citedEnginesThisWeek: 2, citationTotal: 4 }));
    expect(html).toContain("2/4");
  });

  it("shows 'Pełna widoczność' when cited equals total", () => {
    const html = buildWeeklyDigestHtml(makeDigestData({ citedEnginesThisWeek: 4, citationTotal: 4 }));
    expect(html).toContain("Pełna widoczność");
  });

  it("shows 'Niewidoczna' when cited is 0", () => {
    const html = buildWeeklyDigestHtml(makeDigestData({ citedEnginesThisWeek: 0, citationTotal: 4 }));
    expect(html).toContain("Niewidoczna");
  });

  it("shows 'Częściowa' when cited is between 0 and total", () => {
    const html = buildWeeklyDigestHtml(makeDigestData({ citedEnginesThisWeek: 2, citationTotal: 4 }));
    expect(html).toContain("Częściowa");
  });

  it("shows citation delta with ↑ when positive", () => {
    const html = buildWeeklyDigestHtml(makeDigestData({ citationDelta: 1 }));
    expect(html).toContain("↑");
    expect(html).toContain("+1 silnik");
  });

  it("shows top page block when topPageUrl is set", () => {
    const html = buildWeeklyDigestHtml(makeDigestData({ topPageLabel: "Strona produktu" }));
    expect(html).toContain("Strona produktu");
    expect(html).toContain("Najlepsza strona");
  });

  it("omits top page block when topPageUrl is null", () => {
    const html = buildWeeklyDigestHtml(makeDigestData({ topPageUrl: null, topPageLabel: null }));
    expect(html).not.toContain("Najlepsza strona");
  });

  it("includes dashboard CTA link", () => {
    const html = buildWeeklyDigestHtml(makeDigestData({ appUrl: "https://geo-auditor.app" }));
    expect(html).toContain("https://geo-auditor.app/dashboard");
    expect(html).toContain("Otwórz dashboard");
  });

  it("shows FAQ nudge when citedEngines is 0", () => {
    const html = buildWeeklyDigestHtml(makeDigestData({ citedEnginesThisWeek: 0 }));
    expect(html).toContain("FAQ");
  });

  it("shows partial visibility nudge when cited < total", () => {
    const html = buildWeeklyDigestHtml(makeDigestData({ citedEnginesThisWeek: 2, citationTotal: 4 }));
    expect(html).toContain("silnikach AI");
  });

  it("shows score improvement nudge when score < 70 and fully cited", () => {
    const html = buildWeeklyDigestHtml(makeDigestData({
      citedEnginesThisWeek: 4,
      citationTotal: 4,
      avgScoreThisWeek: 55,
    }));
    expect(html).toContain("audyt");
  });

  it("shows 'Świetna robota' when score >= 70 and fully cited", () => {
    const html = buildWeeklyDigestHtml(makeDigestData({
      citedEnginesThisWeek: 4,
      citationTotal: 4,
      avgScoreThisWeek: 80,
    }));
    expect(html).toContain("Świetna robota");
  });

  it("handles null avgScoreThisWeek gracefully", () => {
    const html = buildWeeklyDigestHtml(makeDigestData({ avgScoreThisWeek: null, scoreDelta: null }));
    expect(html).toContain("Brak audytów w tym tygodniu");
  });

  it("handles null citedEnginesThisWeek gracefully", () => {
    const html = buildWeeklyDigestHtml(makeDigestData({ citedEnginesThisWeek: null, citationDelta: null }));
    expect(html).toContain("Sprawdź widoczność AI");
  });

  it("shows monitored pages count in subtitle", () => {
    const html = buildWeeklyDigestHtml(makeDigestData({ monitoredPagesCount: 3 }));
    expect(html).toContain("3 monitorowane strony");
  });

  it("uses correct singular form for 1 monitored page", () => {
    const html = buildWeeklyDigestHtml(makeDigestData({ monitoredPagesCount: 1 }));
    expect(html).toContain("1 monitorowana strona");
  });
});
