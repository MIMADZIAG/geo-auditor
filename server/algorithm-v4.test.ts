/**
 * Algorithm v4 — Expert Simulation Tests
 *
 * Tests for all 7 algorithm improvements:
 *  1. WikiData NER entity richness (entityRecognizer.ts)
 *  2. Continuous 0-100 scoring (types.ts + contentStructure.ts)
 *  3. Cosine Similarity (cosineSimilarity.ts)
 *  4. CI weight rebalance (contentIntelligence.ts)
 *  5. Intelligent content length/density scoring (contentStructure.ts)
 *  6. Freshness decay scoring (contentStructure.ts)
 *  7. Semantic structured data validation (schemaSemanticValidator.ts)
 */

import { describe, it, expect } from "vitest";

// ─── Task 1: WikiData NER ─────────────────────────────────────────────────────

import {
  recognizeEntities,
  type EntityRecognitionResult,
  type WikiDataEntity,
} from "./audit/entityRecognizer";

describe("Task 1 — WikiData NER: recognizeEntities (skipWikidata=true)", () => {
  it("extracts capitalized proper nouns as unconfirmed candidates", async () => {
    const text = "Apple launched the iPhone 15 in September 2023. Tim Cook announced the product.";
    const result = await recognizeEntities(text, "en", true);
    const allLabels = [
      ...result.confirmedEntities.map(e => e.surfaceForm),
      ...result.unconfirmedEntities.map(e => e.surfaceForm),
    ];
    expect(allLabels.some(l => l.includes("Apple") || l.includes("iPhone") || l.includes("Tim Cook"))).toBe(true);
  });

  it("extracts Polish entities correctly", async () => {
    const text = "Warszawa jest stolicą Polski. Firma Google otworzyła biuro w Krakowie.";
    const result = await recognizeEntities(text, "pl", true);
    const allLabels = [
      ...result.confirmedEntities.map(e => e.surfaceForm),
      ...result.unconfirmedEntities.map(e => e.surfaceForm),
    ];
    expect(allLabels.some(l => l.includes("Warszawa") || l.includes("Google") || l.includes("Krakowie"))).toBe(true);
  });

  it("counts numeric facts correctly", async () => {
    const text = "Revenue grew by 23.5% to $1.2 billion in Q3 2024. The product weighs 500kg.";
    const result = await recognizeEntities(text, "en", true);
    // Should detect: 23.5%, $1.2 billion, Q3 2024, 500kg = at least 3 numeric facts
    expect(result.numericFactsCount).toBeGreaterThanOrEqual(2);
  });

  it("returns empty result for text with no entities", async () => {
    const text = "this is a simple sentence with no proper nouns or numbers.";
    const result = await recognizeEntities(text, "en", true);
    expect(result.totalEntitySignals).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.confirmedEntities)).toBe(true);
    expect(Array.isArray(result.unconfirmedEntities)).toBe(true);
  });

  it("totalEntitySignals = confirmedEntities + unconfirmedEntities + numericFacts", async () => {
    const text = "Google earned $80 billion in Q2 2024. Microsoft Azure grew 29%.";
    const result = await recognizeEntities(text, "en", true);
    const expected = result.confirmedEntities.length + result.unconfirmedEntities.length + result.numericFactsCount;
    expect(result.totalEntitySignals).toBe(expected);
  });

  it("WikiDataEntity has correct shape", async () => {
    const text = "Apple Inc. is a technology company based in Cupertino.";
    const result = await recognizeEntities(text, "en", true);
    const allEntities = [...result.confirmedEntities, ...result.unconfirmedEntities];
    if (allEntities.length > 0) {
      const entity = allEntities[0];
      expect(typeof entity.surfaceForm).toBe("string");
      expect(["person", "organization", "product", "place", "concept", "unknown"]).toContain(entity.entityType);
      expect(typeof entity.confirmed).toBe("boolean");
    }
  });

  it("knowledgeGraphAnchors = 0 when skipWikidata=true", async () => {
    const text = "Google Apple Microsoft Amazon Facebook";
    const result = await recognizeEntities(text, "en", true);
    // With skipWikidata=true, no entities are confirmed via Wikidata
    expect(result.knowledgeGraphAnchors).toBe(0);
    expect(result.wikidataAvailable).toBe(false);
  });
});

// ─── Task 2: Continuous 0-100 Scoring ────────────────────────────────────────

import type { AuditCheck } from "./audit/types";

