/**
 * Content Structure Module — v2 (iPullRank AI Search Manual aligned)
 *
 * Key upgrades based on iPullRank Chapters 7, 9, 10, 11:
 *  - Semantic chunking: one-idea-per-paragraph, self-contained blocks
 *  - Entity richness: named entities (brands, people, places, products)
 *  - Readability scoring: Flesch-Kincaid proxy for AI extractability
 *  - Semantic triples: subject-predicate-object clarity
 *  - Co-reference clarity: avoidance of ambiguous pronouns
 *  - Information gain: unique data points vs. generic statements
 *  - Topic clustering: internal link signals for topical authority
 *  - Passage optimization: query-answering headings
 */

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
  const fullHtml = $.html() ?? "";

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

  // ── 3. Query-answering headings (Passage Optimization — iPullRank Ch.10) ──
  // Headings should be descriptive questions or clear topic labels, not generic labels
  const headingTexts = $("h2, h3").toArray().map(el => $(el).text().trim());
  const questionHeadings = headingTexts.filter(t =>
    t.includes("?") ||
    /^(how|what|why|when|where|who|which|can|does|is|are|will|should|do|co|jak|dlaczego|kiedy|gdzie|czy|ile)\b/i.test(t)
  ).length;
  const descriptiveHeadings = headingTexts.filter(t => t.split(" ").length >= 3).length;
  const passageOptimized = headingTexts.length > 0 && (questionHeadings >= 1 || descriptiveHeadings >= Math.floor(headingTexts.length * 0.5));

  checks.push({
    id: "passage_optimization",
    label: "Passage-Optimized Headings",
    status: passageOptimized ? "pass" : headingTexts.length === 0 ? "fail" : "warning",
    description: passageOptimized
      ? `${questionHeadings} question-style heading${questionHeadings !== 1 ? "s" : ""} and ${descriptiveHeadings} descriptive heading${descriptiveHeadings !== 1 ? "s" : ""} detected — headings act as semantic units for AI passage retrieval.`
      : headingTexts.length === 0
      ? "No subheadings found. Add descriptive H2/H3 headings that directly answer user questions — each heading is a retrieval anchor for AI engines."
      : "Headings are too generic (e.g., 'Introduction', 'Section 1'). Use descriptive, query-answering headings like 'How to optimize product pages for AI search' — this is core to passage optimization.",
    impact: "high",
    value: `${questionHeadings} question headings, ${descriptiveHeadings} descriptive headings`,
  });

  // ── 4. TL;DR / Summary block ──────────────────────────────────────────────
  const tldrRelevant = !["product", "product-listing"].includes(pageType);
  const hasTldr =
    /\b(tl;?dr|summary|key\s+takeaways?|in\s+brief|quick\s+answer|overview|streszczenie|podsumowanie|kluczowe\s+informacje)\b/i.test(
      fullHtml
    );

  checks.push({
    id: "tldr_summary",
    label: "TL;DR / Summary Block",
    status: hasTldr
      ? "pass"
      : tldrRelevant
      ? "fail"
      : "warning",
    description: hasTldr
      ? "Summary or TL;DR section detected — AI engines can quote this directly."
      : tldrRelevant
      ? "No TL;DR or summary section found. This is a critical GEO gap — AI engines heavily quote page summaries. Add a 2–4 sentence summary at the top labeled 'TL;DR', 'Summary', or 'Key Takeaways'."
      : "No summary section found. Consider adding a short product description summary for AI citation.",
    impact: "high",
    value: hasTldr,
  });

  // ── 5. FAQ section ────────────────────────────────────────────────────────
  const faqKeywords =
    /\b(faq|frequently\s+asked|common\s+questions?|questions?\s+and\s+answers?|najczęściej\s+zadawane|pytania\s+i\s+odpowiedzi)\b/i;
  const hasFaqSection =
    faqKeywords.test(fullHtml) ||
    $("h2, h3")
      .toArray()
      .some((el) => faqKeywords.test($(el).text()));

  const faqRelevant = !["product-listing"].includes(pageType);
  checks.push({
    id: "faq_section",
    label: "FAQ Section",
    status: hasFaqSection
      ? "pass"
      : faqRelevant
      ? "fail"
      : "warning",
    description: hasFaqSection
      ? "FAQ section detected — great for AI answer inclusion."
      : faqRelevant
      ? "No FAQ section found. This is a major GEO gap — FAQ content is one of the most cited formats in AI-generated answers. Add 5–10 Q&A pairs about your page topic."
      : "No FAQ section found. Adding a FAQ to your category page can improve AI citation rates.",
    impact: "high",
    value: hasFaqSection,
  });

  // ── 6. Semantic Chunking (iPullRank Ch.9) ─────────────────────────────────
  // Each paragraph should be a self-contained idea (one concept per block)
  // Proxy: average paragraph length — very long paragraphs = poor chunking
  const paragraphs = $("p").toArray().map(el => $(el).text().trim()).filter(t => t.length > 50);
  const avgParaWords = paragraphs.length > 0
    ? paragraphs.reduce((sum, p) => sum + p.split(/\s+/).length, 0) / paragraphs.length
    : 0;
  const shortParaRatio = paragraphs.length > 0
    ? paragraphs.filter(p => p.split(/\s+/).length <= 80).length / paragraphs.length
    : 0;

  // Good chunking: avg para ≤ 80 words, at least 60% of paras are short
  const hasGoodChunking = paragraphs.length >= 3 && avgParaWords <= 80 && shortParaRatio >= 0.6;
  const chunking_status = paragraphs.length < 3
    ? "warning"
    : hasGoodChunking
    ? "pass"
    : avgParaWords > 150
    ? "fail"
    : "warning";

  checks.push({
    id: "semantic_chunking",
    label: "Semantic Chunking (Paragraph Structure)",
    status: chunking_status,
    description: paragraphs.length < 3
      ? "Too few paragraphs detected. Structure content into short, self-contained paragraphs — each expressing one complete idea for AI extraction."
      : hasGoodChunking
      ? `Good chunking: avg ${Math.round(avgParaWords)} words/paragraph, ${Math.round(shortParaRatio * 100)}% of paragraphs are concise. AI engines can extract individual paragraphs as answers.`
      : avgParaWords > 150
      ? `Paragraphs are too long (avg ${Math.round(avgParaWords)} words). Break long paragraphs into shorter, self-contained blocks — AI engines like Gemini and ChatGPT segment pages by paragraph and select one at a time for summarization.`
      : `Paragraph structure could be improved (avg ${Math.round(avgParaWords)} words). Aim for paragraphs of 40–80 words, each expressing a single complete idea.`,
    impact: "high",
    value: `${paragraphs.length} paragraphs, avg ${Math.round(avgParaWords)} words`,
  });

  // ── 7. Entity Richness (iPullRank Ch.9 — Named Entity Recognition) ────────
  // Named entities: brands, products, people, places, organizations
  // Proxy: capitalized proper nouns, brand names, specific product names
  const sentences = bodyText.split(/[.!?]+/).filter(s => s.trim().length > 20);
  const entityPatterns = [
    /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g,  // Multi-word proper nouns (e.g., "Google Search Console")
    /\b[A-Z]{2,}\b/g,                          // Acronyms (e.g., "SEO", "API", "FAQ")
    /\b[A-Z][a-z]+\s+(Inc\.|Ltd\.|GmbH|S\.A\.|sp\.\s*z\s*o\.o\.)\b/g,  // Company names
  ];

  let entityCount = 0;
  for (const pattern of entityPatterns) {
    const matches = bodyText.match(pattern) ?? [];
    entityCount += new Set(matches).size;
  }

  // Also count specific numeric facts as entity-like signals
  const numericFacts = (bodyText.match(/\b\d+(?:[.,]\d+)?(?:\s*%|\s*zł|\s*PLN|\s*USD|\s*EUR|\s*kg|\s*km|\s*m²|\s*ms|\s*s)\b/g) ?? []).length;
  const totalEntitySignals = entityCount + numericFacts;

  checks.push({
    id: "entity_richness",
    label: "Entity Richness (Named Entities & Facts)",
    status: totalEntitySignals >= 15 ? "pass" : totalEntitySignals >= 5 ? "warning" : "fail",
    description: totalEntitySignals >= 15
      ? `Rich entity density: ~${totalEntitySignals} named entities and specific facts detected. AI engines use named entities to build semantic embeddings and knowledge graph connections.`
      : totalEntitySignals >= 5
      ? `Moderate entity density: ~${totalEntitySignals} named entities detected. Increase specificity — instead of "this tool", say "Google Search Console". Instead of "most users", say "73% of users".`
      : `Low entity density: very few named entities or specific facts found. Content is too generic. Name specific brands, products, people, and places. Include specific statistics with numbers. AI models resolve meaning through named entities — vague content gets poor embeddings.`,
    impact: "high",
    value: totalEntitySignals,
  });

  // ── 8. Readability Score Proxy (iPullRank Ch.9 — Flesch-Kincaid) ──────────
  // Proxy: average sentence length (shorter = more readable = better for AI)
  const avgSentenceWords = sentences.length > 0
    ? sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0) / sentences.length
    : 0;

  // Flesch-Kincaid proxy: avg sentence length
  // < 15 words: excellent (grade 6-8, highly readable)
  // 15-20 words: good (grade 9-12)
  // 20-25 words: fair (college level)
  // > 25 words: poor (graduate level, hard for AI to chunk)
  const readability_status = avgSentenceWords <= 20 ? "pass" : avgSentenceWords <= 28 ? "warning" : "fail";

  checks.push({
    id: "readability",
    label: "Readability (Sentence Complexity)",
    status: readability_status,
    description: avgSentenceWords <= 20
      ? `Good readability: avg ${Math.round(avgSentenceWords)} words/sentence. Short, clear sentences improve AI extraction accuracy and Flesch-Kincaid score.`
      : avgSentenceWords <= 28
      ? `Moderate readability: avg ${Math.round(avgSentenceWords)} words/sentence. Aim for sentences under 20 words. Long sentences reduce AI extraction accuracy and readability scores.`
      : `Poor readability: avg ${Math.round(avgSentenceWords)} words/sentence. Sentences are too complex for optimal AI processing. Break long sentences into shorter, direct statements. AI performs better with simple, readable language (Flesch-Kincaid Grade 6-8).`,
    impact: "medium",
    value: `avg ${Math.round(avgSentenceWords)} words/sentence`,
  });

  // ── 9. Semantic Triples (iPullRank Ch.9) ──────────────────────────────────
  // Subject-predicate-object statements: "X is Y", "X does Y", "X was created by Y"
  // These are the building blocks of knowledge graphs
  const triplePatterns = [
    /\b\w+\s+(is|are|was|were|has|have|had|does|do|did|can|will|should|means?|refers?\s+to|is\s+defined\s+as|consists?\s+of|includes?|contains?|provides?|offers?|enables?|allows?|supports?|requires?)\s+\w+/gi,
    // Polish patterns
    /\b\w+\s+(jest|są|był|była|było|byli|były|ma|mają|miał|miała|oznacza|definiuje|zawiera|obejmuje|umożliwia|pozwala|wymaga)\s+\w+/gi,
  ];

  let tripleCount = 0;
  for (const pattern of triplePatterns) {
    tripleCount += (bodyText.match(pattern) ?? []).length;
  }

  // Normalize by word count (per 100 words)
  const triplesPerHundredWords = wordCount > 0 ? (tripleCount / wordCount) * 100 : 0;

  checks.push({
    id: "semantic_triples",
    label: "Semantic Triple Density",
    status: triplesPerHundredWords >= 3 ? "pass" : triplesPerHundredWords >= 1.5 ? "warning" : "fail",
    description: triplesPerHundredWords >= 3
      ? `Good semantic triple density (${Math.round(triplesPerHundredWords)} per 100 words). Clear subject-predicate-object statements help AI engines build knowledge graph connections from your content.`
      : triplesPerHundredWords >= 1.5
      ? `Moderate semantic triple density. Write more clear, direct statements: 'Schema markup improves content discoverability', 'ChatGPT was created by OpenAI'. These subject-predicate-object patterns are the building blocks of knowledge graphs.`
      : `Low semantic triple density. Content lacks clear factual statements. Write in subject-predicate-object format: 'Paris is located in France', 'FAQPage schema improves AI citation rates'. Avoid vague phrases like 'this can help' — say exactly what helps and how.`,
    impact: "medium",
    value: `${Math.round(triplesPerHundredWords)} triples/100 words`,
  });

  // ── 10. Co-reference Clarity (iPullRank Ch.9) ─────────────────────────────
  // Avoid ambiguous pronouns without clear referents — "this", "it", "they" without context
  // Proxy: ratio of ambiguous pronouns to total words
  const ambiguousPronouns = (bodyText.match(/\b(this|that|it|they|them|these|those|he|she|its|their)\b/gi) ?? []).length;
  const pronounRatio = wordCount > 0 ? (ambiguousPronouns / wordCount) * 100 : 0;

  // Also check for specific noun usage (good signal)
  const specificNouns = (bodyText.match(/\b(Google|ChatGPT|Perplexity|Gemini|Claude|OpenAI|schema|FAQ|SEO|GEO|AI|LLM|HTML|JSON-LD)\b/g) ?? []).length;

  checks.push({
    id: "coreference_clarity",
    label: "Co-reference Clarity",
    status: pronounRatio <= 3 ? "pass" : pronounRatio <= 6 ? "warning" : "fail",
    description: pronounRatio <= 3
      ? `Good co-reference clarity: low ambiguous pronoun usage (${Math.round(pronounRatio)}% of words). Specific nouns are used consistently — AI engines can resolve entity references accurately.`
      : pronounRatio <= 6
      ? `Moderate pronoun usage (${Math.round(pronounRatio)}% of words). Replace ambiguous pronouns like 'it', 'this', 'they' with specific nouns. Instead of 'it improves visibility', say 'schema markup improves visibility in AI search results'.`
      : `High ambiguous pronoun usage (${Math.round(pronounRatio)}% of words). This significantly reduces AI extraction accuracy. Each sentence should work independently — restate key terms instead of using 'this', 'it', 'they'. AI co-reference resolution fails when pronouns lack clear referents.`,
    impact: "medium",
    value: `${Math.round(pronounRatio)}% pronoun ratio`,
  });

  // ── 11. Lists (ul/ol) ──────────────────────────────────────────────────────
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

  // ── 12. Content length ─────────────────────────────────────────────────────
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

  // ── 13. Information Gain (iPullRank Ch.11) ─────────────────────────────────
  // Unique, non-generic content: original research, proprietary data, specific insights
  // Proxy: presence of unique data signals — statistics, dates, named studies, original claims
  const hasOriginalData =
    /\b(according\s+to\s+our|our\s+(research|study|data|analysis|survey)|we\s+(found|discovered|analyzed|tested|measured)|proprietary|original\s+research|case\s+study|our\s+clients?|nasza\s+(analiza|badanie|dane)|według\s+naszych|własne\s+badania)\b/i.test(bodyText);

  const hasSpecificStats =
    /\b(\d+(?:[.,]\d+)?%|\$\d+|\d+\s*(million|billion|thousand|mln|mld|tys\.?)|\d+(?:[.,]\d+)?\s*(x|times|razy|fold))\b/i.test(bodyText);

  const hasDateContext =
    /\b(as\s+of\s+(january|february|march|april|may|june|july|august|september|october|november|december|q[1-4]|\d{4})|in\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}|updated?\s+(in\s+)?\d{4}|stan\s+na|zaktualizowano|od\s+(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia))\b/i.test(bodyText);

  const informationGainScore = [hasOriginalData, hasSpecificStats, hasDateContext].filter(Boolean).length;

  checks.push({
    id: "information_gain",
    label: "Information Gain (Unique Data)",
    status: informationGainScore >= 2 ? "pass" : informationGainScore === 1 ? "warning" : "fail",
    description: informationGainScore >= 2
      ? `Strong information gain signals: original data, specific statistics, and/or date context detected. LLMs seek salient, distinctive, non-generic content — redundant or boilerplate content is filtered out.`
      : informationGainScore === 1
      ? `Partial information gain: some unique signals found but content could be more distinctive. Add original research, proprietary data, or specific statistics with dates (e.g., 'as of Q1 2025, 73% of users...').`
      : `Low information gain: content appears generic. LLMs prioritize content that only you can publish — personal insights, original research, expert opinions, proprietary data. Generic content that mirrors thousands of other pages gets filtered out of AI answers.`,
    impact: "high",
    value: `${informationGainScore}/3 signals`,
  });

  // ── 14. Answer-pattern detection ───────────────────────────────────────────
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

  // ── 15. External citations / outbound links ────────────────────────────────
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

  // ── 16. Data points in text ────────────────────────────────────────────────
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
  // Updated weights based on iPullRank research priority
  const weights: Record<string, number> = {
    h1_present: 8,
    heading_hierarchy: 8,
    passage_optimization: 10,  // NEW — iPullRank Ch.10 core concept
    tldr_summary: 12,
    faq_section: 12,
    semantic_chunking: 10,      // NEW — iPullRank Ch.9 core concept
    entity_richness: 8,         // NEW — iPullRank Ch.9 NER
    readability: 5,             // NEW — iPullRank Ch.9 Flesch-Kincaid
    semantic_triples: 5,        // NEW — iPullRank Ch.9
    coreference_clarity: 4,     // NEW — iPullRank Ch.9
    lists_present: 5,
    content_length: 8,
    information_gain: 8,        // NEW — iPullRank Ch.11
    answer_patterns: 4,
    external_citations: 6,
    data_points: 3,
  };

  let earned = 0;
  let total = 0;

  for (const check of checks) {
    const w = weights[check.id] ?? 5;
    total += w;
    if (check.status === "pass") earned += w;
    else if (check.status === "warning") earned += w * 0.2;
    else if (check.status === "info") earned += w * 0.1;
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
    return `Content is well-structured for AI citation with good semantic chunking, entity richness, and Q&A content.`;
  const missing: string[] = [];
  if (!hasTldr && !["product", "product-listing"].includes(pageType)) missing.push("TL;DR summary");
  if (!hasFaq) missing.push("FAQ section");
  if (wordCount < 300) missing.push("more content");
  if (missing.length > 0)
    return `Missing key GEO elements for this ${typeLabel}: ${missing.join(", ")}.`;
  return `Content structure score: ${score}/100. Focus on semantic chunking, entity richness, and passage optimization.`;
}
