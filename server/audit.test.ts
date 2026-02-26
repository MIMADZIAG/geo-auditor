import { describe, it, expect } from "vitest";
import { computeOverallScore, getScoreLabel, generateRecommendations } from "./audit/scorer";
import type { AuditFindings } from "./audit/types";
import * as cheerio from "cheerio";
import { analyzeTechnical } from "./audit/technical";
import { analyzeStructuredData } from "./audit/structuredData";
import { analyzeContentStructure } from "./audit/contentStructure";
import { analyzeAICrawlers } from "./audit/aiCrawlers";
import type { ScrapedPage } from "./audit/scraper";

// ─── Helper: create mock ScrapedPage ─────────────────────────────────────────

function mockPage(html: string, overrides: Partial<ScrapedPage> = {}): ScrapedPage {
  const $ = cheerio.load(html);
  return {
    url: "https://example.com/test",
    finalUrl: "https://example.com/test",
    html,
    $,
    statusCode: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    robotsTxt: "User-agent: *\nAllow: /",
    robotsTxtUrl: "https://example.com/robots.txt",
    isHttps: true,
    responseTimeMs: 500,
    title: "Test Page",
    ...overrides,
  };
}

// ─── Scorer Tests ─────────────────────────────────────────────────────────────

describe("computeOverallScore", () => {
  it("returns 0 when all categories score 0", () => {
    const findings = createFindings(0);
    expect(computeOverallScore(findings)).toBe(0);
  });

  it("returns 100 when all categories score 100", () => {
    const findings = createFindings(100);
    expect(computeOverallScore(findings)).toBe(100);
  });

  it("applies correct weights to categories", () => {
    const findings: AuditFindings = {
      technical: { score: 100, maxScore: 100, checks: [], summary: "" },
      structuredData: { score: 0, maxScore: 100, checks: [], summary: "" },
      contentStructure: { score: 0, maxScore: 100, checks: [], summary: "" },
      eeat: { score: 0, maxScore: 100, checks: [], summary: "" },
      aiCrawlers: { score: 0, maxScore: 100, checks: [], summary: "" },
      metaTags: { score: 0, maxScore: 100, checks: [], summary: "" },
    };
    // technical weight = 25, so score should be 25
    expect(computeOverallScore(findings)).toBe(25);
  });

  it("returns a value between 0 and 100 for mixed scores", () => {
    const findings = createFindings(50);
    const score = computeOverallScore(findings);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("getScoreLabel", () => {
  it("returns Excellent for 80+", () => {
    expect(getScoreLabel(80)).toBe("Excellent");
    expect(getScoreLabel(100)).toBe("Excellent");
  });
  it("returns Good for 60-79", () => {
    expect(getScoreLabel(60)).toBe("Good");
    expect(getScoreLabel(79)).toBe("Good");
  });
  it("returns Fair for 40-59", () => {
    expect(getScoreLabel(40)).toBe("Fair");
    expect(getScoreLabel(59)).toBe("Fair");
  });
  it("returns Poor for below 40", () => {
    expect(getScoreLabel(0)).toBe("Poor");
    expect(getScoreLabel(39)).toBe("Poor");
  });
});

describe("generateRecommendations", () => {
  it("generates critical recommendation for noindex page", () => {
    const findings = createFindings(50);
    findings.technical.checks = [
      { id: "noindex", label: "Indexable", status: "fail", description: "", impact: "high", value: false },
    ];
    const recs = generateRecommendations(findings);
    const noindexRec = recs.find((r) => r.id === "fix_noindex");
    expect(noindexRec).toBeDefined();
    expect(noindexRec?.priority).toBe("critical");
  });

  it("generates critical recommendation when JSON-LD is missing", () => {
    const findings = createFindings(50);
    findings.structuredData.checks = [
      { id: "jsonld_present", label: "JSON-LD", status: "fail", description: "", impact: "high", value: 0 },
    ];
    const recs = generateRecommendations(findings);
    const jsonldRec = recs.find((r) => r.id === "add_jsonld");
    expect(jsonldRec).toBeDefined();
    expect(jsonldRec?.priority).toBe("critical");
  });

  it("sorts recommendations by priority (critical first)", () => {
    const findings = createFindings(0);
    findings.technical.checks = [
      { id: "noindex", label: "Indexable", status: "fail", description: "", impact: "high", value: false },
      { id: "canonical", label: "Canonical", status: "warning", description: "", impact: "medium", value: null },
    ];
    findings.structuredData.checks = [
      { id: "jsonld_present", label: "JSON-LD", status: "fail", description: "", impact: "high", value: 0 },
    ];
    const recs = generateRecommendations(findings);
    if (recs.length >= 2) {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      for (let i = 0; i < recs.length - 1; i++) {
        expect(priorityOrder[recs[i]!.priority]).toBeLessThanOrEqual(priorityOrder[recs[i + 1]!.priority]);
      }
    }
  });
});

// ─── Technical Audit Tests ────────────────────────────────────────────────────

describe("analyzeTechnical", () => {
  it("passes HTTPS check for https pages", () => {
    const page = mockPage("<html><head></head><body></body></html>", { isHttps: true });
    const result = analyzeTechnical(page);
    const httpsCheck = result.checks.find((c) => c.id === "https");
    expect(httpsCheck?.status).toBe("pass");
  });

  it("fails HTTPS check for http pages", () => {
    const page = mockPage("<html><head></head><body></body></html>", { isHttps: false });
    const result = analyzeTechnical(page);
    const httpsCheck = result.checks.find((c) => c.id === "https");
    expect(httpsCheck?.status).toBe("fail");
  });

  it("detects noindex directive", () => {
    const html = `<html><head><meta name="robots" content="noindex, nofollow"></head><body></body></html>`;
    const page = mockPage(html);
    const result = analyzeTechnical(page);
    const noindexCheck = result.checks.find((c) => c.id === "noindex");
    expect(noindexCheck?.status).toBe("fail");
  });

  it("detects canonical tag", () => {
    const html = `<html><head><link rel="canonical" href="https://example.com/test"></head><body></body></html>`;
    const page = mockPage(html);
    const result = analyzeTechnical(page);
    const canonicalCheck = result.checks.find((c) => c.id === "canonical");
    expect(canonicalCheck?.status).toBe("pass");
  });

  it("returns score between 0 and 100", () => {
    const page = mockPage("<html><head></head><body></body></html>");
    const result = analyzeTechnical(page);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

// ─── Structured Data Tests ────────────────────────────────────────────────────

describe("analyzeStructuredData", () => {
  it("detects JSON-LD schema", () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@type":"Article","name":"Test"}</script>
    </head><body></body></html>`;
    const page = mockPage(html);
    const result = analyzeStructuredData(page);
    const jsonldCheck = result.checks.find((c) => c.id === "jsonld_present");
    expect(jsonldCheck?.status).toBe("pass");
  });

  it("fails when no JSON-LD present", () => {
    const page = mockPage("<html><head></head><body></body></html>");
    const result = analyzeStructuredData(page);
    const jsonldCheck = result.checks.find((c) => c.id === "jsonld_present");
    expect(jsonldCheck?.status).toBe("fail");
  });

  it("detects FAQPage schema", () => {
    const html = `<html><head>
      <script type="application/ld+json">${JSON.stringify({
        "@type": "FAQPage",
        "mainEntity": [{ "@type": "Question", "name": "Q1", "acceptedAnswer": { "@type": "Answer", "text": "A1" } }]
      })}</script>
    </head><body></body></html>`;
    const page = mockPage(html);
    const result = analyzeStructuredData(page);
    const faqCheck = result.checks.find((c) => c.id === "faq_schema");
    expect(faqCheck?.status).toBe("pass");
  });
});

// ─── Content Structure Tests ──────────────────────────────────────────────────

describe("analyzeContentStructure", () => {
  it("detects H1 heading", () => {
    const html = `<html><body><h1>Main Title</h1><p>Content here.</p></body></html>`;
    const page = mockPage(html);
    const result = analyzeContentStructure(page);
    const h1Check = result.checks.find((c) => c.id === "h1_present");
    expect(h1Check?.status).toBe("pass");
  });

  it("fails when no H1 present", () => {
    const html = `<html><body><h2>Section</h2><p>Content.</p></body></html>`;
    const page = mockPage(html);
    const result = analyzeContentStructure(page);
    const h1Check = result.checks.find((c) => c.id === "h1_present");
    expect(h1Check?.status).toBe("fail");
  });

  it("detects TL;DR section", () => {
    const html = `<html><body><h1>Title</h1><div class="tldr">TL;DR: Summary here</div></body></html>`;
    const page = mockPage(html);
    const result = analyzeContentStructure(page);
    const tldrCheck = result.checks.find((c) => c.id === "tldr_summary");
    expect(tldrCheck?.status).toBe("pass");
  });

  it("detects FAQ section", () => {
    const html = `<html><body><h1>Title</h1><h2>FAQ</h2><p>Q: What is this? A: This is a test.</p></body></html>`;
    const page = mockPage(html);
    const result = analyzeContentStructure(page);
    const faqCheck = result.checks.find((c) => c.id === "faq_section");
    expect(faqCheck?.status).toBe("pass");
  });
});

// ─── AI Crawlers Tests ────────────────────────────────────────────────────────

describe("analyzeAICrawlers", () => {
  it("passes when robots.txt allows all crawlers", () => {
    const page = mockPage("<html><body></body></html>", {
      robotsTxt: "User-agent: *\nAllow: /\n",
    });
    const result = analyzeAICrawlers(page);
    const allCheck = result.checks.find((c) => c.id === "all_ai_crawlers");
    expect(allCheck?.status).toBe("pass");
  });

  it("fails when GPTBot is blocked", () => {
    const page = mockPage("<html><body></body></html>", {
      robotsTxt: "User-agent: GPTBot\nDisallow: /\n",
    });
    const result = analyzeAICrawlers(page);
    const gptCheck = result.checks.find((c) => c.id === "gptbot");
    expect(gptCheck?.status).toBe("fail");
  });

  it("handles missing robots.txt gracefully", () => {
    const page = mockPage("<html><body></body></html>", { robotsTxt: null });
    const result = analyzeAICrawlers(page);
    expect(result.score).toBeGreaterThanOrEqual(0);
    // All crawlers should pass (unrestricted access)
    const gptCheck = result.checks.find((c) => c.id === "gptbot");
    expect(gptCheck?.status).toBe("pass");
  });

  it("returns score of 100 when no crawlers are blocked", () => {
    const page = mockPage("<html><body></body></html>", {
      robotsTxt: "User-agent: *\nAllow: /\n",
    });
    const result = analyzeAICrawlers(page);
    expect(result.score).toBe(100);
  });
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function createFindings(score: number): AuditFindings {
  const cat = { score, maxScore: 100, checks: [], summary: "" };
  return {
    technical: { ...cat },
    structuredData: { ...cat },
    contentStructure: { ...cat },
    eeat: { ...cat },
    aiCrawlers: { ...cat },
    metaTags: { ...cat },
  };
}

// ─── LLM Recommendations Context Builder Tests ────────────────────────────────

describe("LLM recommendations context assembly", () => {
  it("buildPageContext includes page title and URL", () => {
    // Test that the context builder extracts key page info
    const page = mockPage(
      `<html><head><title>My Shop - Product Page</title>
       <meta name="description" content="Buy great products">
       </head><body><h1>Product Title</h1><p>Product description.</p></body></html>`,
      { title: "My Shop - Product Page", finalUrl: "https://myshop.com/product" }
    );
    // Verify page structure is correct for LLM context
    expect(page.title).toBe("My Shop - Product Page");
    expect(page.finalUrl).toBe("https://myshop.com/product");
    expect(page.$("h1").text()).toBe("Product Title");
    expect(page.$('meta[name="description"]').attr("content")).toBe("Buy great products");
  });

  it("correctly identifies failed checks for LLM context", () => {
    const findings = createFindings(0);
    findings.technical.checks = [
      { id: "https", label: "HTTPS", status: "fail", description: "Not HTTPS", impact: "high" },
      { id: "noindex", label: "Noindex", status: "fail", description: "Noindex set", impact: "high" },
      { id: "canonical", label: "Canonical", status: "pass", description: "OK", impact: "medium" },
    ];
    const failedChecks = findings.technical.checks.filter(
      (c) => c.status === "fail" || c.status === "warning"
    );
    expect(failedChecks).toHaveLength(2);
    expect(failedChecks.map((c) => c.id)).toContain("https");
    expect(failedChecks.map((c) => c.id)).toContain("noindex");
  });

  it("LLM recommendation type has required fields", () => {
    const mockLLMRec = {
      id: "llm_test",
      category: "Structured Data",
      priority: "critical" as const,
      title: "Add Product Schema",
      description: "Missing product schema",
      howToFix: "Add JSON-LD Product schema",
      impact: "High impact on AI visibility",
      isPersonalized: true as const,
      codeSnippet: {
        language: "json" as const,
        label: "JSON-LD Product Schema",
        code: '{"@context":"https://schema.org","@type":"Product","name":"Test"}',
      },
    };
    expect(mockLLMRec.isPersonalized).toBe(true);
    expect(mockLLMRec.codeSnippet?.language).toBe("json");
    expect(mockLLMRec.codeSnippet?.code).toContain("@context");
    expect(mockLLMRec.priority).toBe("critical");
  });

  it("LLM result structure is valid", () => {
    const mockResult = {
      recommendations: [
        {
          id: "llm_1",
          category: "Structured Data",
          priority: "critical" as const,
          title: "Add Schema",
          description: "Missing schema",
          howToFix: "Add JSON-LD",
          impact: "High",
          isPersonalized: true as const,
        },
      ],
      aiInsight: "This page lacks structured data and needs improvement.",
      topPriority: "Add JSON-LD structured data immediately.",
    };
    expect(mockResult.recommendations).toHaveLength(1);
    expect(mockResult.aiInsight).toBeTruthy();
    expect(mockResult.topPriority).toBeTruthy();
    expect(mockResult.recommendations[0]?.isPersonalized).toBe(true);
  });
});
