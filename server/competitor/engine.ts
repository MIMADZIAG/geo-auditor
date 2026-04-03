/**
 * Competitor Intelligence Engine
 *
 * Runs lightweight (no-LLM, no Content Intelligence) audits on the top-5
 * competitor URLs discovered during a citation job. All 5 audits run in
 * parallel via Promise.allSettled so one slow/blocked URL never delays the rest.
 *
 * Design principles:
 *  1. SAME audit modules as the main engine — identical check IDs, identical scoring.
 *     This guarantees 1:1 comparability for future gap analysis.
 *  2. No LLM calls — fast, cheap, repeatable. LLM recs are irrelevant for competitors.
 *  3. mapFindingsToColumns() is the single source of truth for check→column mapping.
 *     When new checks are added to audit modules, add them here too.
 *  4. Parallel execution with individual error isolation — one failure ≠ all fail.
 */

import { scrapePage } from "../audit/scraper";
import { analyzeTechnical } from "../audit/technical";
import { analyzeStructuredData } from "../audit/structuredData";
import { analyzeContentStructure } from "../audit/contentStructure";
import { analyzeEEAT } from "../audit/eeat";
import { analyzeAICrawlers } from "../audit/aiCrawlers";
import { analyzeMetaTags } from "../audit/metaTags";
import { analyzeBrandAuthority } from "../audit/brandAuthority";
import { computeOverallScore } from "../audit/scorer";
import { detectPageType } from "../audit/pageTypeDetector";
import type { AuditFindings, AuditCheck } from "../audit/types";
import type { InsertCompetitorAudit } from "../../drizzle/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompetitorAuditInput {
  url: string;
  domain: string;
  citationCount: number;
  rank: number; // 1 = most cited
}

// Columns that the engine computes — identity fields are provided by the caller
export type CompetitorAuditColumns = Omit<
  InsertCompetitorAudit,
  "id" | "auditId" | "jobId" | "userId" | "url" | "domain" | "pageTitle" |
  "citationCount" | "rank" | "status" | "errorMessage" | "createdAt" | "completedAt"
>;

export interface CompetitorAuditOutput {
  input: CompetitorAuditInput;
  columns: CompetitorAuditColumns;
  error?: string;
}

// ─── Top-URL Extractor ────────────────────────────────────────────────────────

/**
 * From a citation job result, extract the top-N most-cited unique URLs
 * (not domains — we want the specific page that AI cited, for maximum accuracy).
 *
 * Strategy:
 *  1. Aggregate all allCitedUrls across every CitationResult row.
 *  2. Count frequency per URL (exact match after normalisation).
 *  3. Exclude the target domain itself.
 *  4. Return top N by frequency, with domain and count attached.
 */
export function extractTopCompetitorUrls(
  allResults: Array<{ allCitedUrls: string[]; competitorDomains: string[] }>,
  targetDomain: string,
  topN = 5
): CompetitorAuditInput[] {
  const urlFreq: Record<string, number> = {};

  for (const r of allResults) {
    for (const rawUrl of r.allCitedUrls) {
      try {
        const u = new URL(rawUrl);
        const hostname = u.hostname.replace(/^www\./, "");
        if (hostname === targetDomain) continue; // skip self
        // Normalise: remove trailing slash, lowercase path
        const normalised = `${u.protocol}//${u.hostname}${u.pathname.replace(/\/$/, "").toLowerCase()}${u.search}`;
        urlFreq[normalised] = (urlFreq[normalised] ?? 0) + 1;
      } catch {
        // malformed URL — skip
      }
    }
  }

  return Object.entries(urlFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([url, count], idx) => {
      let domain = "";
      try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch {}
      return { url, domain, citationCount: count, rank: idx + 1 };
    });
}

// ─── Check → Column Mapper ────────────────────────────────────────────────────

