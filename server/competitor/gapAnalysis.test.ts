/**
 * Gap Analysis Engine — Unit Tests
 *
 * Tests for computeGapAnalysis() covering:
 *  - Gap detection (target fails, competitors pass)
 *  - No gap when target passes
 *  - No gap when minority of competitors pass
 *  - Priority computation
 *  - Inverted checks (noai, full_block)
 *  - Category summary aggregation
 *  - Empty competitors → no gaps
 *  - Sorting order (critical first)
 */

import { describe, it, expect } from "vitest";
import { computeGapAnalysis } from "./gapAnalysis";
import type { AuditFindings } from "../audit/types";
import type { CompetitorAudit } from "../../drizzle/schema";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFindings(overrides: Partial<AuditFindings> = {}): AuditFindings {
  return {
    technical: {
      score: 50,
      maxScore: 100,
      summary: "",
      checks: [
        { id: "https", label: "HTTPS", status: "fail", description: "", impact: "high" },
        { id: "canonical", label: "Canonical", status: "fail", description: "", impact: "medium" },
        { id: "viewport", label: "Viewport", status: "pass", description: "", impact: "low" },
        { id: "noai_directive", label: "noai", status: "pass", description: "", impact: "high" }, // inverted: pass means NOT blocked
      ],
    },
    structuredData: {
      score: 30,
      maxScore: 100,
      summary: "",
      checks: [
        { id: "jsonld_present", label: "JSON-LD", status: "fail", description: "", impact: "high" },
        { id: "faq_schema", label: "FAQ schema", status: "fail", description: "", impact: "high" },
        { id: "organization_schema", label: "Organization", status: "pass", description: "", impact: "medium" },
      ],
    },
    contentStructure: {
      score: 60,
      maxScore: 100,
      summary: "",
      checks: [
        { id: "h1_present", label: "H1", status: "pass", description: "", impact: "high" },
        { id: "faq_section", label: "FAQ section", status: "fail", description: "", impact: "high" },
        { id: "tldr_summary", label: "TL;DR", status: "fail", description: "", impact: "medium" },
      ],
    },
    eeat: {
      score: 40,
      maxScore: 100,
      summary: "",
      checks: [
        { id: "author_byline", label: "Author", status: "fail", description: "", impact: "high" },
        { id: "expertise_signals", label: "Expertise", status: "fail", description: "", impact: "high" },
      ],
    },
    aiCrawlers: {
      score: 70,
      maxScore: 100,
      summary: "",
      checks: [
        { id: "audited_url_access", label: "AI access", status: "pass", description: "", impact: "high" },
        { id: "ai_search_full_block", label: "No full block", status: "pass", description: "", impact: "high" }, // inverted
        { id: "llms_txt", label: "llms.txt", status: "fail", description: "", impact: "medium" },
      ],
    },
    metaTags: {
      score: 80,
      maxScore: 100,
      summary: "",
      checks: [
        { id: "title_tag", label: "Title", status: "pass", description: "", impact: "high" },
        { id: "meta_description", label: "Meta desc", status: "fail", description: "", impact: "medium" },
      ],
    },
    brandAuthority: {
      score: 20,
      maxScore: 100,
      summary: "",
      checks: [
        { id: "social_proof", label: "Social proof", status: "fail", description: "", impact: "medium" },
      ],
    },
    ...overrides,
  };
}

