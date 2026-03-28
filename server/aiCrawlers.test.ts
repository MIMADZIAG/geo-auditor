/**
 * Tests for aiCrawlers.ts — v3 precise robots.txt interpretation
 *
 * Key scenarios:
 * 1. Partial exclusions (admin, cart, search) must NOT produce warnings/fails
 * 2. Full Disallow: / for AI search bots must produce fail
 * 3. Full Disallow: / for training bots must produce info (not fail/warning)
 * 4. Audited URL path blocked → fail on audited_url_access
 * 5. Audited URL path NOT blocked even if other paths are → pass
 * 6. Missing robots.txt → pass with informational note
 */

import { describe, it, expect } from "vitest";
import { analyzeAICrawlers } from "./audit/aiCrawlers";
import type { ScrapedPage } from "./audit/scraper";

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makePage(robotsTxt: string | null, url = "https://example.com/product/shoes"): ScrapedPage {
  return {
    url,
    html: "<html><body>test</body></html>",
    title: "Test",
    metaDescription: "",
    h1: [],
    h2: [],
    h3: [],
    bodyText: "test",
    wordCount: 1,
    links: [],
    images: [],
    jsonLd: [],
    robotsTxt,
    statusCode: 200,
    loadTimeMs: 100,
    hasHttps: true,
    hasMobileViewport: true,
    hasCanonical: true,
    canonicalUrl: url,
  } as unknown as ScrapedPage;
}

// ─── Scenario 1: Normal robots.txt with partial exclusions only ───────────────

describe("Normal robots.txt — partial exclusions only", () => {
  const normalRobots = `
User-agent: *
Disallow: /admin/
Disallow: /cart/
Disallow: /search/
Disallow: /wp-admin/
Sitemap: https://example.com/sitemap.xml
`.trim();

  it("should NOT flag partial exclusions as fail or warning", () => {
    const result = analyzeAICrawlers(makePage(normalRobots));
    const problematicChecks = result.checks.filter(
      (c) => (c.status === "fail" || c.status === "warning") && c.id !== "sitemap_for_crawlers"
    );
    expect(problematicChecks).toHaveLength(0);
  });

  it("audited_url_access should pass for /product/shoes", () => {
    const result = analyzeAICrawlers(makePage(normalRobots, "https://example.com/product/shoes"));
    const check = result.checks.find((c) => c.id === "audited_url_access");
    expect(check?.status).toBe("pass");
  });

  it("ai_search_full_block should pass", () => {
    const result = analyzeAICrawlers(makePage(normalRobots));
    const check = result.checks.find((c) => c.id === "ai_search_full_block");
    expect(check?.status).toBe("pass");
  });

  it("ai_training_bots should be info (not fail/warning)", () => {
    const result = analyzeAICrawlers(makePage(normalRobots));
    const check = result.checks.find((c) => c.id === "ai_training_bots");
    expect(check?.status).toBe("info");
  });

  it("score should be 100 (minus sitemap if missing, but sitemap is present)", () => {
    const result = analyzeAICrawlers(makePage(normalRobots));
    expect(result.score).toBe(100);
  });
});

// ─── Scenario 2: ClaudeBot + anthropic-ai partial block (the reported bug) ────

describe("ClaudeBot and anthropic-ai with partial exclusions — the reported bug", () => {
  const robotsWithClaudePartial = `
User-agent: *
Disallow: /admin/
Disallow: /cart/
Sitemap: https://example.com/sitemap.xml

User-agent: ClaudeBot
Disallow: /private/
Disallow: /members/

User-agent: anthropic-ai
Disallow: /private/
`.trim();

  it("should NOT produce fail or warning for ClaudeBot partial exclusions", () => {
    const result = analyzeAICrawlers(makePage(robotsWithClaudePartial, "https://example.com/produkt/oc"));
    const claudeIssues = result.checks.filter(
      (c) => (c.status === "fail" || c.status === "warning") &&
        (c.label.toLowerCase().includes("claude") || c.label.toLowerCase().includes("anthropic"))
    );
    expect(claudeIssues).toHaveLength(0);
  });

  it("audited URL /produkt/oc should pass (not in /private/ or /members/)", () => {
    const result = analyzeAICrawlers(makePage(robotsWithClaudePartial, "https://example.com/produkt/oc"));
    const check = result.checks.find((c) => c.id === "audited_url_access");
    expect(check?.status).toBe("pass");
  });

  it("score should be 100", () => {
    const result = analyzeAICrawlers(makePage(robotsWithClaudePartial, "https://example.com/produkt/oc"));
    expect(result.score).toBe(100);
  });
});

// ─── Scenario 3: Full block on AI search bot ──────────────────────────────────

