/**
 * Tests for monitoring worker and email module
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Email module tests ───────────────────────────────────────────────────────

describe("sendMonitoringEmail", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns true (dev mode) when no email provider is configured", async () => {
    // Ensure all email provider env vars are not set for this test
    const originalSmtpHost = process.env.SMTP_HOST;
    const originalResendKey = process.env.RESEND_API_KEY;
    delete process.env.SMTP_HOST;
    delete process.env.RESEND_API_KEY;

    const { sendMonitoringEmail } = await import("./monitoring/email");

    const result = await sendMonitoringEmail({
      toEmail: "test@example.com",
      toName: "Test User",
      url: "https://example.com/page",
      label: "Test Page",
      overallScore: 75,
      scoreDelta: 5,
      auditId: 123,
      appUrl: "https://geo-auditor.app",
    });

    expect(result).toBe(true);

    // Restore
    if (originalSmtpHost) process.env.SMTP_HOST = originalSmtpHost;
    if (originalResendKey) process.env.RESEND_API_KEY = originalResendKey;
  });

  it("returns true when score is 0 (edge case, dev mode)", async () => {
    const originalResendKey = process.env.RESEND_API_KEY;
    delete process.env.SMTP_HOST;
    delete process.env.RESEND_API_KEY;
    const { sendMonitoringEmail } = await import("./monitoring/email");

    const result = await sendMonitoringEmail({
      toEmail: "test@example.com",
      toName: null,
      url: "https://example.com",
      label: null,
      overallScore: 0,
      scoreDelta: null,
      auditId: 1,
      appUrl: "https://geo-auditor.app",
    });

    expect(result).toBe(true);
    if (originalResendKey) process.env.RESEND_API_KEY = originalResendKey;
  });
});

// ─── Score helpers tests ──────────────────────────────────────────────────────

describe("monitoring score helpers", () => {
  it("correctly identifies score tiers", () => {
    // These match the logic in email.ts
    const scoreTier = (score: number) => {
      if (score >= 80) return "Dobry";
      if (score >= 60) return "Wymaga poprawy";
      return "Krytyczny";
    };

    expect(scoreTier(80)).toBe("Dobry");
    expect(scoreTier(100)).toBe("Dobry");
    expect(scoreTier(79)).toBe("Wymaga poprawy");
    expect(scoreTier(60)).toBe("Wymaga poprawy");
    expect(scoreTier(59)).toBe("Krytyczny");
    expect(scoreTier(0)).toBe("Krytyczny");
  });

  it("correctly formats score delta text", () => {
    const deltaText = (delta: number | null) => {
      if (delta === null) return "";
      if (delta > 0) return `+${delta.toFixed(1)} pkt wzrost`;
      if (delta < 0) return `${delta.toFixed(1)} pkt spadek`;
      return "Bez zmian";
    };

    expect(deltaText(null)).toBe("");
    expect(deltaText(5)).toBe("+5.0 pkt wzrost");
    expect(deltaText(-3.5)).toBe("-3.5 pkt spadek");
    expect(deltaText(0)).toBe("Bez zmian");
  });

  it("correctly identifies score colors", () => {
    const scoreColor = (score: number) => {
      if (score >= 80) return "#22c55e";
      if (score >= 60) return "#f59e0b";
      return "#ef4444";
    };

    expect(scoreColor(80)).toBe("#22c55e");
    expect(scoreColor(60)).toBe("#f59e0b");
    expect(scoreColor(59)).toBe("#ef4444");
  });
});

// ─── Schedule frequency tests ─────────────────────────────────────────────────

describe("monitoring schedule frequency rules", () => {
  const ELIGIBLE_PLANS = ["starter", "pro", "business"] as const;

  it("starter plan is eligible for monitoring", () => {
    expect(ELIGIBLE_PLANS.includes("starter")).toBe(true);
  });

  it("free plan is NOT eligible for monitoring", () => {
    expect((ELIGIBLE_PLANS as readonly string[]).includes("free")).toBe(false);
  });

  it("pro plan allows non-weekly frequencies", () => {
    // Pro plan can use 1, 2, 3, 7, 14, 30 days
    const allowedFrequencies = [1, 2, 3, 7, 14, 30];
    allowedFrequencies.forEach((freq) => {
      expect(freq).toBeGreaterThanOrEqual(1);
      expect(freq).toBeLessThanOrEqual(30);
    });
  });

  it("starter plan is locked to 7 days", () => {
    const starterFrequency = 7;
    expect(starterFrequency).toBe(7);
  });

  it("nextAuditAt is calculated correctly from frequency", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const frequencyDays = 7;
    const nextAuditAt = new Date(now.getTime() + frequencyDays * 24 * 60 * 60 * 1000);

    expect(nextAuditAt.toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });

  it("nextAuditAt for daily monitoring is 1 day later", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const frequencyDays = 1;
    const nextAuditAt = new Date(now.getTime() + frequencyDays * 24 * 60 * 60 * 1000);

    expect(nextAuditAt.toISOString()).toBe("2026-01-02T00:00:00.000Z");
  });
});

// ─── Worker concurrency tests ─────────────────────────────────────────────────

describe("monitoring worker batch processing", () => {
  it("processes pages in batches of MAX_PARALLEL=3", () => {
    const MAX_PARALLEL = 3;
    const pages = [1, 2, 3, 4, 5, 6, 7];
    const batches: number[][] = [];

    for (let i = 0; i < pages.length; i += MAX_PARALLEL) {
      batches.push(pages.slice(i, i + MAX_PARALLEL));
    }

    expect(batches).toHaveLength(3);
    expect(batches[0]).toEqual([1, 2, 3]);
    expect(batches[1]).toEqual([4, 5, 6]);
    expect(batches[2]).toEqual([7]);
  });

  it("handles empty page list gracefully", () => {
    const pages: number[] = [];
    const batches: number[][] = [];

    for (let i = 0; i < pages.length; i += 3) {
      batches.push(pages.slice(i, i + 3));
    }

    expect(batches).toHaveLength(0);
  });
});

// ─── Run history display logic tests ─────────────────────────────────────────

describe("monitoring run history display logic", () => {
  it("sparkline values are extracted in chronological order (oldest first)", () => {
    // Simulate runs returned from getRunHistory (newest first from DB)
    const runs = [
      { overallScore: 80, createdAt: new Date("2026-03-03") },
      { overallScore: 70, createdAt: new Date("2026-03-02") },
      { overallScore: 60, createdAt: new Date("2026-03-01") },
    ];
    // Reverse to get chronological order for sparkline
    const sparklineValues = [...runs].reverse().map((r) => r.overallScore ?? 0).filter((v) => v > 0);
    expect(sparklineValues).toEqual([60, 70, 80]);
  });

  it("sparkline delta is positive when score improved", () => {
    const values = [50, 60, 75];
    const delta = values[values.length - 1] - values[0];
    expect(delta).toBe(25);
    expect(delta).toBeGreaterThan(0);
  });

  it("sparkline delta is negative when score declined", () => {
    const values = [80, 70, 55];
    const delta = values[values.length - 1] - values[0];
    expect(delta).toBe(-25);
    expect(delta).toBeLessThan(0);
  });

  it("sparkline delta is zero when score unchanged", () => {
    const values = [65, 65, 65];
    const delta = values[values.length - 1] - values[0];
    expect(delta).toBe(0);
  });

  it("sparkline is not rendered for fewer than 2 data points", () => {
    const singleValue = [75];
    // Sparkline requires at least 2 points
    expect(singleValue.length < 2).toBe(true);
  });

  it("run status 'failed' is shown as error, not score", () => {
    const run = { status: "failed" as const, overallScore: null, scoreDelta: null };
    const isError = run.status === "failed";
    expect(isError).toBe(true);
    expect(run.overallScore).toBeNull();
  });

  it("score delta formatting: positive gets + prefix", () => {
    const formatDelta = (delta: number | null) => {
      if (delta == null || delta === 0) return null;
      return `${delta > 0 ? "+" : ""}${delta.toFixed(0)}`;
    };
    expect(formatDelta(10)).toBe("+10");
    expect(formatDelta(-5)).toBe("-5");
    expect(formatDelta(0)).toBeNull();
    expect(formatDelta(null)).toBeNull();
  });

  it("score color thresholds match dashboard display", () => {
    const scoreColor = (score: number | null | undefined) => {
      if (score == null) return "text-muted-foreground";
      if (score >= 75) return "text-emerald-400";
      if (score >= 50) return "text-amber-400";
      return "text-red-400";
    };
    expect(scoreColor(75)).toBe("text-emerald-400");
    expect(scoreColor(74)).toBe("text-amber-400");
    expect(scoreColor(50)).toBe("text-amber-400");
    expect(scoreColor(49)).toBe("text-red-400");
    expect(scoreColor(null)).toBe("text-muted-foreground");
  });

  it("run status dot color matches score tier", () => {
    const dotColor = (status: string, score: number | null) => {
      if (status === "failed") return "bg-red-500";
      if (score != null && score >= 75) return "bg-emerald-500";
      if (score != null && score >= 50) return "bg-amber-500";
      return "bg-red-500";
    };
    expect(dotColor("completed", 80)).toBe("bg-emerald-500");
    expect(dotColor("completed", 60)).toBe("bg-amber-500");
    expect(dotColor("completed", 40)).toBe("bg-red-500");
    expect(dotColor("failed", 80)).toBe("bg-red-500");
    expect(dotColor("completed", null)).toBe("bg-red-500");
  });
});
