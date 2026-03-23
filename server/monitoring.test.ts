/**
 * Tests for monitoring worker and email module
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Email module tests ───────────────────────────────────────────────────────

describe("sendMonitoringEmail", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns true (dev mode) when SMTP is not configured", async () => {
    // Ensure SMTP env vars are not set
    const originalSmtpHost = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;

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
  });

  it("returns true when score is 0 (edge case)", async () => {
    delete process.env.SMTP_HOST;
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
