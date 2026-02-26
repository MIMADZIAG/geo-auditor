import type { ScrapedPage } from "./scraper";
import type { PageType } from "./pageTypeDetector";
import type { AuditCheck, CategoryResult } from "./types";

export function analyzeContentStructure(page: ScrapedPage, pageType: PageType = "generic"): CategoryResult {
  const checks: AuditCheck[] = [];
  const $ = page.$;

  // Remove script/style/nav/footer noise
  $("script, style, nav, footer, header, aside, noscript").remove();
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = bodyText.split(/\s+/).filter(Boolean).length;

  // ── 1. H1 present ─────────────────────────────────────────────────────────
  const h1Count = $("h1").length;
  checks.push({
    id: "h1_present",
    label: "H1 Heading Present",
    status: h1Count === 1 ? "pass" : h1Count === 0 ? "fail" : "warning",
    description:
      h1Count === 1
        ? `H1 found: "${$("h1").first().text().trim().slice(0, 80)}"`
        : h1Count === 0
        ? "No H1 heading found. Every page needs exactly one H1 for AI engines to identify the main topic."
        : `${h1Count} H1 headings found. Use exactly one H1 per page.`,
    impact: "high",
    value: h1Count,
  });

  // ── 2. Heading hierarchy ──────────────────────────────────────────────────
  const h2Count = $("h2").length;
  const h3Count = $("h3").length;
  const hasGoodHierarchy = h1Count >= 1 && h2Count >= 2;
  checks.push({
    id: "heading_hierarchy",
    label: "Heading Hierarchy (H1→H2→H3)",
    status: hasGoodHierarchy ? "pass" : h2Count > 0 ? "warning" : "fail",
    description: hasGoodHierarchy
      ? `Good structure: ${h1Count} H1, ${h2Count} H2, ${h3Count} H3 headings.`
      : h2Count === 0
      ? "No H2 headings found. Use H2 subheadings to structure content for AI scanning."
      : `Only ${h2Count} H2 heading${h2Count > 1 ? "s" : ""}. Add at least 2 H2 sections to improve scannability.`,
    impact: "high",
    value: `H1:${h1Count}, H2:${h2Count}, H3:${h3Count}`,
  });

  // ── 3. TL;DR / Summary block ──────────────────────────────────────────────
  // For product listings and single products, this is less critical
  const tldrRelevant = !["product", "product-listing"].includes(pageType);
  const fullHtml = $.html() ?? "";
  const hasTldr =
    /\b(tl;?dr|summary|key\s+takeaways?|in\s+brief|quick\s+answer|overview|streszczenie|podsumowanie|kluczowe\s+informacje)\b/i.test(
      fullHtml
    );

  checks.push({
    id: "tldr_summary",
    label: "TL;DR / Summary Block",
    // GEO-critical for articles/guides; warning for others; info for product pages
    status: hasTldr
      ? "pass"
      : tldrRelevant
      ? "fail"   // ← was warning — now FAIL for article/blog/homepage/service
      : "warning",
    description: hasTldr
      ? "Summary or TL;DR section detected — AI engines can quote this directly."
      : tldrRelevant
      ? "No TL;DR or summary section found. This is a critical GEO gap — AI engines heavily quote page summaries. Add a 2–4 sentence summary at the top labeled 'TL;DR', 'Summary', or 'Key Takeaways'."
      : "No summary section found. Consider adding a short product description summary for AI citation.",
    impact: "high",
    value: hasTldr,
  });

  // ── 4. FAQ section ────────────────────────────────────────────────────────
  const faqKeywords =
    /\b(faq|frequently\s+asked|common\s+questions?|questions?\s+and\s+answers?|najczęściej\s+zadawane|pytania\s+i\s+odpowiedzi)\b/i;
  const hasFaqSection =
    faqKeywords.test(fullHtml) ||
    $("h2, h3")
      .toArray()
      .some((el) => faqKeywords.test($(el).text()));

  // FAQ is critical for articles/service pages; less so for pure product listings
  const faqRelevant = !["product-listing"].includes(pageType);
  checks.push({
    id: "faq_section",
    label: "FAQ Section",
    status: hasFaqSection
      ? "pass"
      : faqRelevant
      ? "fail"   // ← was warning — now FAIL for most page types
      : "warning",
    description: hasFaqSection
      ? "FAQ section detected — great for AI answer inclusion."
      : faqRelevant
      ? "No FAQ section found. This is a major GEO gap — FAQ content is one of the most cited formats in AI-generated answers. Add 5–10 Q&A pairs about your page topic."
      : "No FAQ section found. Adding a FAQ to your category page can improve AI citation rates.",
    impact: "high",
    value: hasFaqSection,
  });

  // ── 5. Lists (ul/ol) ──────────────────────────────────────────────────────
  const listCount = $("ul, ol").length;
  const hasLists = listCount >= 2;
  checks.push({
    id: "lists_present",
    label: "Lists & Structured Content",
    status: hasLists ? "pass" : listCount === 1 ? "warning" : "fail",
    description: hasLists
      ? `${listCount} list elements found — structured content is preferred by AI engines.`
      : listCount === 1
      ? "Only 1 list found. Use more bullet/numbered lists to make content scannable by AI."
      : "No lists found. AI engines prefer structured content with bullet points and numbered steps.",
    impact: "medium",
    value: listCount,
  });

  // ── 6. Content length ─────────────────────────────────────────────────────
  // Thresholds adjusted per page type
  const minWords = ["product", "product-listing"].includes(pageType) ? 200 : 300;
  const richWords = ["product", "product-listing"].includes(pageType) ? 400 : 800;

  checks.push({
    id: "content_length",
    label: "Adequate Content Length",
    status: wordCount >= richWords ? "pass" : wordCount >= minWords ? "warning" : "fail",
    description:
      wordCount >= richWords
        ? `${wordCount} words — rich content length, good for AI citation.`
        : wordCount >= minWords
        ? `${wordCount} words — adequate but consider expanding to ${richWords}+ words for better AI coverage.`
        : `${wordCount} words — thin content. AI engines prefer pages with at least ${minWords} words.`,
    impact: "high",
    value: wordCount,
  });

  // ── 7. Answer-pattern detection ───────────────────────────────────────────
  // Detects Q&A patterns, direct answers — highly cited by AI
  const hasAnswerPatterns =
    /\b(is\s+defined\s+as|refers?\s+to|means?\s+that|in\s+other\s+words|for\s+example|the\s+answer\s+is|oznacza|definiuje\s+się|to\s+znaczy)\b/i.test(
      bodyText
    );
  checks.push({
    id: "answer_patterns",
    label: "Direct Answer Patterns",
    status: hasAnswerPatterns ? "pass" : "info",
    description: hasAnswerPatterns
      ? "Definitional and answer-pattern language detected — AI engines love quotable direct answers."
      : "Consider adding clear definitions and direct answers to likely user questions to improve citation potential.",
    impact: "medium",
    value: hasAnswerPatterns,
  });

  // ── 8. External citations / outbound links ────────────────────────────────
  // Count outbound links to external domains
  const pageHost = (() => {
    try { return new URL(page.url).hostname; } catch { return ""; }
  })();
  let externalLinkCount = 0;
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (href.startsWith("http") && !href.includes(pageHost)) {
      externalLinkCount++;
    }
  });

  const citationRelevant = ["article", "service", "homepage"].includes(pageType);
  checks.push({
    id: "external_citations",
    label: "External Citations & Links",
    status:
      externalLinkCount >= 3
        ? "pass"
        : externalLinkCount >= 1
        ? "warning"
        : citationRelevant
        ? "fail"
        : "info",
    description:
      externalLinkCount >= 3
        ? `${externalLinkCount} external links found — good citation signals for AI engines.`
        : externalLinkCount >= 1
        ? `Only ${externalLinkCount} external link found. Add 3–5 links to authoritative sources.`
        : citationRelevant
        ? "No external citations found. Linking to authoritative sources (research, statistics, official sites) is a key E-E-A-T and GEO signal."
        : "No external links found. Consider citing sources where relevant.",
    impact: "medium",
    value: externalLinkCount,
  });

  // ── 9. Data points in text ────────────────────────────────────────────────
  const hasDataPoints =
    /\b(\d+%|\$\d+|\d+\s*(million|billion|thousand|mln|mld)|[\d,]+\s*(users|customers|results?|klientów|użytkowników))\b/i.test(
      bodyText
    );
  checks.push({
    id: "data_points",
    label: "Facts & Data Points in Text",
    status: hasDataPoints ? "pass" : "info",
    description: hasDataPoints
      ? "Numerical facts and data points found in text — AI engines can cite these directly."
      : "No clear data points found in text. Include statistics and facts in text (not just images) for AI citation.",
    impact: "low",
    value: hasDataPoints,
  });

  const score = computeScore(checks);

  return {
    score,
    maxScore: 100,
    checks,
    summary: buildSummary(score, wordCount, hasFaqSection, hasTldr, pageType),
  };
}

