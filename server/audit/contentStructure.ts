/**
 * Content Structure Module — v4 (Expert Simulation: King / Yeşilyurt / Petrovic)
 *
 * Algorithm upgrades in this version:
 *
 * 1. ENTITY RICHNESS (weight 8→15): Real NER via WikiData Knowledge Graph.
 *    Hybrid: regex candidates → Wikidata batch validation → QID anchors.
 *    Continuous score: 0–100 based on confirmed KG entities + unconfirmed + numeric facts.
 *
 * 2. CONTINUOUS SCORING (all checks): Every check returns a `score: 0–100` field
 *    alongside the existing `status`. The computeScore() function uses `check.score`
 *    when present, falling back to status-derived values for backward compatibility.
 *
 * 3. INTELLIGENT CONTENT LENGTH (replaces naive word-count reward):
 *    Rewards information density at optimal length (600–1200 words).
 *    Applies a "dilution penalty" for pages >3000 words without proportional density.
 *    Score is continuous, not binary pass/fail.
 *
 * 4. FRESHNESS DECAY (weight 10%→15% in CI; here: context-aware in content checks):
 *    Page-type-aware: articles need recent dates, product/evergreen pages do not.
 *    Time-based decay curve: <30d=100, 30-90d=85, 90-180d=70, 180-365d=50, >365d=25.
 *    Integrated into information_gain check for date context signals.
 */

import * as cheerio from "cheerio";
import type { ScrapedPage } from "./scraper";
import type { PageType } from "./pageTypeDetector";
import type { AuditCheck, CategoryResult } from "./types";
import { recognizeEntities } from "./entityRecognizer";

// ─── Continuous Score Helpers ─────────────────────────────────────────────────

/**
 * Clamp a value to [0, 100] and round to integer.
 */