/**
 * Maps AuditFindings check results to the flat competitor_audits column set.
 * Pass/fail: 1 = pass, 0 = fail/warning, null = check not found.
 *
 * Convention for "inverted" checks (where presence = bad):
 *   noindex, nosnippet, robots_disallow, noai_directive, ai_full_block
 *   → stored as 1 when the bad condition is PRESENT (so 1 = problem exists).
 */
function checkVal(checks: AuditCheck[], id: string): number | null {
  const c = checks.find((x) => x.id === id);
  if (!c) return null;
  return c.status === "pass" ? 1 : 0;
}

/** Inverted check: 1 = bad condition present, 0 = not present */
function checkBad(checks: AuditCheck[], id: string): number | null {
  const c = checks.find((x) => x.id === id);
  if (!c) return null;
  return c.status === "fail" ? 1 : 0;
}

function numVal(checks: AuditCheck[], id: string): number | null {
  const c = checks.find((x) => x.id === id);
  if (!c || c.value == null) return null;
  const n = Number(c.value);
  return isNaN(n) ? null : n;
}

export function mapFindingsToColumns(
  findings: AuditFindings,
  overallScore: number,
  responseTimeMs: number
): CompetitorAuditColumns {
  const tech = findings.technical.checks;
  const sd   = findings.structuredData.checks;
  const cs   = findings.contentStructure.checks;
  const ee   = findings.eeat.checks;
  const ai   = findings.aiCrawlers.checks;
  const mt   = findings.metaTags.checks;
  const ba   = findings.brandAuthority?.checks ?? [];

  return {
    // ── Category scores ──────────────────────────────────────────────────────
    overallScore:          Math.round(overallScore),
    technicalScore:        Math.round(findings.technical.score),
    structuredDataScore:   Math.round(findings.structuredData.score),
    contentStructureScore: Math.round(findings.contentStructure.score),
    eeatScore:             Math.round(findings.eeat.score),
    aiCrawlersScore:       Math.round(findings.aiCrawlers.score),
    metaTagsScore:         Math.round(findings.metaTags.score),
    brandAuthorityScore:   findings.brandAuthority ? Math.round(findings.brandAuthority.score) : null,

    // ── Technical ────────────────────────────────────────────────────────────
    tech_https:           checkVal(tech, "https"),
    tech_noindex:         checkBad(tech, "noindex"),
    tech_nosnippet:       checkBad(tech, "nosnippet"),
    tech_canonical:       checkVal(tech, "canonical"),
    tech_viewport:        checkVal(tech, "viewport"),
    tech_robots_disallow: checkBad(tech, "robots_disallow_page"),
    tech_response_time_ms: responseTimeMs,
    tech_page_size_kb:    numVal(tech, "page_size") as number | null,
    tech_sitemap:         checkVal(tech, "sitemap_reference"),
    tech_hreflang:        checkVal(tech, "hreflang"),
    tech_max_snippet:     checkVal(tech, "max_snippet"),
    tech_noai_directive:  checkBad(tech, "noai_directive"),

    // ── Structured Data ──────────────────────────────────────────────────────
    sd_jsonld_present:      checkVal(sd, "jsonld_present"),
    sd_high_value_schema:   checkVal(sd, "high_value_schema"),
    sd_faq_schema:          checkVal(sd, "faq_schema"),
    sd_howto_schema:        checkVal(sd, "howto_schema"),
    sd_article_product:     checkVal(sd, "article_product_schema"),
    sd_organization:        checkVal(sd, "organization_schema"),
    sd_schema_completeness: checkVal(sd, "schema_completeness"),
    sd_author_schema:       checkVal(sd, "author_schema"),
    sd_date_signals:        checkVal(sd, "date_signals"),
    sd_breadcrumb:          checkVal(sd, "breadcrumb_schema"),

    // ── Content Structure ────────────────────────────────────────────────────
    cs_h1_present:           checkVal(cs, "h1_present"),
    cs_heading_hierarchy:    checkVal(cs, "heading_hierarchy"),
    cs_passage_optimization: checkVal(cs, "passage_optimization"),
    cs_tldr_summary:         checkVal(cs, "tldr_summary"),
    cs_faq_section:          checkVal(cs, "faq_section"),
    cs_semantic_chunking:    checkVal(cs, "semantic_chunking"),
    cs_entity_richness:      checkVal(cs, "entity_richness"),
    cs_readability:          checkVal(cs, "readability"),
    cs_semantic_triples:     checkVal(cs, "semantic_triples"),
    cs_lists_present:        checkVal(cs, "lists_present"),
    cs_content_length:       numVal(cs, "content_length") as number | null,
    cs_information_gain:     checkVal(cs, "information_gain"),
    cs_answer_patterns:      checkVal(cs, "answer_patterns"),
    cs_external_citations:   checkVal(cs, "external_citations"),
    cs_data_points:          checkVal(cs, "data_points"),

    // ── E-E-A-T ──────────────────────────────────────────────────────────────
    eeat_author_byline:      checkVal(ee, "author_byline"),
    eeat_about_page:         checkVal(ee, "about_page"),
    eeat_contact_info:       checkVal(ee, "contact_info"),
    eeat_legal_pages:        checkVal(ee, "legal_pages"),
    eeat_review_signals:     checkVal(ee, "review_signals"),
    eeat_trust_signals:      checkVal(ee, "trust_signals"),
    eeat_publication_date:   checkVal(ee, "publication_date"),
    eeat_experience_signals: checkVal(ee, "experience_signals"),
    eeat_expertise_signals:  checkVal(ee, "expertise_signals"),

    // ── AI Crawlers ───────────────────────────────────────────────────────────
    ai_url_access:       checkVal(ai, "audited_url_access"),
    ai_full_block:       checkBad(ai, "ai_search_full_block"),
    ai_training_bots:    checkVal(ai, "ai_training_bots"),
    ai_sitemap_crawlers: checkVal(ai, "sitemap_for_crawlers"),
    ai_llms_txt:         checkVal(ai, "llms_txt"),

    // ── Meta Tags ─────────────────────────────────────────────────────────────
    mt_title_tag:        checkVal(mt, "title_tag"),
    mt_meta_description: checkVal(mt, "meta_description"),
    mt_og_title:         checkVal(mt, "og_title"),
    mt_og_description:   checkVal(mt, "og_description"),
    mt_og_image:         checkVal(mt, "og_image"),
    mt_twitter_card:     checkVal(mt, "twitter_card"),
    mt_lang_attribute:   checkVal(mt, "lang_attribute"),

    // ── Brand Authority ───────────────────────────────────────────────────────
    ba_brand_consistency:    checkVal(ba, "brand_consistency"),
    ba_knowledge_panel:      checkVal(ba, "knowledge_panel"),
    ba_media_presence:       checkVal(ba, "media_presence"),
    ba_industry_credentials: checkVal(ba, "industry_credentials"),
    ba_social_proof:         checkVal(ba, "social_proof"),
    ba_niche_authority:      checkVal(ba, "niche_authority"),
  };
}