describe("Full Disallow: / for PerplexityBot", () => {
  const robotsBlockPerplexity = `
User-agent: *
Disallow: /admin/

User-agent: PerplexityBot
Disallow: /
`.trim();

  it("ai_search_full_block should be fail", () => {
    const result = analyzeAICrawlers(makePage(robotsBlockPerplexity));
    const check = result.checks.find((c) => c.id === "ai_search_full_block");
    expect(check?.status).toBe("fail");
  });

  it("description should mention PerplexityBot", () => {
    const result = analyzeAICrawlers(makePage(robotsBlockPerplexity));
    const check = result.checks.find((c) => c.id === "ai_search_full_block");
    expect(check?.description).toContain("Perplexity");
  });

  it("score should be reduced", () => {
    const result = analyzeAICrawlers(makePage(robotsBlockPerplexity));
    expect(result.score).toBeLessThan(100);
  });
});

// ─── Scenario 4: Training bots fully blocked — should be info only ────────────

describe("Training bots (GPTBot, Google-Extended, ClaudeBot) fully blocked", () => {
  const robotsBlockTraining = `
User-agent: *
Disallow: /admin/
Sitemap: https://example.com/sitemap.xml

User-agent: GPTBot
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: anthropic-ai
Disallow: /
`.trim();

  it("ai_training_bots should be info (not fail/warning)", () => {
    const result = analyzeAICrawlers(makePage(robotsBlockTraining));
    const check = result.checks.find((c) => c.id === "ai_training_bots");
    expect(check?.status).toBe("info");
  });

  it("ai_search_full_block should pass (search bots not blocked)", () => {
    const result = analyzeAICrawlers(makePage(robotsBlockTraining));
    const check = result.checks.find((c) => c.id === "ai_search_full_block");
    expect(check?.status).toBe("pass");
  });

  it("score should be 100 (training blocks are not penalized)", () => {
    const result = analyzeAICrawlers(makePage(robotsBlockTraining));
    expect(result.score).toBe(100);
  });

  it("description should explain training vs search distinction", () => {
    const result = analyzeAICrawlers(makePage(robotsBlockTraining));
    const check = result.checks.find((c) => c.id === "ai_training_bots");
    expect(check?.description).toContain("NIE wpływa na cytowania");
  });
});

// ─── Scenario 5: Audited URL path is blocked ─────────────────────────────────

describe("Audited URL path is blocked for AI search bot", () => {
  const robotsBlockPath = `
User-agent: PerplexityBot
Disallow: /jak-wybrac-oc/
`.trim();

  it("audited_url_access should fail when path matches", () => {
    const result = analyzeAICrawlers(makePage(robotsBlockPath, "https://example.com/jak-wybrac-oc/"));
    const check = result.checks.find((c) => c.id === "audited_url_access");
    expect(check?.status).toBe("fail");
  });

  it("audited_url_access should pass for a different path", () => {
    const result = analyzeAICrawlers(makePage(robotsBlockPath, "https://example.com/product/shoes"));
    const check = result.checks.find((c) => c.id === "audited_url_access");
    expect(check?.status).toBe("pass");
  });
});

// ─── Scenario 6: Missing robots.txt ──────────────────────────────────────────

describe("Missing robots.txt", () => {
  it("all checks should be pass or info (no fail/warning)", () => {
    const result = analyzeAICrawlers(makePage(null));
    const problematic = result.checks.filter(
      (c) => c.status === "fail" || c.status === "warning"
    );
    expect(problematic).toHaveLength(0);
  });

  it("score should be 100", () => {
    const result = analyzeAICrawlers(makePage(null));
    expect(result.score).toBe(100);
  });
});

// ─── Scenario 7: Wildcard block with exceptions ───────────────────────────────

describe("Wildcard block with exceptions", () => {
  const robotsWildcard = `
User-agent: *
Disallow: /admin/
Disallow: /private/
Allow: /
Sitemap: https://example.com/sitemap.xml
`.trim();

  it("should pass for product page not in blocked paths", () => {
    const result = analyzeAICrawlers(makePage(robotsWildcard, "https://example.com/product/oc-2025"));
    const check = result.checks.find((c) => c.id === "audited_url_access");
    expect(check?.status).toBe("pass");
  });
});

// ─── Scenario 8: Sitemap detection ───────────────────────────────────────────

describe("Sitemap detection", () => {
  it("should pass when Sitemap: directive is present", () => {
    const robots = "User-agent: *\nDisallow: /admin/\nSitemap: https://example.com/sitemap.xml";
    const result = analyzeAICrawlers(makePage(robots));
    const check = result.checks.find((c) => c.id === "sitemap_for_crawlers");
    expect(check?.status).toBe("pass");
  });

  it("should warn when robots.txt exists but no Sitemap directive", () => {
    const robots = "User-agent: *\nDisallow: /admin/";
    const result = analyzeAICrawlers(makePage(robots));
    const check = result.checks.find((c) => c.id === "sitemap_for_crawlers");
    expect(check?.status).toBe("warning");
  });
});