function computeScore(checks: AuditCheck[]): number {
  const weights: Record<string, number> = {
    h1_present: 12,
    heading_hierarchy: 12,
    tldr_summary: 18,   // ← increased — critical GEO signal
    faq_section: 18,    // ← increased — critical GEO signal
    lists_present: 8,
    content_length: 14,
    answer_patterns: 6,
    external_citations: 8,
    data_points: 4,
  };

  let earned = 0;
  let total = 0;

  for (const check of checks) {
    const w = weights[check.id] ?? 5;
    total += w;
    if (check.status === "pass") earned += w;
    else if (check.status === "warning") earned += w * 0.2;  // ← was 0.5 — now 0.2
    else if (check.status === "info") earned += w * 0.1;     // ← was 0.3 — now 0.1
    // fail = 0
  }

  return Math.round((earned / total) * 100);
}

function buildSummary(
  score: number,
  wordCount: number,
  hasFaq: boolean,
  hasTldr: boolean,
  pageType: PageType
): string {
  const typeLabel = pageType === "article" ? "article" : pageType === "product-listing" ? "category page" : "page";
  if (score >= 80)
    return `Content is well-structured for AI citation with good length, headings, and Q&A content.`;
  const missing: string[] = [];
  if (!hasTldr && !["product", "product-listing"].includes(pageType)) missing.push("TL;DR summary");
  if (!hasFaq) missing.push("FAQ section");
  if (wordCount < 300) missing.push("more content");
  if (missing.length > 0)
    return `Missing key GEO elements for this ${typeLabel}: ${missing.join(", ")}.`;
  return `Content structure score: ${score}/100. Improve heading hierarchy and add structured Q&A content.`;
}