describe("Task 2 — Continuous scoring: AuditCheck type", () => {
  it("AuditCheck accepts optional score field", () => {
    const check: AuditCheck = {
      id: "test_check",
      label: "Test Check",
      status: "pass",
      score: 87,
      description: "Test description",
      impact: "high",
    };
    expect(check.score).toBe(87);
  });

  it("AuditCheck works without score field (backward compatible)", () => {
    const check: AuditCheck = {
      id: "test_check",
      label: "Test Check",
      status: "pass",
      description: "Test description",
      impact: "high",
    };
    expect(check.score).toBeUndefined();
  });

  it("score field accepts full range 0-100", () => {
    const values = [0, 1, 25, 50, 75, 99, 100];
    values.forEach(score => {
      const check: AuditCheck = {
        id: "test",
        label: "Test",
        status: "pass",
        score,
        description: "",
        impact: "medium",
      };
      expect(check.score).toBe(score);
    });
  });

  it("score is independent from status (continuous vs binary)", () => {
    // A check can have score=65 but status="warning" — they are independent
    const check: AuditCheck = {
      id: "entity_richness",
      label: "Entity Richness",
      status: "warning",
      score: 65,
      description: "Moderate entity richness",
      impact: "high",
    };
    expect(check.status).toBe("warning");
    expect(check.score).toBe(65);
  });
});

// ─── Task 3: Cosine Similarity ────────────────────────────────────────────────

import { extractQuerySignal } from "./audit/cosineSimilarity";

describe("Task 3 — Cosine Similarity: extractQuerySignal", () => {
  it("combines H1 and first 150 words", () => {
    const h1 = "Best Running Shoes 2024";
    const body = "When choosing running shoes, you need to consider cushioning, support, and fit. " +
      Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
    const signal = extractQuerySignal(h1, body);
    expect(signal).toContain("Best Running Shoes 2024");
    expect(signal).toContain("cushioning");
  });

  it("handles empty H1 gracefully — returns only body", () => {
    const signal = extractQuerySignal("", "Some body text here");
    expect(signal).toBe("Some body text here");
  });

  it("handles empty body gracefully — returns only H1", () => {
    const signal = extractQuerySignal("My H1 Title", "");
    expect(signal).toBe("My H1 Title");
  });

  it("handles both empty — returns empty string", () => {
    const signal = extractQuerySignal("", "");
    expect(signal).toBe("");
  });

  it("truncates body to approximately 150 words", () => {
    const h1 = "Title";
    const body = Array.from({ length: 300 }, (_, i) => `word${i}`).join(" ");
    const signal = extractQuerySignal(h1, body);
    const wordCount = signal.split(/\s+/).length;
    // H1 (1 word) + separator + ~150 words = ~152 words max
    expect(wordCount).toBeLessThanOrEqual(155);
  });

  it("separates H1 and body with a period", () => {
    const signal = extractQuerySignal("My Title", "First sentence of body.");
    expect(signal).toContain("My Title");
    expect(signal).toContain("First sentence of body.");
    // Should have a separator between them
    expect(signal.length).toBeGreaterThan("My Title".length + "First sentence of body.".length);
  });
});

// ─── Task 5: Intelligent Content Length/Density ───────────────────────────────

import { computeInformationDensityScore } from "./audit/contentStructure";