// ─── Empty Columns Helper ────────────────────────────────────────────────────

/** Returns a null-filled CompetitorAuditColumns for error/scrape-fail cases */
function emptyColumns(responseTimeMs: number | null): CompetitorAuditColumns {
  return {
    overallScore: 0, technicalScore: 0, structuredDataScore: 0,
    contentStructureScore: 0, eeatScore: 0, aiCrawlersScore: 0,
    metaTagsScore: 0, brandAuthorityScore: null,
    tech_https: null, tech_noindex: null, tech_nosnippet: null,
    tech_canonical: null, tech_viewport: null, tech_robots_disallow: null,
    tech_response_time_ms: responseTimeMs, tech_page_size_kb: null,
    tech_sitemap: null, tech_hreflang: null, tech_max_snippet: null,
    tech_noai_directive: null,
    sd_jsonld_present: null, sd_high_value_schema: null, sd_faq_schema: null,
    sd_howto_schema: null, sd_article_product: null, sd_organization: null,
    sd_schema_completeness: null, sd_author_schema: null, sd_date_signals: null,
    sd_breadcrumb: null,
    cs_h1_present: null, cs_heading_hierarchy: null, cs_passage_optimization: null,
    cs_tldr_summary: null, cs_faq_section: null, cs_semantic_chunking: null,
    cs_entity_richness: null, cs_readability: null, cs_semantic_triples: null,
    cs_lists_present: null, cs_content_length: null, cs_information_gain: null,
    cs_answer_patterns: null, cs_external_citations: null, cs_data_points: null,
    eeat_author_byline: null, eeat_about_page: null, eeat_contact_info: null,
    eeat_legal_pages: null, eeat_review_signals: null, eeat_trust_signals: null,
    eeat_publication_date: null, eeat_experience_signals: null, eeat_expertise_signals: null,
    ai_url_access: null, ai_full_block: null, ai_training_bots: null,
    ai_sitemap_crawlers: null, ai_llms_txt: null,
    mt_title_tag: null, mt_meta_description: null, mt_og_title: null,
    mt_og_description: null, mt_og_image: null, mt_twitter_card: null,
    mt_lang_attribute: null,
    ba_brand_consistency: null, ba_knowledge_panel: null, ba_media_presence: null,
    ba_industry_credentials: null, ba_social_proof: null, ba_niche_authority: null,
  };
}

