/**
 * Audit Engine v5 — Tests for 6 improvements
 * a) first_paragraph_answer
 * b) intent_blocks
 * c) date_signals freshness
 * d) external_citations removed from eeat
 * e) js_rendering H1+para source check
 * f) semantic_triples SPO density
 */

import { describe, it, expect, vi } from "vitest";
import * as cheerio from "cheerio";
import { analyzeContentStructure } from "./audit/contentStructure";
import { analyzeStructuredData } from "./audit/structuredData";
import { analyzeTechnical } from "./audit/technical";
import { analyzeEEAT } from "./audit/eeat";
import type { ScrapedPage } from "./audit/scraper";

// ─── Mock LLM to avoid real API calls and test timeouts ──────────────────────
// The LLM call in first_paragraph_answer is an enhancement layer — unit tests
// should verify the deterministic regex-based scoring, not LLM outputs.
// Empty suggestedRewrite ensures the LLM branch is skipped, preserving
// the regex-based score for all test assertions.
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            answerFirstScore: 50,
            currentOpeningIssue: "",
            suggestedRewrite: "",
            rewriteReason: "",
          }),
        },
      },
    ],
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────────────────

function makePage(html: string, url = "https://example.com/article"): ScrapedPage {
  return {
    html,
    url,
    finalUrl: url,
    $: cheerio.load(html),
    statusCode: 200,
    headers: {},
    robotsTxt: null,
    robotsTxtUrl: `${url}/robots.txt`,
    isHttps: true,
    responseTimeMs: 100,
    title: "",
  };
}

// ─── (a) first_paragraph_answer ───────────────────────────────────────────────

describe("first_paragraph_answer", () => {
  it("passes for article with direct definitional opener ≤150 words", async () => {
    const html = `<html><body>
      <h1>What is Schema Markup</h1>
      <p>Schema markup is a type of structured data that helps search engines understand the content of a webpage. It uses vocabulary from Schema.org to describe entities, relationships, and facts in a machine-readable format.</p>
    </body></html>`;
    const result = await analyzeContentStructure(makePage(html), "article");
    const check = result.checks.find(c => c.id === "first_paragraph_answer");
    expect(check).toBeDefined();
    expect(check!.status).toBe("pass");
  });

  it("returns info (not fail) for product page — not applicable", async () => {
    const html = `<html><body>
      <h1>Blue T-Shirt</h1>
      <p>100% cotton, machine washable, available in sizes S-XL.</p>
    </body></html>`;
    const result = await analyzeContentStructure(makePage(html), "product");
    const check = result.checks.find(c => c.id === "first_paragraph_answer");
    expect(check).toBeDefined();
    expect(check!.status).toBe("info");
  });

  it("warns when first paragraph is over 150 words", async () => {
    const longPara = "word ".repeat(160).trim();
    const html = `<html><body><h1>Guide</h1><p>${longPara}</p></body></html>`;
    const result = await analyzeContentStructure(makePage(html), "article");
    const check = result.checks.find(c => c.id === "first_paragraph_answer");
    expect(check).toBeDefined();
    expect(check!.status).toBe("warning");
  });

  it("warns when no paragraphs exist on article page", async () => {
    const html = `<html><body><h1>Guide</h1><div>Some text without p tags</div></body></html>`;
    const result = await analyzeContentStructure(makePage(html), "article");
    const check = result.checks.find(c => c.id === "first_paragraph_answer");
    expect(check).toBeDefined();
    expect(["warning", "fail"]).toContain(check!.status);
  });
});

// ─── (b) intent_blocks ────────────────────────────────────────────────────────