function makeCompetitor(overrides: Partial<CompetitorAudit> = {}): CompetitorAudit {
  return {
    id: 1,
    auditId: 100,
    jobId: 200,
    userId: 1,
    url: "https://competitor.com/page",
    domain: "competitor.com",
    citationCount: 3,
    rank: 1,
    pageTitle: "Competitor Page",
    status: "completed",
    errorMessage: null,
    overallScore: 75,
    technicalScore: 80,
    structuredDataScore: 70,
    contentStructureScore: 65,
    eeatScore: 60,
    aiCrawlersScore: 90,
    metaTagsScore: 85,
    brandAuthorityScore: 50,
    // Technical
    tech_https: 1,
    tech_noindex: 0,
    tech_nosnippet: 0,
    tech_canonical: 1,
    tech_viewport: 1,
    tech_robots_disallow: 0,
    tech_response_time_ms: 800,
    tech_page_size_kb: 150,
    tech_sitemap: 1,
    tech_hreflang: 0,
    tech_max_snippet: 1,
    tech_noai_directive: 0, // inverted: 0 = not blocked = PASS
    // Structured Data
    sd_jsonld_present: 1,
    sd_high_value_schema: 1,
    sd_faq_schema: 1,
    sd_howto_schema: 0,
    sd_article_product: 1,
    sd_organization: 1,
    sd_schema_completeness: 1,
    sd_author_schema: 1,
    sd_date_signals: 1,
    sd_breadcrumb: 1,
    // Content Structure
    cs_h1_present: 1,
    cs_heading_hierarchy: 1,
    cs_passage_optimization: 1,
    cs_tldr_summary: 1,
    cs_faq_section: 1,
    cs_semantic_chunking: 1,
    cs_entity_richness: 1,
    cs_readability: 1,
    cs_semantic_triples: 1,
    cs_lists_present: 1,
    cs_content_length: 1200,
    cs_information_gain: 1,
    cs_answer_patterns: 1,
    cs_external_citations: 1,
    cs_data_points: 1,
    // E-E-A-T
    eeat_author_byline: 1,
    eeat_about_page: 1,
    eeat_contact_info: 1,
    eeat_legal_pages: 1,
    eeat_review_signals: 1,
    eeat_trust_signals: 1,
    eeat_publication_date: 1,
    eeat_experience_signals: 1,
    eeat_expertise_signals: 1,
    // AI Crawlers
    ai_url_access: 1,
    ai_full_block: 0, // inverted: 0 = not blocked = PASS
    ai_training_bots: 1,
    ai_sitemap_crawlers: 1,
    ai_llms_txt: 1,
    // Meta Tags
    mt_title_tag: 1,
    mt_meta_description: 1,
    mt_og_title: 1,
    mt_og_description: 1,
    mt_og_image: 1,
    mt_twitter_card: 1,
    mt_lang_attribute: 1,
    // Brand Authority
    ba_brand_consistency: 1,
    ba_knowledge_panel: 0,
    ba_media_presence: 1,
    ba_industry_credentials: 1,
    ba_social_proof: 1,
    ba_niche_authority: 1,
    createdAt: new Date(),
    completedAt: new Date(),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("computeGapAnalysis", () => {
  it("returns no gaps when no competitors", () => {
    const findings = makeFindings();
    const result = computeGapAnalysis(findings, []);
    expect(result.totalGaps).toBe(0);
    expect(result.gaps).toHaveLength(0);
  });

  it("returns no gaps when all competitors are failed status", () => {
    const findings = makeFindings();
    const competitor = makeCompetitor({ status: "failed" });
    const result = computeGapAnalysis(findings, [competitor]);
    expect(result.totalGaps).toBe(0);
  });

  it("detects gap when target fails and competitor passes", () => {
    const findings = makeFindings();
    const competitor = makeCompetitor();
    const result = computeGapAnalysis(findings, [competitor]);

    // https: target fails, competitor passes → gap
    const httpsGap = result.gaps.find(g => g.checkId === "https");
    expect(httpsGap).toBeDefined();
    expect(httpsGap!.competitorPassCount).toBe(1);
    expect(httpsGap!.competitorTotal).toBe(1);
  });

  it("does NOT detect gap when target passes", () => {
    const findings = makeFindings();
    const competitor = makeCompetitor();
    const result = computeGapAnalysis(findings, [competitor]);

    // h1_present: target passes → no gap
    const h1Gap = result.gaps.find(g => g.checkId === "h1_present");
    expect(h1Gap).toBeUndefined();
  });

  it("does NOT detect gap when minority of competitors pass (<50%)", () => {
    const findings = makeFindings();
    // 2 competitors: one passes faq_schema, one fails
    const comp1 = makeCompetitor({ id: 1, sd_faq_schema: 1 });
    const comp2 = makeCompetitor({ id: 2, sd_faq_schema: 0 });
    // target fails faq_schema
    const result = computeGapAnalysis(findings, [comp1, comp2]);

    // 1/2 = 50% → should still be a gap (threshold is >= 0.5)
    const faqGap = result.gaps.find(g => g.checkId === "faq_schema");
    expect(faqGap).toBeDefined();
  });

  it("does NOT detect gap when less than 50% of competitors pass", () => {
    const findings = makeFindings();
    // 3 competitors: 1 passes, 2 fail
    const comp1 = makeCompetitor({ id: 1, sd_faq_schema: 1 });
    const comp2 = makeCompetitor({ id: 2, sd_faq_schema: 0 });
    const comp3 = makeCompetitor({ id: 3, sd_faq_schema: 0 });
    const result = computeGapAnalysis(findings, [comp1, comp2, comp3]);

    // 1/3 = 33% → below threshold → no gap
    const faqGap = result.gaps.find(g => g.checkId === "faq_schema");
    expect(faqGap).toBeUndefined();
  });

  it("handles inverted checks correctly (noai_directive)", () => {
    // noai_directive: 1 = blocked (BAD), 0 = not blocked (GOOD)
    // Target: noai_directive check status "pass" means NOT blocked (value 0 in DB)
    // Competitor: tech_noai_directive = 0 (not blocked = PASS)
    const findings = makeFindings({
      technical: {
        score: 50,
        maxScore: 100,
        summary: "",
        checks: [
          // status "fail" for noai means target IS blocked (bad)
          { id: "noai_directive", label: "noai", status: "fail", description: "", impact: "high" },
        ],
      },
    });
    const competitor = makeCompetitor({ tech_noai_directive: 0 }); // not blocked = pass
    const result = computeGapAnalysis(findings, [competitor]);

    const noaiGap = result.gaps.find(g => g.checkId === "noai_directive");
    expect(noaiGap).toBeDefined();
  });

  it("handles inverted checks correctly (ai_full_block)", () => {
    // ai_full_block: 1 = blocked (BAD), 0 = not blocked (GOOD)
    // Target: status "fail" means IS blocked
    const findings = makeFindings({
      aiCrawlers: {
        score: 0,
        maxScore: 100,
        summary: "",
        checks: [
          { id: "ai_search_full_block", label: "Full block", status: "fail", description: "", impact: "high" },
        ],
      },
    });
    const competitor = makeCompetitor({ ai_full_block: 0 }); // not blocked
    const result = computeGapAnalysis(findings, [competitor]);

    const blockGap = result.gaps.find(g => g.checkId === "ai_search_full_block");
    expect(blockGap).toBeDefined();
  });

  it("assigns critical priority to aiCrawlers gaps", () => {
    const findings = makeFindings({
      aiCrawlers: {
        score: 0,
        maxScore: 100,
        summary: "",
        checks: [
          { id: "llms_txt", label: "llms.txt", status: "fail", description: "", impact: "medium" },
        ],
      },
    });
    const competitor = makeCompetitor({ ai_llms_txt: 1 });
    const result = computeGapAnalysis(findings, [competitor]);

    const llmsGap = result.gaps.find(g => g.checkId === "llms_txt");
    expect(llmsGap).toBeDefined();
    expect(llmsGap!.priority).toBe("critical");
  });

  it("sorts gaps: critical before high before medium before low", () => {
    const findings = makeFindings();
    const competitor = makeCompetitor();
    const result = computeGapAnalysis(findings, [competitor]);

    const priorities = result.gaps.map(g => g.priority);
    const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
    for (let i = 1; i < priorities.length; i++) {
      expect(PRIORITY_ORDER[priorities[i]]).toBeGreaterThanOrEqual(PRIORITY_ORDER[priorities[i - 1]]);
    }
  });

  it("populates categorySummary correctly", () => {
    const findings = makeFindings();
    const competitor = makeCompetitor();
    const result = computeGapAnalysis(findings, [competitor]);

    // structuredData has gaps (jsonld_present, faq_schema fail in target)
    expect(result.categorySummary.structuredData.gaps).toBeGreaterThan(0);
    // technical has gaps (https, canonical fail in target)
    expect(result.categorySummary.technical.gaps).toBeGreaterThan(0);
    // Category scores come from target findings
    expect(result.categorySummary.technical.score).toBe(50);
    expect(result.categorySummary.structuredData.score).toBe(30);
  });

  it("includes recommendation and impact text for each gap", () => {
    const findings = makeFindings();
    const competitor = makeCompetitor();
    const result = computeGapAnalysis(findings, [competitor]);

    for (const gap of result.gaps) {
      expect(gap.recommendation).toBeTruthy();
      expect(gap.impact).toBeTruthy();
      expect(gap.label).toBeTruthy();
      expect(gap.categoryLabel).toBeTruthy();
    }
  });

  it("handles multiple competitors and aggregates pass counts", () => {
    const findings = makeFindings();
    const comp1 = makeCompetitor({ id: 1, sd_faq_schema: 1 });
    const comp2 = makeCompetitor({ id: 2, sd_faq_schema: 1 });
    const comp3 = makeCompetitor({ id: 3, sd_faq_schema: 0 });

    const result = computeGapAnalysis(findings, [comp1, comp2, comp3]);
    const faqGap = result.gaps.find(g => g.checkId === "faq_schema");

    expect(faqGap).toBeDefined();
    expect(faqGap!.competitorPassCount).toBe(2);
    expect(faqGap!.competitorTotal).toBe(3);
  });

  it("returns totalChecks equal to CHECK_DEFS length", () => {
    const findings = makeFindings();
    const result = computeGapAnalysis(findings, [makeCompetitor()]);
    // We have 34 check definitions
    expect(result.totalChecks).toBe(34);
  });

  it("includes analysedAt timestamp", () => {
    const findings = makeFindings();
    const result = computeGapAnalysis(findings, [makeCompetitor()]);
    expect(result.analysedAt).toBeTruthy();
    expect(new Date(result.analysedAt).getTime()).toBeGreaterThan(0);
  });
});