// ─── Single Competitor Audit ──────────────────────────────────────────────────

async function auditOneCompetitor(input: CompetitorAuditInput): Promise<CompetitorAuditOutput> {
  try {
    const page = await scrapePage(input.url);

    if (page.error) {
      return {
        input,
    columns: emptyColumns(page.responseTimeMs),
      error: page.error,
      };
    }

    const pageTypeResult = detectPageType(page);
    const pageType = pageTypeResult.type;

    // Run all analysis modules synchronously (same as main audit, no LLM)
    const technical       = analyzeTechnical(page);
    const sdResult        = analyzeStructuredData(page);
    const contentStructure = await analyzeContentStructure(page, pageType);
    const eeat            = analyzeEEAT(page, pageType);
    const aiCrawlers      = analyzeAICrawlers(page);
    const metaTags        = analyzeMetaTags(page);
    const brandAuthority  = analyzeBrandAuthority(page, pageType);

    // Strip extra fields (same pattern as main audit/index.ts)
    const { schemas: _s, ...structuredData } = sdResult;
    const { crawlerStatuses: _cs, ...aiCrawlersClean } = analyzeAICrawlers(page);
    const { brandPresenceScore: _bps, brandName: _bn, authorityTier: _at, signals: _sig, ...brandAuthorityBase } = brandAuthority;

    const findings: AuditFindings = {
      technical,
      structuredData,
      contentStructure,
      eeat,
      aiCrawlers: aiCrawlersClean,
      metaTags,
      brandAuthority: brandAuthorityBase,
    };

    const overallScore = computeOverallScore(findings);
    const columns = mapFindingsToColumns(findings, overallScore, page.responseTimeMs);

    return {
      input,
      columns: {
        ...columns,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      input,
      columns: emptyColumns(null),
      error: msg,
    };
  }
}

// ─── Parallel Runner ──────────────────────────────────────────────────────────

/**
 * Run up to 5 competitor audits in parallel.
 * Returns results in rank order (rank 1 = most cited first).
 * Individual failures are isolated — a blocked competitor doesn't abort the rest.
 */
export async function runCompetitorAudits(
  inputs: CompetitorAuditInput[]
): Promise<CompetitorAuditOutput[]> {
  const settled = await Promise.allSettled(
    inputs.map((input) => auditOneCompetitor(input))
  );

  return settled.map((result, idx) => {
    if (result.status === "fulfilled") return result.value;
    // Promise itself rejected (shouldn't happen — auditOneCompetitor catches internally)
    return {
      input: inputs[idx],
      columns: {} as CompetitorAuditOutput["columns"],
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    };
  });
}
