import type { ScrapedPage } from "./scraper";
import type { AuditCheck, CategoryResult } from "./types";

export function analyzeContentStructure(page: ScrapedPage): CategoryResult {
  const checks: AuditCheck[] = [];
  const $ = page.$;

  // Remove script/style/nav/footer noise
  $("script, style, nav, footer, header, aside, noscript").remove();
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = bodyText.split(/\s+/).filter(Boolean).length;

  // 1. H1 present
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

  // 2. Heading hierarchy
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
      : `Only ${h2Count} H2 heading${h2Count > 1 ? "s" : ""}. Add more H2 sections to improve scannability.`,
    impact: "high",
    value: `H1:${h1Count}, H2:${h2Count}, H3:${h3Count}`,
  });

  // 3. TL;DR / Summary block
  const fullHtml = $.html() ?? "";
  const hasTldr =
    /\b(tl;?dr|summary|key\s+takeaways?|in\s+brief|quick\s+answer|overview)\b/i.test(
      fullHtml
    );
  checks.push({
    id: "tldr_summary",
    label: "TL;DR / Summary Block",
    status: hasTldr ? "pass" : "warning",
    description: hasTldr
      ? "Summary or TL;DR section detected — AI engines can quote this directly."
      : "No TL;DR or summary section found. Adding a short summary at the top dramatically increases AI citation rates.",
    impact: "high",
    value: hasTldr,
  });

  // 4. FAQ section
  const faqKeywords =
    /\b(faq|frequently\s+asked|common\s+questions?|questions?\s+and\s+answers?)\b/i;
  const hasFaqSection =
    faqKeywords.test(fullHtml) ||
    $("h2, h3")
      .toArray()
      .some((el) => faqKeywords.test($(el).text()));
  checks.push({
    id: "faq_section",
    label: "FAQ Section",
    status: hasFaqSection ? "pass" : "warning",
    description: hasFaqSection
      ? "FAQ section detected — great for AI answer inclusion."
      : "No FAQ section found. Adding a FAQ section with Q&A pairs is one of the most effective GEO tactics.",
    impact: "high",
    value: hasFaqSection,
  });

  // 5. Lists (ul/ol)
  const listCount = $("ul, ol").length;
  const hasLists = listCount >= 2;
  checks.push({
    id: "lists_present",
    label: "Lists & Structured Content",
    status: hasLists ? "pass" : listCount === 1 ? "warning" : "fail",
    description: hasLists
      ? `${listCount} list elements found — structured content is preferred by AI engines.`
      : listCount === 1
      ? "Only 1 list found. Use more bullet/numbered lists to make content scannable."
      : "No lists found. AI engines prefer structured content with bullet points and numbered steps.",
    impact: "medium",
    value: listCount,
  });

  // 6. Content length
  const goodLength = wordCount >= 300;
  const richLength = wordCount >= 800;
  checks.push({
    id: "content_length",
    label: "Adequate Content Length",
    status: richLength ? "pass" : goodLength ? "warning" : "fail",
    description: richLength
      ? `${wordCount} words — rich content length, good for AI citation.`
      : goodLength
      ? `${wordCount} words — adequate but consider expanding to 800+ words for better AI coverage.`
      : `${wordCount} words — thin content. AI engines prefer pages with at least 300 words.`,
    impact: "high",
    value: wordCount,
  });

  // 7. Definition / explanation patterns
  const hasDefinitions =
    /\b(is\s+defined\s+as|refers?\s+to|means?\s+that|in\s+other\s+words|for\s+example)\b/i.test(
      bodyText
    );
  checks.push({
    id: "definitions",
    label: "Definitions & Explanations",
    status: hasDefinitions ? "pass" : "info",
    description: hasDefinitions
      ? "Definitional language detected — AI engines love quotable definitions."
      : "Consider adding clear definitions and explanations for key terms to improve citation potential.",
    impact: "medium",
    value: hasDefinitions,
  });

  // 8. Key facts in text (not just images)
  const hasDataPoints =
    /\b(\d+%|\$\d+|\d+\s*(million|billion|thousand)|[\d,]+\s*(users|customers|results?))\b/i.test(
      bodyText
    );
  checks.push({
    id: "data_points",
    label: "Facts & Data Points in Text",
    status: hasDataPoints ? "pass" : "info",
    description: hasDataPoints
      ? "Numerical facts and data points found in text — AI engines can cite these directly."
      : "No clear data points found in text. Include statistics and facts in text (not just images) for AI citation.",
    impact: "medium",
    value: hasDataPoints,
  });

  // 9. Paragraph structure
  const paragraphs = $("p").length;
  const hasGoodParagraphs = paragraphs >= 3;
  checks.push({
    id: "paragraph_structure",
    label: "Paragraph Structure",
    status: hasGoodParagraphs ? "pass" : "warning",
    description: hasGoodParagraphs
      ? `${paragraphs} paragraphs found — good content structure.`
      : `Only ${paragraphs} paragraph${paragraphs !== 1 ? "s" : ""} found. Use proper paragraph structure for readability.`,
    impact: "low",
    value: paragraphs,
  });

  const score = computeScore(checks);

  return {
    score,
    maxScore: 100,
    checks,
    summary: buildSummary(score, wordCount, hasFaqSection, hasTldr),
  };
}

function computeScore(checks: AuditCheck[]): number {
  const weights: Record<string, number> = {
    h1_present: 15,
    heading_hierarchy: 15,
    tldr_summary: 15,
    faq_section: 15,
    lists_present: 10,
    content_length: 15,
    definitions: 5,
    data_points: 5,
    paragraph_structure: 5,
  };

  let earned = 0;
  let total = 0;

  for (const check of checks) {
    const w = weights[check.id] ?? 5;
    total += w;
    if (check.status === "pass") earned += w;
    else if (check.status === "warning") earned += w * 0.5;
    else if (check.status === "info") earned += w * 0.3;
  }

  return Math.round((earned / total) * 100);
}

function buildSummary(
  score: number,
  wordCount: number,
  hasFaq: boolean,
  hasTldr: boolean
): string {
  if (score >= 80)
    return "Content is well-structured for AI citation with good length, headings, and Q&A content.";
  const missing = [];
  if (!hasTldr) missing.push("TL;DR summary");
  if (!hasFaq) missing.push("FAQ section");
  if (wordCount < 300) missing.push("more content");
  if (missing.length > 0)
    return `Missing key citation elements: ${missing.join(", ")}.`;
  return `Content structure score: ${score}/100. Improve heading hierarchy and add structured Q&A content.`;
}