describe("intent_blocks", () => {
  it("passes when all 3 intent blocks are present", async () => {
    const html = `<html><body>
      <h1>Schema Markup Guide</h1>
      <p>Schema markup is defined as structured data vocabulary. It refers to a standard format.</p>
      <ol><li>Step 1: Install plugin</li><li>Step 2: Configure</li><li>Step 3: Validate</li></ol>
      <p>Schema.org vs JSON-LD: compared to Microdata, JSON-LD is easier to implement.</p>
    </body></html>`;
    const result = await analyzeContentStructure(makePage(html), "article");
    const check = result.checks.find(c => c.id === "intent_blocks");
    expect(check).toBeDefined();
    expect(check!.status).toBe("pass");
    expect(check!.value).toContain("3/3");
  });

  it("returns info (not fail) for product page", async () => {
    const html = `<html><body><h1>Product</h1><p>Buy now.</p></body></html>`;
    const result = await analyzeContentStructure(makePage(html), "product");
    const check = result.checks.find(c => c.id === "intent_blocks");
    expect(check).toBeDefined();
    expect(check!.status).toBe("info");
  });

  it("warns when only 1 intent block found on article", async () => {
    const html = `<html><body>
      <h1>Guide</h1>
      <p>Schema markup is defined as a vocabulary for structured data.</p>
    </body></html>`;
    const result = await analyzeContentStructure(makePage(html), "article");
    const check = result.checks.find(c => c.id === "intent_blocks");
    expect(check).toBeDefined();
    expect(["warning", "fail"]).toContain(check!.status);
  });
});

// ─── (c) date_signals freshness ───────────────────────────────────────────────

describe("date_signals freshness", () => {
  it("passes for Article schema with recent dates", async () => {
    const recentDate = new Date(Date.now() - 3 * 30 * 24 * 60 * 60 * 1000).toISOString();
    const html = `<html><head><script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Article","datePublished":"${recentDate}","dateModified":"${recentDate}","headline":"Test"}
    </script></head><body><p>Content</p></body></html>`;
    const result = analyzeStructuredData(makePage(html), "article");
    const check = result.checks.find(c => c.id === "date_signals");
    expect(check).toBeDefined();
    expect(check!.status).toBe("pass");
  });

  it("fails for Article schema with dates older than 24 months", async () => {
    const oldDate = new Date(Date.now() - 30 * 30 * 24 * 60 * 60 * 1000).toISOString();
    const html = `<html><head><script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Article","datePublished":"${oldDate}","dateModified":"${oldDate}","headline":"Old"}
    </script></head><body><p>Content</p></body></html>`;
    const result = analyzeStructuredData(makePage(html), "article");
    const check = result.checks.find(c => c.id === "date_signals");
    expect(check).toBeDefined();
    expect(check!.status).toBe("fail");
  });

  it("returns info (not fail) for Product schema with no dates — evergreen", async () => {
    const html = `<html><head><script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Product","name":"Blue T-Shirt","offers":{"@type":"Offer","price":"29.99"}}
    </script></head><body><p>Content</p></body></html>`;
    const result = analyzeStructuredData(makePage(html), "product");
    const check = result.checks.find(c => c.id === "date_signals");
    expect(check).toBeDefined();
    expect(check!.status).toBe("info");
  });

  it("warns for Article schema with dates 13-24 months old", async () => {
    const moderateOld = new Date(Date.now() - 15 * 30 * 24 * 60 * 60 * 1000).toISOString();
    const html = `<html><head><script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Article","datePublished":"${moderateOld}","dateModified":"${moderateOld}","headline":"Moderate"}
    </script></head><body><p>Content</p></body></html>`;
    const result = analyzeStructuredData(makePage(html), "article");
    const check = result.checks.find(c => c.id === "date_signals");
    expect(check).toBeDefined();
    expect(check!.status).toBe("warning");
  });
});

// ─── (d) external_citations removed from eeat ────────────────────────────────

describe("eeat external_citations removed", () => {
  it("does NOT include external_citations check in E-E-A-T results", async () => {
    const html = `<html><body>
      <p>Author: John Doe</p>
      <a href="https://external.com">Source</a>
      <a href="/about">About</a>
      <a href="/contact">Contact</a>
    </body></html>`;
    const result = analyzeEEAT(makePage(html), "article");
    const check = result.checks.find(c => c.id === "external_citations");
    expect(check).toBeUndefined();
  });

  it("still includes external_citations in contentStructure", async () => {
    const html = `<html><body>
      <h1>Article</h1>
      <p>Content with <a href="https://external.com">external link</a>.</p>
    </body></html>`;
    const result = await analyzeContentStructure(makePage(html), "article");
    const check = result.checks.find(c => c.id === "external_citations");
    expect(check).toBeDefined();
  });
});

