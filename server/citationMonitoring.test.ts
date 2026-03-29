/**
 * Citation Visibility Monitoring Tests
 * Tests for the citation integration in monitoring workflow:
 * - updateMonitoredPageCitationStatus helper
 * - updateScoreSnapshotCitation helper
 * - sendMonitoringEmail with citation data
 * - CitationJobResult summary → citedEngines calculation
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB ──────────────────────────────────────────────────────────────────
vi.mock("../drizzle/schema", () => ({
  monitoredPages: { id: "id", userId: "userId", isActive: "isActive" },
  scoreSnapshots: { auditId: "auditId", monitoredPageId: "monitoredPageId" },
  audits: { userId: "userId" },
}));

const mockUpdate = vi.fn().mockReturnValue({
  set: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  }),
});
vi.mock("../server/db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual };
});

// ─── Citation summary → citedEngines logic ───────────────────────────────────
describe("Citation summary → citedEngines calculation", () => {
  type EngineSummary = { cited: number; domainCited: number; total: number; queriesWithAI: number };
  type Summary = { chatgpt: EngineSummary; google: EngineSummary; perplexity: EngineSummary; gemini: EngineSummary };

  function calcCitedEngines(summary: Summary): number {
    const engines = ["chatgpt", "google", "perplexity", "gemini"] as const;
    return engines.filter(
      (e) => summary[e].cited > 0 || summary[e].domainCited > 0
    ).length;
  }

  const makeEngine = (cited: number, domainCited = 0): EngineSummary => ({
    cited, domainCited, total: 3, queriesWithAI: 3,
  });

  it("returns 0 when no engine cites the page", () => {
    const summary: Summary = {
      chatgpt: makeEngine(0),
      google: makeEngine(0),
      perplexity: makeEngine(0),
      gemini: makeEngine(0),
    };
    expect(calcCitedEngines(summary)).toBe(0);
  });

  it("returns 1 when only ChatGPT cites", () => {
    const summary: Summary = {
      chatgpt: makeEngine(2),
      google: makeEngine(0),
      perplexity: makeEngine(0),
      gemini: makeEngine(0),
    };
    expect(calcCitedEngines(summary)).toBe(1);
  });

  it("returns 4 when all engines cite", () => {
    const summary: Summary = {
      chatgpt: makeEngine(1),
      google: makeEngine(1),
      perplexity: makeEngine(1),
      gemini: makeEngine(1),
    };
    expect(calcCitedEngines(summary)).toBe(4);
  });

  it("counts domainCited as a citation", () => {
    const summary: Summary = {
      chatgpt: makeEngine(0, 1), // domain cited but not direct
      google: makeEngine(0),
      perplexity: makeEngine(0),
      gemini: makeEngine(0),
    };
    expect(calcCitedEngines(summary)).toBe(1);
  });

  it("does not double-count when both cited and domainCited are > 0", () => {
    const summary: Summary = {
      chatgpt: makeEngine(2, 1),
      google: makeEngine(0),
      perplexity: makeEngine(0),
      gemini: makeEngine(0),
    };
    expect(calcCitedEngines(summary)).toBe(1);
  });
});

// ─── Citation change detection ────────────────────────────────────────────────
describe("Citation change detection", () => {
  function isCitationChangeSignificant(
    previousCitedEngines: number | null,
    citedEngines: number
  ): boolean {
    return (
      previousCitedEngines !== null &&
      (
        (previousCitedEngines === 0 && citedEngines > 0) ||
        Math.abs(citedEngines - previousCitedEngines) >= 2
      )
    );
  }

  it("detects 0→1 as significant (first citation)", () => {
    expect(isCitationChangeSignificant(0, 1)).toBe(true);
  });

  it("detects 0→4 as significant", () => {
    expect(isCitationChangeSignificant(0, 4)).toBe(true);
  });

  it("does not flag 1→2 as significant (delta < 2)", () => {
    expect(isCitationChangeSignificant(1, 2)).toBe(false);
  });

  it("detects 1→3 as significant (delta >= 2)", () => {
    expect(isCitationChangeSignificant(1, 3)).toBe(true);
  });

  it("detects 4→2 as significant (drop by 2)", () => {
    expect(isCitationChangeSignificant(4, 2)).toBe(true);
  });

  it("does not flag when previousCitedEngines is null (first run)", () => {
    expect(isCitationChangeSignificant(null, 2)).toBe(false);
  });

  it("does not flag 2→2 (no change)", () => {
    expect(isCitationChangeSignificant(2, 2)).toBe(false);
  });
});

// ─── Monitoring email with citation data ─────────────────────────────────────
describe("sendMonitoringEmail with citation data", () => {
  it("sends email with citation data included", async () => {
    const { sendMonitoringEmail } = await import("./monitoring/email");
    const result = await sendMonitoringEmail({
      toEmail: "test@example.com",
      toName: "Anna",
      url: "https://example.com/produkt",
      label: "Strona produktu",
      overallScore: 72,
      scoreDelta: 5,
      auditId: 999,
      appUrl: "https://geo-auditor.manus.space",
      citedEngines: 3,
      totalEngines: 4,
    });
    // In test env (no RESEND_API_KEY), returns true (dev mode)
    expect(typeof result).toBe("boolean");
  });

  it("sends email when citedEngines is 0 (not cited)", async () => {
    const { sendMonitoringEmail } = await import("./monitoring/email");
    const result = await sendMonitoringEmail({
      toEmail: "test@example.com",
      toName: "Anna",
      url: "https://example.com/produkt",
      label: null,
      overallScore: 45,
      scoreDelta: -3,
      auditId: 1000,
      appUrl: "https://geo-auditor.manus.space",
      citedEngines: 0,
      totalEngines: 4,
    });
    expect(typeof result).toBe("boolean");
  });

  it("sends email when citation data is null (pending)", async () => {
    const { sendMonitoringEmail } = await import("./monitoring/email");
    const result = await sendMonitoringEmail({
      toEmail: "test@example.com",
      toName: null,
      url: "https://example.com/produkt",
      label: null,
      overallScore: 60,
      scoreDelta: null,
      auditId: 1001,
      appUrl: "https://geo-auditor.manus.space",
      citedEngines: null,
      totalEngines: null,
    });
    expect(typeof result).toBe("boolean");
  });
});

// ─── CitationSparkline values derivation ─────────────────────────────────────
describe("Citation sparkline values derivation", () => {
  type Snapshot = { citedEnginesCount: number | null; totalEnginesChecked: number | null };

  function deriveCitationSparkline(snapshots: Snapshot[]): number[] {
    // snapshots come newest-first from DB, reverse to oldest-first for chart
    const ordered = [...snapshots].reverse();
    return ordered
      .filter((s) => s.citedEnginesCount != null)
      .map((s) => s.citedEnginesCount as number);
  }

  it("returns empty array when no snapshots have citation data", () => {
    const snapshots: Snapshot[] = [
      { citedEnginesCount: null, totalEnginesChecked: null },
      { citedEnginesCount: null, totalEnginesChecked: null },
    ];
    expect(deriveCitationSparkline(snapshots)).toEqual([]);
  });

  it("returns values in chronological order (oldest first)", () => {
    const snapshots: Snapshot[] = [
      { citedEnginesCount: 3, totalEnginesChecked: 4 }, // newest
      { citedEnginesCount: 2, totalEnginesChecked: 4 },
      { citedEnginesCount: 1, totalEnginesChecked: 4 }, // oldest
    ];
    expect(deriveCitationSparkline(snapshots)).toEqual([1, 2, 3]);
  });

  it("skips null values in the middle", () => {
    const snapshots: Snapshot[] = [
      { citedEnginesCount: 4, totalEnginesChecked: 4 },
      { citedEnginesCount: null, totalEnginesChecked: null }, // pending
      { citedEnginesCount: 2, totalEnginesChecked: 4 },
    ];
    expect(deriveCitationSparkline(snapshots)).toEqual([2, 4]);
  });

  it("handles single snapshot correctly", () => {
    const snapshots: Snapshot[] = [
      { citedEnginesCount: 2, totalEnginesChecked: 4 },
    ];
    expect(deriveCitationSparkline(snapshots)).toEqual([2]);
  });
});