function clamp100(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

/**
 * Derive a CheckStatus from a continuous score.
 * Thresholds: ≥70 = pass, 40–69 = warning, <40 = fail.
 * Special case: "info" is never derived — use explicitly when needed.
 */
function scoreToStatus(score: number): AuditCheck["status"] {
  if (score >= 70) return "pass";
  if (score >= 40) return "warning";
  return "fail";
}

// ─── Freshness Decay Curve ────────────────────────────────────────────────────

/**
 * Calculate a freshness score (0–100) based on content age in days.
 * Curve designed by Metehan Yeşilyurt's CiteMET method:
 *   0–30 days:   100 (fresh)
 *   31–90 days:  85  (recent)
 *   91–180 days: 70  (acceptable)
 *   181–365 days: 50 (aging)
 *   >365 days:   25  (stale)
 *
 * For evergreen page types (product, product-listing, homepage) the decay
 * is much slower — these pages are not expected to be updated frequently.
 */
function freshnessDecayScore(ageInDays: number, isTimeSensitive: boolean): number {
  if (!isTimeSensitive) {
    // Evergreen: very slow decay — only penalise if >2 years old
    if (ageInDays <= 730) return 80;
    if (ageInDays <= 1095) return 60;
    return 40;
  }
  // Time-sensitive: Metehan's CiteMET decay curve
  if (ageInDays <= 30) return 100;
  if (ageInDays <= 90) return 85;
  if (ageInDays <= 180) return 70;
  if (ageInDays <= 365) return 50;
  return 25;
}

/**
 * Extract the most recent date from a text body.
 * Returns age in days, or null if no date found.
 */
function extractContentAgeDays(text: string): number | null {
  const now = Date.now();
  const currentYear = new Date().getFullYear();

  // Pattern: explicit year references in context (e.g. "as of 2024", "updated in 2025")
  const yearPatterns = [
    /\b(202[0-9])\b/g,  // years 2020-2029
    /\b(201[5-9])\b/g,  // years 2015-2019
  ];

  let mostRecentYear: number | null = null;
  for (const pattern of yearPatterns) {
    const matches = Array.from(text.matchAll(pattern));
    for (const m of matches) {
      const year = parseInt(m[1], 10);
      if (year <= currentYear && (mostRecentYear === null || year > mostRecentYear)) {
        mostRecentYear = year;
      }
    }
  }

  if (mostRecentYear !== null) {
    // Approximate: assume mid-year (July 1) for year-only references
    const approxDate = new Date(mostRecentYear, 6, 1).getTime();
    return Math.round((now - approxDate) / (1000 * 60 * 60 * 24));
  }

  return null;
}

// ─── Information Density Score ────────────────────────────────────────────────

/**
 * Calculate information density: unique facts per 100 words.
 * Used for the intelligent content length check (Dan Petrovic's Grounding Budget).
 *
 * Signals counted:
 *   - Numeric facts (statistics, measurements, percentages)
 *   - Named entities (proper nouns, brands, people)
 *   - Definitional sentences (X is Y patterns)
 *   - External link anchors (citations)
 */
export function computeInformationDensityScore(
  text: string,
  wordCount: number,
  numericFacts = 0,
  entityCount = 0
): number {
  return calculateInfoDensity(text, wordCount, numericFacts, entityCount);
}

function calculateInfoDensity(
  text: string,
  wordCount: number,
  numericFacts: number,
  entityCount: number
): number {
  if (wordCount === 0) return 0;

  // Count definitional sentences
  const definitionalSentences = (text.match(
    /\b\w[\w\s]{1,30}\s+(is|are|was|were|means?|refers?\s+to|is\s+defined\s+as|jest|są|oznacza)\s+.{10,}/gi
  ) ?? []).length;

  const totalFactSignals = numericFacts + Math.floor(entityCount * 0.5) + definitionalSentences;
  const densityPer100 = (totalFactSignals / wordCount) * 100;

  // Normalise: 3+ facts per 100 words = 100/100, 0 = 0/100
  return clamp100(Math.round((densityPer100 / 3) * 100));
}

// ─── Main Analyzer ────────────────────────────────────────────────────────────

export async function analyzeContentStructure(
  page: ScrapedPage,
  pageType: PageType = "generic"
): Promise<CategoryResult> {
  const checks: AuditCheck[] = [];

  // IMPORTANT: Use a fresh cheerio instance — NEVER mutate page.$.
  const $raw = page.$;
  const $ = cheerio.load(page.html);

  const h1Count = $raw("h1").length;
  const h2Count = $raw("h2").length;
  const h3Count = $raw("h3").length;

  $("script, style, nav, footer, header, aside, noscript").remove();
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = bodyText.split(/\s+/).filter(Boolean).length;
  const fullHtml = $.html() ?? "";

  // ── 1. H1 present ─────────────────────────────────────────────────────────
  const h1Score = h1Count === 1 ? 100 : h1Count === 0 ? 0 : 40;
  checks.push({
    id: "h1_present",
    label: "Nagłówek H1 obecny",
    status: h1Count === 1 ? "pass" : h1Count === 0 ? "fail" : "warning",
    score: h1Score,
    description:
      h1Count === 1
        ? `Znaleziono H1: "${$("h1").first().text().trim().slice(0, 80)}"`
        : h1Count === 0
        ? "Brak nagłówka H1. Każda strona potrzebuje dokładnie jednego H1, aby silniki AI mogły zidentyfikować główny temat."
        : `Znaleziono ${h1Count} nagłówków H1. Użyj dokładnie jednego H1 na stronę.`,
    impact: "high",
    value: h1Count,
  });

  // ── 2. Heading hierarchy — informational ──────────────────────────────────
  const headingStructure = `H1:${h1Count}, H2:${h2Count}, H3:${h3Count}`;
  checks.push({
    id: "heading_hierarchy",
    label: "Struktura nagłówków (informacyjnie)",
    status: "info",
    score: 50, // neutral — advisory only
    description: h1Count >= 1 && h2Count >= 2
      ? `Struktura nagłówków: ${headingStructure} — dobrze zorganizowana dla użytkowników i scannerów AI.`
      : h2Count === 0
      ? `Struktura nagłówków: ${headingStructure}. Rozważ dodanie podnagłówków H2.`
      : `Struktura nagłówków: ${headingStructure}. Dodanie więcej nagłówków H2/H3 może poprawić skanowalność.`,
    impact: "low",
    value: headingStructure,
  });

  // ── 3. Query-answering headings ────────────────────────────────────────────
  const headingTexts = $("h2, h3").toArray().map(el => $(el).text().trim());
  const questionHeadings = headingTexts.filter(t =>
    t.includes("?") ||
    /^(how|what|why|when|where|who|which|can|does|is|are|will|should|do|co|jak|dlaczego|kiedy|gdzie|czy|ile)\b/i.test(t)
  ).length;
  const descriptiveHeadings = headingTexts.filter(t => t.split(" ").length >= 3).length;
  const passageOptimized = headingTexts.length > 0 && (questionHeadings >= 1 || descriptiveHeadings >= Math.floor(headingTexts.length * 0.5));

  // Continuous: score based on ratio of question + descriptive headings
  let passageScore = 0;
  if (headingTexts.length > 0) {
    const qualityRatio = (questionHeadings * 2 + descriptiveHeadings) / (headingTexts.length * 2);
    passageScore = clamp100(Math.round(qualityRatio * 100));
  }

  checks.push({
    id: "passage_optimization",
    label: "Nagłówki zoptymalizowane pod fragmenty",
    status: passageOptimized ? "pass" : headingTexts.length === 0 ? "fail" : "warning",
    score: headingTexts.length === 0 ? 0 : passageScore,
    description: passageOptimized
      ? `Wykryto ${questionHeadings} nagłówków w formie pytań i ${descriptiveHeadings} opisowych — nagłówki pełnią rolę jednostek semantycznych.`
      : headingTexts.length === 0
      ? "Brak podnagłówków. Dodaj opisowe nagłówki H2/H3, które bezpośrednio odpowiadają na pytania użytkowników."
      : "Nagłówki są zbyt ogólne. Użyj opisowych nagłówków odpowiadających na zapytania.",
    impact: "high",
    value: `${questionHeadings} question headings, ${descriptiveHeadings} descriptive headings`,
  });

  // ── 4. TL;DR / Summary block ───────────────────────────────────────────────
  const tldrRelevant = !["product", "product-listing"].includes(pageType);
  const hasTldr =
    /\b(tl;?dr|summary|key\s+takeaways?|in\s+brief|quick\s+answer|overview|streszczenie|podsumowanie|kluczowe\s+informacje)\b/i.test(fullHtml);

  checks.push({
    id: "tldr_summary",
    label: "Blok TL;DR / Podsumowanie",
    status: hasTldr ? "pass" : tldrRelevant ? "fail" : "warning",
    score: hasTldr ? 100 : tldrRelevant ? 0 : 30,
    description: hasTldr
      ? "Wykryto sekcję podsumowania lub TL;DR — silniki AI mogą cytować ją bezpośrednio."
      : tldrRelevant
      ? "Brak sekcji TL;DR lub podsumowania. To krytyczna luka GEO — dodaj 2–4 zdania podsumowania na górze strony."
      : "Brak sekcji podsumowania. Rozważ dodanie krótkiego opisu produktu do cytowania przez AI.",
    impact: "high",
    value: hasTldr,
  });

  // ── 5. FAQ section ─────────────────────────────────────────────────────────
  const faqKeywords =
    /\b(faq|frequently\s+asked|common\s+questions?|questions?\s+and\s+answers?|najczęściej\s+zadawane|pytania\s+i\s+odpowiedzi)\b/i;
  const hasFaqSection =
    faqKeywords.test(fullHtml) ||
    $("h2, h3").toArray().some((el) => faqKeywords.test($(el).text()));

  const faqRelevant = !["product-listing"].includes(pageType);
  checks.push({
    id: "faq_section",
    label: "Sekcja FAQ",
    status: hasFaqSection ? "pass" : faqRelevant ? "fail" : "warning",
    score: hasFaqSection ? 100 : faqRelevant ? 0 : 30,
    description: hasFaqSection
      ? "Wykryto sekcję FAQ — świetne dla inkluzji odpowiedzi AI."
      : faqRelevant
      ? "Brak sekcji FAQ. To poważna luka GEO — treści FAQ to jeden z najczęściej cytowanych formatów w odpowiedziach AI."
      : "Brak sekcji FAQ. Dodanie FAQ może poprawić wskaźniki cytowania przez AI.",
    impact: "high",
    value: hasFaqSection,
  });

  // ── 6. Semantic Chunking ───────────────────────────────────────────────────
  const paragraphs = $("p").toArray().map(el => $(el).text().trim()).filter(t => t.length > 50);
  const avgParaWords = paragraphs.length > 0
    ? paragraphs.reduce((sum, p) => sum + p.split(/\s+/).length, 0) / paragraphs.length
    : 0;
  const shortParaRatio = paragraphs.length > 0
    ? paragraphs.filter(p => p.split(/\s+/).length <= 80).length / paragraphs.length
    : 0;

  // Continuous score: optimal avg = 50 words, penalty for <3 paras or >150 avg
  let chunkingScore = 0;
  if (paragraphs.length >= 3) {
    // Score based on how close avg is to ideal 50 words, and short para ratio
    const avgScore = avgParaWords <= 80
      ? clamp100(100 - Math.max(0, avgParaWords - 50) * 1.5)
      : clamp100(100 - (avgParaWords - 80) * 2);
    chunkingScore = clamp100(Math.round(avgScore * 0.6 + shortParaRatio * 100 * 0.4));
  } else {
    chunkingScore = paragraphs.length === 0 ? 0 : 20;
  }

  checks.push({
    id: "semantic_chunking",
    label: "Chunking semantyczny (struktura akapitów)",
    status: scoreToStatus(chunkingScore),
    score: chunkingScore,
    description: paragraphs.length < 3
      ? "Wykryto zbyt mało akapitów. Podziel treść na krótkie, samodzielne akapity — każdy wyrażający jedną pełną myśl."
      : chunkingScore >= 70
      ? `Dobry chunking: średn. ${Math.round(avgParaWords)} słów/akapit, ${Math.round(shortParaRatio * 100)}% akapitów jest zwięzłych.`
      : avgParaWords > 150
      ? `Akapity są za długie (średn. ${Math.round(avgParaWords)} słów). Podziel na krótsze bloki 40–80 słów.`
      : `Struktura akapitów wymaga poprawy (średn. ${Math.round(avgParaWords)} słów). Celuj w akapity 40–80 słów.`,
    impact: "high",
    value: `${paragraphs.length} paragraphs, avg ${Math.round(avgParaWords)} words`,
  });

  // ── 7. Entity Richness — WikiData NER (UPGRADED) ───────────────────────────
  // Detect page language for Wikidata lookup
  const langMatch = page.html.match(/<html[^>]+lang=["']([a-zA-Z-]+)["']/i);
  const pageLanguage = langMatch ? langMatch[1].toLowerCase().split("-")[0] : "en";

  // Run entity recognition (async, with Wikidata)
  const entityResult = await recognizeEntities(bodyText, pageLanguage);

  // Continuous entity richness score:
  //   - Each confirmed KG entity (Wikidata QID): 5 points (max 50 from confirmed)
  //   - Each unconfirmed entity: 2 points (max 20 from unconfirmed)
  //   - Each numeric fact: 1.5 points (max 15 from numeric)
  //   - Bonus: 10 points if ≥3 different entity types (person + org + product)
  const confirmedScore = Math.min(50, entityResult.confirmedEntities.length * 5);
  const unconfirmedScore = Math.min(20, entityResult.unconfirmedEntities.length * 2);
  const numericScore = Math.min(15, entityResult.numericFactsCount * 1.5);

  const entityTypeSet = new Set(entityResult.confirmedEntities.map(e => e.entityType));
  const diversityBonus = entityTypeSet.size >= 3 ? 10 : entityTypeSet.size >= 2 ? 5 : 0;

  const entityRichnessScore = clamp100(Math.round(confirmedScore + unconfirmedScore + numericScore + diversityBonus));

  // Build description with KG anchor info
  const kgAnchorCount = entityResult.knowledgeGraphAnchors;
  const totalSignals = entityResult.totalEntitySignals;
  const topConfirmed = entityResult.confirmedEntities.slice(0, 5).map(e => e.label ?? e.surfaceForm);

  let entityDesc: string;
  if (entityRichnessScore >= 70) {
    entityDesc = `Bogata gęstość encji: ${kgAnchorCount} encji potwierdzonych w Knowledge Graph (WikiData)${topConfirmed.length > 0 ? ` (${topConfirmed.join(", ")})` : ""}, ${entityResult.numericFactsCount} faktów liczbowych. Silniki AI używają encji KG jako "kotwic" semantycznych.`;
  } else if (entityRichnessScore >= 40) {
    entityDesc = `Umiarkowana gęstość encji: ${kgAnchorCount} encji w Knowledge Graph, ${totalSignals} sygnałów łącznie. Zwiększ szczegółowość — zamiast "to narzędzie" napisz "Google Search Console". Zamiast "większość użytkowników" napisz "73% użytkowników".`;
  } else {
    entityDesc = `Niska gęstość encji: tylko ${kgAnchorCount} encji potwierdzonych w Knowledge Graph${entityResult.wikidataAvailable ? "" : " (WikiData niedostępna — wynik szacowany)"}. Treść jest zbyt ogólna. Nazywaj konkretne marki, produkty, osoby i miejsca. Modele AI rozumieją znaczenie przez encje — niejasna treść otrzymuje słabe osadzenia.`;
  }

  checks.push({
    id: "entity_richness",
    label: "Bogactwo encji (Knowledge Graph)",
    status: scoreToStatus(entityRichnessScore),
    score: entityRichnessScore,
    description: entityDesc,
    impact: "high",
    value: `${kgAnchorCount} KG anchors, ${totalSignals} total signals`,
  });

  // ── 8. Readability Score ───────────────────────────────────────────────────
  const sentences = bodyText.split(/[.!?]+/).filter(s => s.trim().length > 20);
  const avgSentenceWords = sentences.length > 0
    ? sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0) / sentences.length
    : 0;

  // Continuous: optimal avg = 15 words, penalty starts at 20, severe at 30+
  let readabilityScore: number;
  if (avgSentenceWords <= 15) readabilityScore = 100;
  else if (avgSentenceWords <= 20) readabilityScore = clamp100(100 - (avgSentenceWords - 15) * 4);
  else if (avgSentenceWords <= 28) readabilityScore = clamp100(80 - (avgSentenceWords - 20) * 5);
  else readabilityScore = clamp100(40 - (avgSentenceWords - 28) * 3);

  checks.push({
    id: "readability",
    label: "Czytelność (złożoność zdań)",
    status: scoreToStatus(readabilityScore),
    score: readabilityScore,
    description: readabilityScore >= 70
      ? `Dobra czytelność: średn. ${Math.round(avgSentenceWords)} słów/zdanie. Krótkie, jasne zdania poprawiają dokładność ekstrakcji AI.`
      : readabilityScore >= 40
      ? `Umiarkowana czytelność: średn. ${Math.round(avgSentenceWords)} słów/zdanie. Celuj w zdania do 20 słów.`
      : `Słaba czytelność: średn. ${Math.round(avgSentenceWords)} słów/zdanie. Zdania są zbyt złożone. Podziel na krótsze, bezpośrednie stwierdzenia.`,
    impact: "medium",
    value: `avg ${Math.round(avgSentenceWords)} words/sentence`,
  });

  // ── 9. Semantic Triples (SPO density) ─────────────────────────────────────
  const spoSentences = sentences.filter(sentence => {
    const s = sentence.trim();
    if (s.split(/\s+/).length < 4) return false;
    const definitional =
      /\b(\w[\w\s]{1,30})\s+(is|are|was|were|means?|refers?\s+to|is\s+defined\s+as|consists?\s+of|jest|są|oznacza|definiuje\s+się)\s+.{5,}/i.test(s);
    if (definitional) return true;
    const strongPredicate =
      /\b(\w+)\s+(provides?|offers?|enables?|allows?|supports?|requires?|includes?|contains?|produces?|creates?|improves?|increases?|reduces?|helps?|causes?|affects?|determines?|influences?|generates?|delivers?|ensures?|prevents?|describes?|explains?|represents?|indicates?|demonstrates?|shows?|proves?|confirms?)\s+\w+/i.test(s) ||
      /\b(\w+)\s+(zapewnia|oferuje|umożliwia|pozwala|wspiera|wymaga|zawiera|produkuje|tworzy|poprawia|zwiększa|zmniejsza|pomaga|powoduje|wpływa|generuje|dostarcza|opisuje|wyjaśnia|przedstawia|wskazuje|pokazuje)\s+\w+/i.test(s);
    if (strongPredicate) return true;
    const comparative =
      /\b\w+\s+(is|are|jest|są)\s+(better|faster|cheaper|more|less|higher|lower|larger|smaller|lepsz|szybsz|tańsz|więcej|mniej|wyższ|niższ)\b/i.test(s);
    return comparative;
  });

  const spoRatio = sentences.length > 0 ? (spoSentences.length / sentences.length) * 100 : 0;
  // Continuous: 50% SPO ratio = 100/100, linear below
  const spoScore = clamp100(Math.round((spoRatio / 50) * 100));

  checks.push({
    id: "semantic_triples",
    label: "Gęstość trójek semantycznych (SPO)",
    status: scoreToStatus(spoScore),
    score: spoScore,
    description: spoScore >= 70
      ? `Silna gęstość SPO: ${Math.round(spoRatio)}% zdań zawiera strukturę podmiot-orzeczenie-dopełnienie.`
      : spoScore >= 40
      ? `Umiarkowana gęstość SPO: ${Math.round(spoRatio)}% zdań. Pisz więcej stwierdzeń faktycznych z podmiotem i orzeczeniem.`
      : `Niska gęstość SPO: tylko ${Math.round(spoRatio)}% zdań zawiera jasne stwierdzenia faktyczne. Unikaj zdań ogólnikowych.`,
    impact: "medium",
    value: `${Math.round(spoRatio)}% SPO sentences (${spoSentences.length}/${sentences.length})`,
  });

  // ── 10. Co-reference Clarity ───────────────────────────────────────────────
  const ambiguousPronouns = (bodyText.match(/\b(this|that|it|they|them|these|those|he|she|its|their)\b/gi) ?? []).length;
  const pronounRatio = wordCount > 0 ? (ambiguousPronouns / wordCount) * 100 : 0;
  // Continuous: 0% pronouns = 100, 3% = 70, 6% = 40, 10%+ = 0
  const corefScore = clamp100(Math.round(100 - pronounRatio * 10));

  checks.push({
    id: "coreference_clarity",
    label: "Jasność ko-referencji",
    status: scoreToStatus(corefScore),
    score: corefScore,
    description: corefScore >= 70
      ? `Dobra jasność ko-referencji: niskie użycie niejednoznacznych zaimków (${Math.round(pronounRatio)}% słów).`
      : corefScore >= 40
      ? `Umiarkowane użycie zaimków (${Math.round(pronounRatio)}% słów). Zastąp zaimki konkretnymi rzeczownikami.`
      : `Wysokie użycie niejednoznacznych zaimków (${Math.round(pronounRatio)}% słów). Każde zdanie powinno działać samodzielnie.`,
    impact: "medium",
    value: `${Math.round(pronounRatio)}% pronoun ratio`,
  });

  // ── 11. Lists ──────────────────────────────────────────────────────────────
  const listCount = $("ul, ol").length;
  // Continuous: 0 lists = 0, 1 = 50, 2 = 75, 3+ = 100
  const listScore = listCount === 0 ? 0 : listCount === 1 ? 50 : listCount === 2 ? 75 : 100;

  checks.push({
    id: "lists_present",
    label: "Listy i treść strukturalna",
    status: listCount >= 2 ? "pass" : listCount === 1 ? "warning" : "fail",
    score: listScore,
    description: listCount >= 2
      ? `Znaleziono ${listCount} elementów listy — treść strukturalna jest preferowana przez silniki AI.`
      : listCount === 1
      ? "Znaleziono tylko 1 listę. Użyj więcej list punktowanych/numerowanych."
      : "Brak list. Silniki AI preferują treść strukturalną z punktami i numerowanymi krokami.",
    impact: "medium",
    value: listCount,
  });

  // ── 12. Intelligent Content Length (Dan Petrovic — Grounding Budget) ───────
  // Optimal: 600–1200 words for most page types (Google's ~540-word grounding budget)
  // Penalty: >3000 words without proportional information density
  const isProductPage = ["product", "product-listing"].includes(pageType);
  const optimalMin = isProductPage ? 200 : 600;
  const optimalMax = isProductPage ? 600 : 1200;
  const penaltyThreshold = isProductPage ? 1500 : 3000;

  // Calculate information density for dilution penalty
  const infoDensity = calculateInfoDensity(
    bodyText,
    wordCount,
    entityResult.numericFactsCount,
    entityResult.confirmedEntities.length + entityResult.unconfirmedEntities.length
  );

  let contentLengthScore: number;
  let contentLengthDesc: string;

  if (wordCount < optimalMin * 0.5) {
    // Very thin content
    contentLengthScore = clamp100(Math.round((wordCount / (optimalMin * 0.5)) * 30));
    contentLengthDesc = `${wordCount} słów — bardzo cienka treść. Silniki AI preferują strony z co najmniej ${optimalMin} słowami. Dodaj więcej treści merytorycznej.`;
  } else if (wordCount < optimalMin) {
    // Below optimal but not critical
    contentLengthScore = clamp100(Math.round(30 + ((wordCount - optimalMin * 0.5) / (optimalMin * 0.5)) * 40));
    contentLengthDesc = `${wordCount} słów — poniżej optymalnego zakresu (${optimalMin}–${optimalMax} słów). Rozważ rozszerzenie o konkretne fakty i przykłady.`;
  } else if (wordCount <= optimalMax) {
    // Optimal range — reward density
    contentLengthScore = clamp100(Math.round(70 + infoDensity * 0.3));
    contentLengthDesc = `${wordCount} słów — optymalny zakres (${optimalMin}–${optimalMax} słów). Gęstość informacyjna: ${infoDensity}/100. ${infoDensity >= 60 ? "Treść jest bogata w fakty — doskonała do cytowania." : "Zwiększ gęstość faktów (statystyki, encje, definicje)."}`;
  } else if (wordCount <= penaltyThreshold) {
    // Above optimal but not yet penalised — density matters more
    const dilutionFactor = (wordCount - optimalMax) / (penaltyThreshold - optimalMax);
    contentLengthScore = clamp100(Math.round(70 - dilutionFactor * 20 + infoDensity * 0.2));
    contentLengthDesc = `${wordCount} słów — powyżej optymalnego zakresu. Gęstość informacyjna: ${infoDensity}/100. ${infoDensity >= 50 ? "Dobra gęstość kompensuje długość." : "Rozważ skrócenie lub dodanie więcej faktów."}`;
  } else {
    // >penaltyThreshold — apply dilution penalty unless density is very high
    const dilutionPenalty = infoDensity >= 70 ? 0 : infoDensity >= 40 ? 15 : 30;
    contentLengthScore = clamp100(Math.round(60 - dilutionPenalty + infoDensity * 0.1));
    contentLengthDesc = `${wordCount} słów — długa strona (>${penaltyThreshold} słów). Gęstość informacyjna: ${infoDensity}/100. ${infoDensity < 40 ? `Treść jest rozcieńczona — silniki AI alokują ~540 słów na stronę (Grounding Budget). Skróć lub zagęść treść.` : "Wysoka gęstość informacyjna kompensuje długość."}`;
  }

  checks.push({
    id: "content_length",
    label: "Długość i gęstość treści (Grounding Budget)",
    status: scoreToStatus(contentLengthScore),
    score: contentLengthScore,
    description: contentLengthDesc,
    impact: "high",
    value: `${wordCount} words, density: ${infoDensity}/100`,
  });

  // ── 13. Information Gain (with Freshness Decay) ────────────────────────────
  const hasOriginalData =
    /\b(according\s+to\s+our|our\s+(research|study|data|analysis|survey)|we\s+(found|discovered|analyzed|tested|measured)|proprietary|original\s+research|case\s+study|our\s+clients?|nasza\s+(analiza|badanie|dane)|według\s+naszych|własne\s+badania)\b/i.test(bodyText);

  const hasSpecificStats =
    /\b(\d+(?:[.,]\d+)?%|\$\d+|\d+\s*(million|billion|thousand|mln|mld|tys\.?)|\d+(?:[.,]\d+)?\s*(x|times|razy|fold))\b/i.test(bodyText);

  // Freshness decay integration
  const isTimeSensitivePage = ["article", "service", "generic"].includes(pageType);
  const contentAgeDays = extractContentAgeDays(bodyText);
  const hasDateContext = contentAgeDays !== null;

  let freshnessScore = 50; // neutral default when no date found
  if (hasDateContext && contentAgeDays !== null) {
    freshnessScore = freshnessDecayScore(contentAgeDays, isTimeSensitivePage);
  } else if (!isTimeSensitivePage) {
    freshnessScore = 70; // evergreen pages don't need explicit dates
  }

  const informationGainSignals = [hasOriginalData, hasSpecificStats, hasDateContext].filter(Boolean).length;
  // Combine: 60% from info signals, 40% from freshness
  const infoGainScore = clamp100(Math.round(
    (informationGainSignals / 3) * 60 + freshnessScore * 0.4
  ));

  let infoGainDesc: string;
  if (infoGainScore >= 70) {
    const ageNote = hasDateContext && contentAgeDays !== null
      ? ` Świeżość: ${contentAgeDays <= 90 ? "aktualna" : contentAgeDays <= 365 ? "umiarkowana" : "stara"} (${Math.round(contentAgeDays / 30)} mies.).`
      : "";
    infoGainDesc = `Silne sygnały przyrostu informacji: oryginalne dane, statystyki i/lub kontekst dat.${ageNote} LLM szukają wyrazistych, niepowtarzalnych treści.`;
  } else if (infoGainScore >= 40) {
    const ageNote = hasDateContext && contentAgeDays !== null && contentAgeDays > 365
      ? ` Uwaga: treść może być przestarzała (${Math.round(contentAgeDays / 30)} mies.). Zaktualizuj daty i statystyki.`
      : "";
    infoGainDesc = `Częściowy przyrost informacji: znaleziono niektóre unikalne sygnały.${ageNote} Dodaj oryginalne badania lub konkretne statystyki z datami.`;
  } else {
    infoGainDesc = `Niski przyrost informacji: treść wydaje się generyczna${!hasDateContext && isTimeSensitivePage ? " i nie zawiera kontekstu dat" : ""}. LLM priorytetyzują treści z oryginalnymi danymi, eksperckimi opiniami i aktualnymi statystykami.`;
  }

  checks.push({
    id: "information_gain",
    label: "Przyrost informacji i świeżość",
    status: scoreToStatus(infoGainScore),
    score: infoGainScore,
    description: infoGainDesc,
    impact: "high",
    value: `${informationGainSignals}/3 signals, freshness: ${freshnessScore}/100`,
  });

  // ── 13b. First paragraph direct answer ────────────────────────────────────
  {
    const firstParagraphs = $("p").toArray()
      .map(el => $(el).text().trim())
      .filter(t => t.split(/\s+/).length >= 15);

    const firstPara = firstParagraphs[0] ?? "";
    const firstParaWords = firstPara.split(/\s+/).filter(Boolean).length;

    const hasDirectOpener =
      /^(\w[\w\s]{0,40}\s+(is|are|was|were|jest|są|to|oznacza|refers?\s+to|is\s+defined\s+as)\s)/i.test(firstPara) ||
      /^(how\s+to|what\s+is|why\s+does|when\s+to|jak\s+|co\s+to\s+|dlaczego\s+|kiedy\s+)/i.test(firstPara) ||
      /\b(\d+%|\d+\s+(steps?|sposobów|kroków|tips?|wskazówek))\b/i.test(firstPara.slice(0, 200));

    const isProductType = ["product", "product-listing"].includes(pageType);
    const isAdvisoryType = ["homepage", "landing"].includes(pageType);

    let firstParaScore: number;
    let firstParaStatus: AuditCheck["status"];
    let firstParaDesc: string;

    if (isProductType) {
      firstParaScore = 70;
      firstParaStatus = "info";
      firstParaDesc = "Strony produktowe nie wymagają akapitu z bezpośrednią odpowiedzią — opis produktu i specyfikacje pełnią tę rolę.";
    } else if (firstParagraphs.length === 0) {
      firstParaScore = 0;
      firstParaStatus = isAdvisoryType ? "warning" : "fail";
      firstParaDesc = "Brak akapitu otwierającego. Dodaj 2–3 zdania bezpośrednio odpowiadające na główne pytanie strony.";
    } else if (firstParaWords > 150) {
      firstParaScore = 45;
      firstParaStatus = "warning";
      firstParaDesc = `Pierwszy akapit jest za długi (${firstParaWords} słów). Skróć do ≤150 słów z bezpośrednią odpowiedzią na początku.`;
    } else if (hasDirectOpener) {
      firstParaScore = 100;
      firstParaStatus = "pass";
      firstParaDesc = `Pierwszy akapit (${firstParaWords} słów) zawiera bezpośrednią odpowiedź — silny sygnał dla rerankerów AI.`;
    } else {
      // Has paragraph but no direct opener — partial credit
      firstParaScore = isAdvisoryType ? 55 : 35;
      firstParaStatus = "warning";
      firstParaDesc = `Pierwszy akapit (${firstParaWords} słów) nie zaczyna się od bezpośredniej odpowiedzi. Przesuń kluczową informację na sam początek.`;
    }

    checks.push({
      id: "first_paragraph_answer",
      label: "Bezpośrednia odpowiedź w pierwszym akapicie",
      status: firstParaStatus,
      score: firstParaScore,
      description: firstParaDesc,
      impact: isProductType ? "low" : "high",
      value: firstParagraphs.length > 0 ? `${firstParaWords} words, direct opener: ${hasDirectOpener}` : "no paragraphs",
    });
  }

  // ── 13c. Intent blocks ─────────────────────────────────────────────────────
  {
    const allText = bodyText;
    const hasDefinitionBlock =
      /\b(what\s+is|what\s+are|how\s+does|why\s+is|co\s+to\s+jest|czym\s+jest|co\s+oznacza|jak\s+działa)\b/i.test(allText) ||
      /\b(\w[\w\s]{1,40}\s+(is\s+defined\s+as|refers?\s+to|means?|is\s+a\s+type\s+of|jest\s+to|oznacza|definiuje\s+się\s+jako))\b/i.test(allText);

    const hasStepsBlock =
      $("ol li").length >= 3 ||
      /\b(step\s+\d|krok\s+\d|\d+\.\s+\w|po\s+pierwsze|po\s+drugie|first[,:]|second[,:]|third[,:]|finally[,:]|następnie|najpierw|potem)\b/i.test(allText) ||
      /\b(how\s+to\s+\w|jak\s+\w{3,}\s+(krok|step))\b/i.test(allText);

    const hasComparisonBlock =
      /\b(vs\.?|versus|compared?\s+to|in\s+comparison|on\s+the\s+other\s+hand|alternatively|porównanie|w\s+porównaniu|natomiast|z\s+kolei|podczas\s+gdy)\b/i.test(allText) ||
      $("table").length >= 1;

    const intentBlocksFound = [hasDefinitionBlock, hasStepsBlock, hasComparisonBlock].filter(Boolean).length;
    // Continuous: 3/3 = 100, 2/3 = 67, 1/3 = 33, 0/3 = 0
    const intentScore = clamp100(Math.round((intentBlocksFound / 3) * 100));

    const intentRelevant = ["article", "service", "generic"].includes(pageType);
    const foundLabels = [
      hasDefinitionBlock ? "definicja" : null,
      hasStepsBlock ? "kroki" : null,
      hasComparisonBlock ? "porównanie" : null,
    ].filter(Boolean).join(", ");
    const missingLabels = [
      !hasDefinitionBlock ? "definicja" : null,
      !hasStepsBlock ? "kroki" : null,
      !hasComparisonBlock ? "porównanie" : null,
    ].filter(Boolean).join(", ");

    let intentStatus: AuditCheck["status"];
    let intentDesc: string;

    if (["product", "product-listing"].includes(pageType)) {
      intentStatus = "info";
      intentDesc = "Strony produktowe skupiają się na specyfikacjach — bloki intencji nie są tu kluczowym sygnałem GEO.";
    } else if (intentBlocksFound === 3) {
      intentStatus = "pass";
      intentDesc = `Wykryto wszystkie 3 bloki intencji: ${foundLabels}. Perplexity nagradza treści pokrywające pełen zakres intencji.`;
    } else if (intentBlocksFound >= 1) {
      intentStatus = intentRelevant ? "warning" : "info";
      intentDesc = `Wykryto ${intentBlocksFound}/3 bloków intencji (${foundLabels}). Brakuje: ${missingLabels}.`;
    } else {
      intentStatus = intentRelevant ? "fail" : "warning";
      intentDesc = `Brak wykrytych bloków intencji. Dodaj co najmniej jeden z bloków: definicja, lista kroków lub porównanie.`;
    }

    checks.push({
      id: "intent_blocks",
      label: "Pokrycie bloków intencji (definicja / kroki / porównanie)",
      status: intentStatus,
      score: ["product", "product-listing"].includes(pageType) ? 70 : intentScore,
      description: intentDesc,
      impact: intentRelevant ? "high" : "low",
      value: `${intentBlocksFound}/3 (${foundLabels || "none"})`,
    });
  }

  // ── 14. Answer-pattern detection ──────────────────────────────────────────
  const hasAnswerPatterns =
    /\b(is\s+defined\s+as|refers?\s+to|means?\s+that|in\s+other\s+words|for\s+example|the\s+answer\s+is|oznacza|definiuje\s+się|to\s+znaczy)\b/i.test(bodyText);

  checks.push({
    id: "answer_patterns",
    label: "Wzorce bezpośrednich odpowiedzi",
    status: hasAnswerPatterns ? "pass" : "info",
    score: hasAnswerPatterns ? 100 : 30,
    description: hasAnswerPatterns
      ? "Wykryto język definicyjny i wzorce odpowiedzi — silniki AI uwielbiają cytowalne bezpośrednie odpowiedzi."
      : "Rozważ dodanie jasnych definicji i bezpośrednich odpowiedzi na prawdopodobne pytania użytkowników.",
    impact: "medium",
    value: hasAnswerPatterns,
  });

  // ── 15. External citations ─────────────────────────────────────────────────
  const pageHost = (() => {
    try { return new URL(page.url).hostname; } catch { return ""; }
  })();
  let externalLinkCount = 0;
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (href.startsWith("http") && !href.includes(pageHost)) externalLinkCount++;
  });

  // Continuous: 0 = 0, 1 = 40, 2 = 65, 3 = 80, 5+ = 100
  const citationScore = externalLinkCount === 0 ? 0
    : externalLinkCount === 1 ? 40
    : externalLinkCount === 2 ? 65
    : externalLinkCount < 5 ? 80
    : 100;

  const citationRelevant = ["article", "service", "homepage"].includes(pageType);
  checks.push({
    id: "external_citations",
    label: "Cytowania zewnętrzne i linki",
    status: externalLinkCount >= 3 ? "pass" : externalLinkCount >= 1 ? "warning" : citationRelevant ? "fail" : "info",
    score: citationScore,
    description: externalLinkCount >= 3
      ? `Znaleziono ${externalLinkCount} linków zewnętrznych — dobre sygnały cytowania dla silników AI.`
      : externalLinkCount >= 1
      ? `Znaleziono tylko ${externalLinkCount} link zewnętrzny. Dodaj 3–5 linków do autorytatywnych źródeł.`
      : citationRelevant
      ? "Brak cytowań zewnętrznych. Linkowanie do autorytatywnych źródeł to kluczowy sygnał E-E-A-T i GEO."
      : "Brak linków zewnętrznych. Rozważ cytowanie źródeł tam, gdzie jest to zasadne.",
    impact: "medium",
    value: externalLinkCount,
  });

  // ── 16. Data points ────────────────────────────────────────────────────────
  const hasDataPoints =
    /\b(\d+%|\$\d+|\d+\s*(million|billion|thousand|mln|mld)|[\d,]+\s*(users|customers|results?|klientów|użytkowników))\b/i.test(bodyText);

  checks.push({
    id: "data_points",
    label: "Fakty i dane liczbowe w tekście",
    status: hasDataPoints ? "pass" : "info",
    score: hasDataPoints ? 100 : 20,
    description: hasDataPoints
      ? "Znaleziono fakty liczbowe i dane w tekście — silniki AI mogą cytować je bezpośrednio."
      : "Brak wyraźnych danych liczbowych. Umieść statystyki i fakty w tekście do cytowania przez AI.",
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
  // Updated weights — entity_richness elevated 8→15, content_length updated for density
  const weights: Record<string, number> = {
    h1_present: 8,
    heading_hierarchy: 0,       // Advisory only — not a ranking factor
    passage_optimization: 10,
    tldr_summary: 10,           // Reduced slightly to make room for entity_richness
    faq_section: 10,            // Reduced slightly
    semantic_chunking: 10,
    entity_richness: 15,        // ↑ ELEVATED: 8→15 (King/Yeşilyurt/Petrovic consensus)
    readability: 4,
    semantic_triples: 5,
    first_paragraph_answer: 8,
    intent_blocks: 6,
    coreference_clarity: 3,
    lists_present: 4,
    content_length: 8,          // Renamed to content_length but now uses density logic
    information_gain: 8,        // Includes freshness decay
    answer_patterns: 3,
    external_citations: 5,
    data_points: 3,
  };

  let earned = 0;
  let total = 0;

  for (const check of checks) {
    const w = weights[check.id] ?? 5;
    total += w;

    if (check.score !== undefined) {
      // Use continuous score directly — no binary conversion
      earned += (check.score / 100) * w;
    } else {
      // Backward-compatible fallback: derive from status
      if (check.status === "pass") earned += w;
      else if (check.status === "warning") earned += w * 0.2;
      else if (check.status === "info") earned += w * 0.1;
      // fail = 0
    }
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
  const typeLabel = pageType === "article" ? "artykuł" : pageType === "product-listing" ? "strona kategorii" : "strona";
  if (score >= 80)
    return `Treść jest dobrze ustrukturyzowana pod cytowanie przez AI — dobry chunking semantyczny, bogactwo encji w Knowledge Graph i treści Q&A.`;
  const missing: string[] = [];
  if (!hasTldr && !["product", "product-listing"].includes(pageType)) missing.push("podsumowanie TL;DR");
  if (!hasFaq) missing.push("sekcja FAQ");
  if (wordCount < 300) missing.push("więcej treści");
  if (missing.length > 0)
    return `Brakuje kluczowych elementów GEO dla tej ${typeLabel}: ${missing.join(", ")}.`;
  return `Wynik struktury treści: ${score}/100. Skup się na chunkingu semantycznym, bogactwie encji (Knowledge Graph) i optymalizacji fragmentów.`;
}