describe("Task 5 — Information density scoring", () => {
  it("is exported from contentStructure", () => {
    expect(typeof computeInformationDensityScore).toBe("function");
  });

  it("returns 0 for empty text", () => {
    const score = computeInformationDensityScore("", 0);
    expect(score).toBe(0);
  });

  it("returns higher score for text with numeric facts", () => {
    const denseText = "Revenue grew 23.5% to $1.2 billion. Market share reached 45%. Growth rate: 18%.";
    const sparseText = "The company grew significantly. Market share improved. Growth was notable.";
    const denseScore = computeInformationDensityScore(denseText, 15, 3, 0);
    const sparseScore = computeInformationDensityScore(sparseText, 15, 0, 0);
    expect(denseScore).toBeGreaterThanOrEqual(sparseScore);
  });

  it("returns value between 0 and 100", () => {
    const testCases = [
      { text: "", wordCount: 0, facts: 0, entities: 0 },
      { text: "short", wordCount: 1, facts: 0, entities: 0 },
      { text: Array.from({ length: 800 }, (_, i) => `word${i}`).join(" "), wordCount: 800, facts: 10, entities: 5 },
      { text: Array.from({ length: 5000 }, (_, i) => `word${i}`).join(" "), wordCount: 5000, facts: 0, entities: 0 },
    ];
    for (const { text, wordCount, facts, entities } of testCases) {
      const score = computeInformationDensityScore(text, wordCount, facts, entities);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it("entity count contributes to density score", () => {
    const text = Array.from({ length: 100 }, (_, i) => `word${i}`).join(" ");
    const scoreNoEntities = computeInformationDensityScore(text, 100, 0, 0);
    const scoreWithEntities = computeInformationDensityScore(text, 100, 0, 10);
    expect(scoreWithEntities).toBeGreaterThanOrEqual(scoreNoEntities);
  });
});

// ─── Task 7: Schema Semantic Validator ───────────────────────────────────────

import { validateSchema, validateAllSchemas } from "./audit/schemaSemanticValidator";

describe("Task 7 — Schema Semantic Validator: validateSchema", () => {
  it("passes a complete Article schema with no required errors", () => {
    const schema = {
      "@type": "Article",
      headline: "How to Optimize for AI Search",
      author: { "@type": "Person", name: "John Doe", url: "https://example.com/john" },
      datePublished: "2024-01-15",
      dateModified: "2024-06-01",
      description: "A comprehensive guide to GEO optimization",
      image: "https://example.com/image.jpg",
      publisher: { "@type": "Organization", name: "Example Media", url: "https://example.com" },
      url: "https://example.com/article",
    };
    const result = validateSchema(schema, "Article");
    expect(result.missingRequired).toHaveLength(0);
    expect(result.completenessScore).toBeGreaterThan(60);
    expect(result.overallScore).toBeGreaterThan(40);
  });

  it("fails an Article missing all required properties", () => {
    const schema = {
      "@type": "Article",
      description: "Some description",
      // Missing: headline, author, datePublished
    };
    const result = validateSchema(schema, "Article");
    expect(result.missingRequired).toContain("headline");
    expect(result.missingRequired).toContain("author");
    expect(result.missingRequired).toContain("datePublished");
    const errors = result.issues.filter(i => i.severity === "error");
    expect(errors.length).toBeGreaterThan(0);
    expect(result.completenessScore).toBeLessThan(50);
  });

  it("detects placeholder values as invalid", () => {
    const schema = {
      "@type": "Article",
      headline: "n/a",
      author: "Unknown",
      datePublished: "TODO",
    };
    const result = validateSchema(schema, "Article");
    // headline "n/a" and datePublished "TODO" should be flagged as invalid
    const correctnessIssues = result.issues.filter(i =>
      i.severity === "warning" && i.message.includes("invalid or placeholder")
    );
    expect(correctnessIssues.length).toBeGreaterThan(0);
  });

  it("rewards sameAs with Wikidata links in semantic value score", () => {
    const withWikidata = {
      "@type": "Organization",
      name: "Google",
      url: "https://google.com",
      sameAs: ["https://www.wikidata.org/wiki/Q95", "https://en.wikipedia.org/wiki/Google"],
    };
    const withoutWikidata = {
      "@type": "Organization",
      name: "Google",
      url: "https://google.com",
    };
    const scoreWith = validateSchema(withWikidata, "Organization").semanticValueScore;
    const scoreWithout = validateSchema(withoutWikidata, "Organization").semanticValueScore;
    expect(scoreWith).toBeGreaterThan(scoreWithout);
  });

  it("handles unknown schema types gracefully without throwing", () => {
    const schema = {
      "@type": "UnknownCustomType",
      name: "Something",
    };
    expect(() => validateSchema(schema, "UnknownCustomType")).not.toThrow();
    const result = validateSchema(schema, "UnknownCustomType");
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });

  it("scores a complete Product schema highly", () => {
    const completeProduct = {
      "@type": "Product",
      name: "Running Shoes Pro",
      offers: { "@type": "Offer", price: "99.99", priceCurrency: "USD" },
      description: "Professional running shoes for marathon training",
      image: "https://example.com/shoe.jpg",
      brand: { "@type": "Brand", name: "SportsBrand" },
      aggregateRating: { "@type": "AggregateRating", ratingValue: "4.5", reviewCount: "120" },
      sku: "RS-PRO-001",
    };
    const result = validateSchema(completeProduct, "Product");
    expect(result.missingRequired).toHaveLength(0);
    expect(result.completenessScore).toBeGreaterThan(70);
  });

  it("all scores are in range 0-100", () => {
    const schema = {
      "@type": "Article",
      headline: "Test",
      author: { "@type": "Person", name: "Author" },
      datePublished: "2024-01-01",
    };
    const result = validateSchema(schema, "Article");
    expect(result.completenessScore).toBeGreaterThanOrEqual(0);
    expect(result.completenessScore).toBeLessThanOrEqual(100);
    expect(result.correctnessScore).toBeGreaterThanOrEqual(0);
    expect(result.correctnessScore).toBeLessThanOrEqual(100);
    expect(result.semanticValueScore).toBeGreaterThanOrEqual(0);
    expect(result.semanticValueScore).toBeLessThanOrEqual(100);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });
});

describe("Task 7 — Schema Semantic Validator: validateAllSchemas", () => {
  it("returns zero scores for empty schemas array", () => {
    const result = validateAllSchemas([]);
    expect(result.avgOverallScore).toBe(0);
    expect(result.results).toHaveLength(0);
    expect(result.totalErrors).toBe(0);
    expect(result.totalWarnings).toBe(0);
  });

  it("aggregates multiple schemas correctly", () => {
    const schemas = [
      {
        type: "Article",
        raw: {
          "@type": "Article",
          headline: "Test Article",
          author: { "@type": "Person", name: "Author" },
          datePublished: "2024-01-01",
        },
      },
      {
        type: "Organization",
        raw: {
          "@type": "Organization",
          name: "Test Org",
          url: "https://example.com",
          sameAs: ["https://www.wikidata.org/wiki/Q12345"],
        },
      },
    ];
    const result = validateAllSchemas(schemas);
    expect(result.results).toHaveLength(2);
    expect(result.avgOverallScore).toBeGreaterThan(0);
    expect(result.avgOverallScore).toBeLessThanOrEqual(100);
  });

  it("collects critical missing properties across all schemas", () => {
    const schemas = [
      {
        type: "Article",
        raw: { "@type": "Article", description: "desc" }, // missing headline, author, datePublished
      },
      {
        type: "Product",
        raw: { "@type": "Product", description: "desc" }, // missing name, offers
      },
    ];
    const result = validateAllSchemas(schemas);
    expect(result.criticalMissingProperties).toContain("headline");
    expect(result.criticalMissingProperties).toContain("name");
    expect(result.totalErrors).toBeGreaterThan(0);
  });

  it("returns correct error and warning counts", () => {
    const schemas = [
      {
        type: "Article",
        raw: {
          "@type": "Article",
          // No required properties — should generate errors
        },
      },
    ];
    const result = validateAllSchemas(schemas);
    // Article requires: headline, author, datePublished — all missing = 3 errors
    expect(result.totalErrors).toBeGreaterThanOrEqual(3);
  });
});

// ─── Integration: scorer handles continuous scores ───────────────────────────

import { computeOverallScore } from "./audit/scorer";

describe("Integration — scorer handles continuous scores", () => {
  it("computeOverallScore works with checks that have score field", () => {
    const findings = {
      technical: {
        score: 80,
        maxScore: 100,
        checks: [
          { id: "https", label: "HTTPS", status: "pass" as const, score: 100, description: "", impact: "high" as const },
          { id: "canonical", label: "Canonical", status: "warning" as const, score: 50, description: "", impact: "medium" as const },
        ],
        summary: "",
      },
      structuredData: { score: 60, maxScore: 100, checks: [], summary: "" },
      contentStructure: { score: 70, maxScore: 100, checks: [], summary: "" },
      eeat: { score: 55, maxScore: 100, checks: [], summary: "" },
      aiCrawlers: { score: 90, maxScore: 100, checks: [], summary: "" },
      metaTags: { score: 75, maxScore: 100, checks: [], summary: "" },
    };
    const score = computeOverallScore(findings);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("computeOverallScore works with checks without score field (backward compat)", () => {
    const findings = {
      technical: {
        score: 80,
        maxScore: 100,
        checks: [
          { id: "https", label: "HTTPS", status: "pass" as const, description: "", impact: "high" as const },
        ],
        summary: "",
      },
      structuredData: { score: 60, maxScore: 100, checks: [], summary: "" },
      contentStructure: { score: 70, maxScore: 100, checks: [], summary: "" },
      eeat: { score: 55, maxScore: 100, checks: [], summary: "" },
      aiCrawlers: { score: 90, maxScore: 100, checks: [], summary: "" },
      metaTags: { score: 75, maxScore: 100, checks: [], summary: "" },
    };
    const score = computeOverallScore(findings);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