// ─── (e) js_rendering H1+para source check ───────────────────────────────────

describe("js_rendering H1+para source check", () => {
  it("passes when H1 and paragraphs are in HTML source", async () => {
    const html = `<html><body>
      <h1>Schema Markup Guide</h1>
      <p>Schema markup is a type of structured data that helps search engines understand the content of a webpage and improves visibility in AI search results significantly.</p>
    </body></html>`;
    const result = analyzeTechnical(makePage(html));
    const check = result.checks.find(c => c.id === "js_rendering");
    expect(check).toBeDefined();
    expect(check!.status).toBe("pass");
  });

  it("warns when H1 text is only inside a script tag (CSR pattern)", async () => {
    // H1 only exists inside a script — not in raw HTML source
    const html = `<html><body>
      <div id="root"></div>
      <script>document.querySelector('#root').innerHTML = '<h1>Dynamic Title Injected By JavaScript</h1><p>Dynamic content loaded by JavaScript runtime</p>';</script>
    </body></html>`;
    const result = analyzeTechnical(makePage(html));
    const check = result.checks.find(c => c.id === "js_rendering");
    expect(check).toBeDefined();
    // Should not be pass — H1 is inside script, not in source
    expect(check!.status).not.toBe("pass");
  });

  it("check value contains h1InSource and paraInSource fields", async () => {
    const html = `<html><body>
      <h1>Test Title</h1>
      <p>This is a paragraph with enough words to be detected as a real paragraph in the source HTML for testing purposes.</p>
    </body></html>`;
    const result = analyzeTechnical(makePage(html));
    const check = result.checks.find(c => c.id === "js_rendering");
    expect(check).toBeDefined();
    expect(check!.value).toContain("h1InSource");
    expect(check!.value).toContain("paraInSource");
  });
});

// ─── (f) semantic_triples SPO density ────────────────────────────────────────

describe("semantic_triples SPO density", () => {
  it("passes for content with high SPO density", async () => {
    const html = `<html><body>
      <h1>Schema Markup</h1>
      <p>Schema markup improves search visibility significantly. JSON-LD provides structured data to search engines. Google uses schema to generate rich results. Perplexity cites pages that contain direct factual statements. Schema.org defines vocabulary for structured data markup. Search engines extract facts from SPO sentences. Structured data enables AI crawlers to understand page content. FAQPage schema increases citation rates in AI answers. HowTo schema helps users complete step-by-step tasks. Breadcrumb schema shows page hierarchy to search engines.</p>
    </body></html>`;
    const result = await analyzeContentStructure(makePage(html), "article");
    const check = result.checks.find(c => c.id === "semantic_triples");
    expect(check).toBeDefined();
    expect(check!.status).toBe("pass");
    expect(check!.value).toContain("SPO sentences");
  });

  it("fails or warns for vague content with no SPO structure", async () => {
    const html = `<html><body>
      <h1>Tips</h1>
      <p>This might help you. It could be useful. Maybe try this approach. Things can work out well. Consider doing something about it. Perhaps look into various options available.</p>
    </body></html>`;
    const result = await analyzeContentStructure(makePage(html), "article");
    const check = result.checks.find(c => c.id === "semantic_triples");
    expect(check).toBeDefined();
    expect(["warning", "fail"]).toContain(check!.status);
  });

  it("value reports percentage-based SPO ratio, not raw count", async () => {
    const html = `<html><body>
      <h1>Test</h1>
      <p>Schema markup is defined as structured data. It provides context to search engines. JSON-LD enables machine-readable content.</p>
    </body></html>`;
    const result = await analyzeContentStructure(makePage(html), "article");
    const check = result.checks.find(c => c.id === "semantic_triples");
    expect(check).toBeDefined();
    expect(check!.value).toMatch(/\d+% SPO sentences/);
  });
});
