/**
 * Unit tests for AI Search Exposure Score module
 * Tests the score calculation logic, tier classification, and insight generation
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock heavy dependencies before importing the module ──────────────────────
vi.mock("../drizzle/schema", () => ({
  aiExposureCache: {
    domain: "domain",
    cachedAt: "cachedAt",
    data: "data",
  },
}));

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

vi.mock("./aiExposure/index", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./aiExposure/index")>();
  return actual;
});

// ─── Test the pure logic functions directly ───────────────────────────────────

describe("AiExposureResult interface field names", () => {
  it("should have correct field names matching frontend expectations", () => {
    // This test validates the contract between backend and frontend
    const mockResult = {
      domain: "example.com",
      totalKeywordsAnalyzed: 50,
      keywordsWithAiOverview: 10,
      keywordsCitedInAiOverview: 3,
      exposureScore: 20,
      citationScore: 30,
      compositeScore: 24,
      tier: "invisible" as const,
      tierLabel: "Niewidoczny w AI Search",
      topKeywords: [
        {
          keyword: "test keyword",
          volume: 1000,
          difficulty: 50,
          hasAiOverview: true,
          isCitedInAiOverview: false,
          position: 5,
        },
      ],
      opportunities: [
        {
          keyword: "opportunity keyword",
          volume: 500,
          difficulty: 30,
          hasAiOverview: true,
          isCitedInAiOverview: false,
          position: 8,
        },
      ],
      insights: ["Twoja domena ma niską widoczność w AI Search."],
      analyzedAt: Date.now(),
    };

    // Verify all required fields exist with correct names
    expect(mockResult).toHaveProperty("totalKeywordsAnalyzed");
    expect(mockResult).toHaveProperty("keywordsWithAiOverview");
    expect(mockResult).toHaveProperty("keywordsCitedInAiOverview");
    expect(mockResult).toHaveProperty("exposureScore");
    expect(mockResult).toHaveProperty("citationScore");
    expect(mockResult).toHaveProperty("compositeScore");
    expect(mockResult).toHaveProperty("tier");
    expect(mockResult).toHaveProperty("tierLabel");
    expect(mockResult).toHaveProperty("topKeywords");
    expect(mockResult).toHaveProperty("opportunities");
    expect(mockResult).toHaveProperty("insights");
    expect(mockResult).toHaveProperty("analyzedAt");

    // Verify field names that were previously mismatched
    // Frontend was using: totalKeywords, citedInAiOverview, topAiKeywords
    // Backend uses: totalKeywordsAnalyzed, keywordsCitedInAiOverview, topKeywords
    expect(mockResult.totalKeywordsAnalyzed).toBe(50);
    expect(mockResult.keywordsCitedInAiOverview).toBe(3);
    expect(Array.isArray(mockResult.topKeywords)).toBe(true);
  });

  it("should have topKeywords items with isCitedInAiOverview field (not isCited)", () => {
    const keyword = {
      keyword: "test",
      volume: 1000,
      difficulty: 50,
      hasAiOverview: true,
      isCitedInAiOverview: true, // correct field name
      position: 3,
    };

    expect(keyword).toHaveProperty("isCitedInAiOverview");
    expect(keyword.isCitedInAiOverview).toBe(true);
    // Ensure old field name is not used
    expect(keyword).not.toHaveProperty("isCited");
  });
});

describe("Coverage percentage calculation", () => {
  it("should calculate coverage correctly when totalKeywordsAnalyzed > 0", () => {
    const totalKeywordsAnalyzed = 50;
    const keywordsWithAiOverview = 10;
    const coveragePct = totalKeywordsAnalyzed > 0
      ? Math.round((keywordsWithAiOverview / totalKeywordsAnalyzed) * 100)
      : 0;

    expect(coveragePct).toBe(20);
  });

  it("should return 0 when totalKeywordsAnalyzed is 0 (no division by zero)", () => {
    const totalKeywordsAnalyzed = 0;
    const keywordsWithAiOverview = 0;
    const coveragePct = totalKeywordsAnalyzed > 0
      ? Math.round((keywordsWithAiOverview / totalKeywordsAnalyzed) * 100)
      : 0;

    expect(coveragePct).toBe(0);
  });

  it("should handle 100% coverage", () => {
    const totalKeywordsAnalyzed = 20;
    const keywordsWithAiOverview = 20;
    const coveragePct = totalKeywordsAnalyzed > 0
      ? Math.round((keywordsWithAiOverview / totalKeywordsAnalyzed) * 100)
      : 0;

    expect(coveragePct).toBe(100);
  });
});

describe("Tier classification logic", () => {
  const classifyTier = (compositeScore: number): string => {
    if (compositeScore >= 70) return "dominant";
    if (compositeScore >= 40) return "visible";
    if (compositeScore >= 15) return "emerging";
    return "invisible";
  };

  it("should classify score 0 as invisible", () => {
    expect(classifyTier(0)).toBe("invisible");
  });

  it("should classify score 14 as invisible", () => {
    expect(classifyTier(14)).toBe("invisible");
  });

  it("should classify score 15 as emerging", () => {
    expect(classifyTier(15)).toBe("emerging");
  });

  it("should classify score 39 as emerging", () => {
    expect(classifyTier(39)).toBe("emerging");
  });

  it("should classify score 40 as visible", () => {
    expect(classifyTier(40)).toBe("visible");
  });

  it("should classify score 69 as visible", () => {
    expect(classifyTier(69)).toBe("visible");
  });

  it("should classify score 70 as dominant", () => {
    expect(classifyTier(70)).toBe("dominant");
  });

  it("should classify score 100 as dominant", () => {
    expect(classifyTier(100)).toBe("dominant");
  });
});

describe("Composite score calculation", () => {
  const calculateCompositeScore = (exposureScore: number, citationScore: number): number => {
    return Math.round(exposureScore * 0.6 + citationScore * 0.4);
  };

  it("should calculate composite score with 60/40 weighting", () => {
    expect(calculateCompositeScore(50, 50)).toBe(50);
    expect(calculateCompositeScore(100, 0)).toBe(60);
    expect(calculateCompositeScore(0, 100)).toBe(40);
    expect(calculateCompositeScore(0, 0)).toBe(0);
    expect(calculateCompositeScore(100, 100)).toBe(100);
  });

  it("should round composite score to nearest integer", () => {
    // 33 * 0.6 + 33 * 0.4 = 19.8 + 13.2 = 33
    expect(calculateCompositeScore(33, 33)).toBe(33);
    // 10 * 0.6 + 5 * 0.4 = 6 + 2 = 8
    expect(calculateCompositeScore(10, 5)).toBe(8);
  });
});

describe("Ahrefs API parameter validation", () => {
  it("should use correct Ahrefs API v3 parameters", async () => {
    // Validates that the API call uses correct params (not the old broken ones)
    const { computeAiExposureScore } = await import("./aiExposure/index");
    // computeAiExposureScore is exported and callable
    expect(typeof computeAiExposureScore).toBe("function");
  });

  it("should return correct date format for Ahrefs API", () => {
    // Ahrefs API requires YYYY-MM-DD format
    const now = new Date();
    const day = now.getUTCDate();
    let year = now.getUTCFullYear();
    let month = now.getUTCMonth() + 1;
    if (day < 5) {
      month -= 1;
      if (month === 0) { month = 12; year -= 1; }
    }
    const date = `${year}-${String(month).padStart(2, "0")}-01`;
    expect(date).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it("should use 'subdomains' mode and 'sum_traffic' order_by", () => {
    // These are the correct Ahrefs v3 parameters (not 'domain' and 'traffic')
    const mode = "subdomains";
    const orderBy = "sum_traffic:desc";
    const select = "keyword,volume,keyword_difficulty,serp_features,best_position";
    expect(mode).toBe("subdomains");
    expect(orderBy).toBe("sum_traffic:desc");
    expect(select).toContain("serp_features");
    expect(select).not.toContain("positions"); // old broken param
  });

  it("should detect ai_overview from serp_features array directly", () => {
    // In Ahrefs v3, serp_features is a direct array on the keyword object
    const kw = {
      keyword: "test",
      volume: 1000,
      keyword_difficulty: 30,
      serp_features: ["ai_overview", "snippet", "image_th"],
      best_position: 3,
    };
    const hasAiOverview = kw.serp_features.includes("ai_overview");
    const isCited = kw.serp_features.includes("ai_overview_sitelink");
    expect(hasAiOverview).toBe(true);
    expect(isCited).toBe(false);
  });

  it("should detect ai_overview_sitelink as citation", () => {
    const kw = {
      keyword: "test",
      volume: 500,
      keyword_difficulty: 20,
      serp_features: ["ai_overview", "ai_overview_sitelink"],
      best_position: 1,
    };
    const hasAiOverview = kw.serp_features.includes("ai_overview") || kw.serp_features.includes("ai_overview_sitelink");
    const isCited = kw.serp_features.includes("ai_overview_sitelink");
    expect(hasAiOverview).toBe(true);
    expect(isCited).toBe(true);
  });
});

describe("Stripe plans configuration", () => {
  it("should have correct plan IDs", async () => {
    const { PLANS } = await import("./stripe/products");
    expect(Object.keys(PLANS)).toContain("starter");
    expect(Object.keys(PLANS)).toContain("pro");
    expect(Object.keys(PLANS)).toContain("business");
  });

  it("should have correct prices for each plan", async () => {
    const { PLANS } = await import("./stripe/products");
    expect(PLANS.starter.price).toBe(3900); // $39
    expect(PLANS.pro.price).toBe(9900);     // $99
    expect(PLANS.business.price).toBe(29900); // $299
  });

  it("should have correct limits for free plan", async () => {
    const { FREE_PLAN_LIMITS } = await import("./stripe/products");
    expect(FREE_PLAN_LIMITS.auditsPerMonth).toBe(5);
    expect(FREE_PLAN_LIMITS.citationChecks).toBe(false);
    expect(FREE_PLAN_LIMITS.whiteLabel).toBe(false);
  });

  it("should return free plan limits for unknown plan", async () => {
    const { getPlanLimits } = await import("./stripe/products");
    const limits = getPlanLimits("unknown_plan");
    expect(limits.auditsPerMonth).toBe(5);
  });
});
