/**
 * Content Structure Module — v3 (Perplexity Ranking Patterns + iPullRank aligned)
 *
 * Key upgrades:
 *  - Semantic chunking: one-idea-per-paragraph, self-contained blocks
 *  - Entity richness: named entities (brands, people, places, products)
 *  - Readability scoring: Flesch-Kincaid proxy for AI extractability
 *  - Semantic triples: NLP-quality SPO density (noun phrase + verb + complement)
 *  - Co-reference clarity: avoidance of ambiguous pronouns
 *  - Information gain: unique data points vs. generic statements
 *  - Passage optimization: query-answering headings
 *  - First paragraph answer: direct answer in opening (Perplexity L3 reranker signal)
 *  - Intent blocks: definition / steps / comparison coverage (context-aware)
 */

import * as cheerio from "cheerio";
import type { ScrapedPage } from "./scraper";
import type { PageType } from "./pageTypeDetector";
import type { AuditCheck, CategoryResult } from "./types";

export function analyzeContentStructure(page: ScrapedPage, pageType: PageType = "generic"): CategoryResult {
  const checks: AuditCheck[] = [];

  // IMPORTANT: Use a fresh cheerio instance — NEVER mutate page.$.
  // Other modules (eeat, brandAuthority, llmRecommendations) run after this one
  // and depend on page.$ being intact (e.g. eeat reads $('footer a') for About/Privacy links).
  const $raw = page.$; // read-only: for heading counts that need <header> intact
  const $ = cheerio.load(page.html); // mutable local copy for text extraction

  // ── 1. H1 present — read from $raw BEFORE any removal ───────────────────────────
  // Many CMS/e-commerce sites (Vue, React SSR, WordPress) place H1 inside <header>.
  const h1Count = $raw("h1").length;
  const h2Count = $raw("h2").length;
  const h3Count = $raw("h3").length;

  // Remove noise from the LOCAL copy only
  $("script, style, nav, footer, header, aside, noscript").remove();
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = bodyText.split(/\s+/).filter(Boolean).length;
  const fullHtml = $.html() ?? "";
  checks.push({
    id: "h1_present",
    label: "Nagłówek H1 obecny",
    status: h1Count === 1 ? "pass" : h1Count === 0 ? "fail" : "warning",
    description:
      h1Count === 1
        ? `Znaleziono H1: "${$("h1").first().text().trim().slice(0, 80)}"`
        : h1Count === 0
        ? "Brak nagłówka H1. Każda strona potrzebuje dokładnie jednego H1, aby silniki AI mogły zidentyfikować główny temat."
        : `Znaleziono ${h1Count} nagłówków H1. Użyj dokładnie jednego H1 na stronę.`,
    impact: "high",
    value: h1Count,
  });

  // ── 2. Heading hierarchy — informational hint only, does NOT affect score ──
  // Heading order is a nice-to-have UX/accessibility signal, not a ranking factor.
  // Status is always 'info' regardless of structure — shown as advisory only.
  const headingStructure = `H1:${h1Count}, H2:${h2Count}, H3:${h3Count}`;
  checks.push({
    id: "heading_hierarchy",
    label: "Struktura nagłówków (informacyjnie)",
    status: "info",
    description: h1Count >= 1 && h2Count >= 2
      ? `Struktura nagłówków: ${headingStructure} — dobrze zorganizowana dla użytkowników i scannerów AI.`
      : h2Count === 0
      ? `Struktura nagłówków: ${headingStructure}. Rozważ dodanie podnagłówków H2, aby pomóc użytkownikom i silnikom AI nawigować po stronie. (Informacyjnie — nie jest czynnikiem rankingowym.)`
      : `Struktura nagłówków: ${headingStructure}. Dodanie większej liczby nagłówków H2/H3 może poprawić skanowalność. (Informacyjnie — nie jest czynnikiem rankingowym.)`,
    impact: "low",
    value: headingStructure,
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
    label: "Nagłówki zoptymalizowane pod fragmenty",
    status: passageOptimized ? "pass" : headingTexts.length === 0 ? "fail" : "warning",
    description: passageOptimized
      ? `Wykryto ${questionHeadings} nagłówków w formie pytań i ${descriptiveHeadings} opisowych — nagłówki pełnią rolę jednostek semantycznych do wyszukiwania fragmentów przez AI.`
      : headingTexts.length === 0
      ? "Brak podnagłówków. Dodaj opisowe nagłówki H2/H3, które bezpośrednio odpowiadają na pytania użytkowników — każdy nagłówek to kotwica wyszukiwania dla silników AI."
      : "Nagłówki są zbyt ogólne (np. 'Wprowadzenie', 'Sekcja 1'). Użyj opisowych nagłówków odpowiadających na zapytania, np. 'Jak zoptymalizować strony produktów pod AI search' — to podstawa optymalizacji fragmentów.",
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
    label: "Blok TL;DR / Podsumowanie",
    status: hasTldr
      ? "pass"
      : tldrRelevant
      ? "fail"
      : "warning",
    description: hasTldr
      ? "Wykryto sekcję podsumowania lub TL;DR — silniki AI mogą cytować ją bezpośrednio."
      : tldrRelevant
      ? "Brak sekcji TL;DR lub podsumowania. To krytyczna luka GEO — silniki AI chętnie cytują podsumowania stron. Dodaj 2–4 zdania podsumowania na górze strony z etykietą 'TL;DR', 'Podsumowanie' lub 'Kluczowe informacje'."
      : "Brak sekcji podsumowania. Rozważ dodanie krótkiego opisu produktu do cytowania przez AI.",
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
    label: "Sekcja FAQ",
    status: hasFaqSection
      ? "pass"
      : faqRelevant
      ? "fail"
      : "warning",
    description: hasFaqSection
      ? "Wykryto sekcję FAQ — świetne dla inkluzji odpowiedzi AI."
      : faqRelevant
      ? "Brak sekcji FAQ. To poważna luka GEO — treści FAQ to jeden z najczęściej cytowanych formatów w odpowiedziach generowanych przez AI. Dodaj 5–10 par Q&A na temat swojej strony."
      : "Brak sekcji FAQ. Dodanie FAQ do strony kategorii może poprawić wskaźniki cytowania przez AI.",
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
    label: "Chunking semantyczny (struktura akapitów)",
    status: chunking_status,
    description: paragraphs.length < 3
      ? "Wykryto zbyt mało akapitów. Podziel treść na krótkie, samodzielne akapity — każdy wyrażający jedną pełną myśl do ekstrakcji przez AI."
      : hasGoodChunking
      ? `Dobry chunking: średn. ${Math.round(avgParaWords)} słów/akapit, ${Math.round(shortParaRatio * 100)}% akapitów jest zwięzłych. Silniki AI mogą wyodrębniać poszczególne akapity jako odpowiedzi.`
      : avgParaWords > 150
      ? `Akapity są za długie (średn. ${Math.round(avgParaWords)} słów). Podziel długie akapity na krótsze, samodzielne bloki — silniki AI jak Gemini i ChatGPT segmentują strony według akapitów i wybierają jeden na raz do podsumowania.`
      : `Struktura akapitów wymaga poprawy (średn. ${Math.round(avgParaWords)} słów). Celuj w akapity 40–80 słów, każdy wyrażający jedną pełną myśl.`,
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
    label: "Bogactwo encji (nazwane encje i fakty)",
    status: totalEntitySignals >= 15 ? "pass" : totalEntitySignals >= 5 ? "warning" : "fail",
    description: totalEntitySignals >= 15
      ? `Bogata gęstość encji: ~${totalEntitySignals} nazwanych encji i konkretnych faktów. Silniki AI używają nazwanych encji do budowania osadzeń semantycznych i połączeń grafu wiedzy.`
      : totalEntitySignals >= 5
      ? `Umiarkowana gęstość encji: ~${totalEntitySignals} wykrytych encji. Zwiększ szczegółowość — zamiast 'to narzędzie' napisz 'Google Search Console'. Zamiast 'większość użytkowników' napisz '73% użytkowników'.`
      : `Niska gęstość encji: bardzo mało nazwanych encji lub konkretnych faktów. Treść jest zbyt ogólna. Nazywaj konkretne marki, produkty, osoby i miejsca. Dodaj konkretne statystyki z liczbami. Modele AI rozumieją znaczenie przez nazwane encje — niejasna treść otrzymuje słabe osadzenia.`,
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
    label: "Czytelność (złożoność zdań)",
    status: readability_status,
    description: avgSentenceWords <= 20
      ? `Dobra czytelność: średn. ${Math.round(avgSentenceWords)} słów/zdanie. Krótkie, jasne zdania poprawiają dokładność ekstrakcji AI i wskaźnik Flesch-Kincaid.`
      : avgSentenceWords <= 28
      ? `Umiarkowana czytelność: średn. ${Math.round(avgSentenceWords)} słów/zdanie. Celuj w zdania do 20 słów. Długie zdania zmniejszają dokładność ekstrakcji AI.`
      : `Słaba czytelność: średn. ${Math.round(avgSentenceWords)} słów/zdanie. Zdania są zbyt złożone dla optymalnego przetwarzania AI. Podziel długie zdania na krótsze, bezpośrednie stwierdzenia. AI działa lepiej z prostym, czytelnym językiem (Flesch-Kincaid klasa 6-8).`,
    impact: "medium",
    value: `avg ${Math.round(avgSentenceWords)} words/sentence`,
  });

  // ── 9. Semantic Triples — NLP-quality SPO density (f) ────────────────────
  // Approach: count sentences that contain a NOUN PHRASE + VERB PHRASE + COMPLEMENT.
  // This avoids the false-positive explosion of naive verb-matching on long texts.
  //
  // Algorithm (no external NLP library needed):
  //  1. Split into sentences.
  //  2. For each sentence, check that it has:
  //     a) A subject candidate: a capitalised word or a known-noun pattern at the start.
  //     b) A meaningful predicate verb (not a stopword verb like "do" alone).
  //     c) A complement: at least one more content word after the verb.
  //  3. Additionally count explicit definitional/factual sentence patterns (highest signal).
  //  4. Normalise by sentence count (not word count) to avoid length bias.

  const spoSentences = sentences.filter(sentence => {
    const s = sentence.trim();
    if (s.split(/\s+/).length < 4) return false; // too short to form SPO

    // High-confidence definitional patterns ("X is defined as Y", "X means Y", "X refers to Y")
    const definitional =
      /\b(\w[\w\s]{1,30})\s+(is|are|was|were|means?|refers?\s+to|is\s+defined\s+as|consists?\s+of|is\s+known\s+as|jest|są|oznacza|definiuje\s+się|to\s+znaczy)\s+.{5,}/i.test(s) ||
      /\b(\w[\w\s]{1,30})\s+(jest|są|był|była|oznacza|definiuje|zawiera|obejmuje|umożliwia|pozwala|wymaga)\s+.{5,}/i.test(s);
    if (definitional) return true;

    // Factual assertion: NOUN + strong-predicate-verb + COMPLEMENT (≥2 words)
    // Strong predicates: verbs that carry semantic weight (not auxiliaries alone)
    const strongPredicate =
      /\b(\w+)\s+(provides?|offers?|enables?|allows?|supports?|requires?|includes?|contains?|produces?|creates?|improves?|increases?|reduces?|helps?|causes?|affects?|determines?|influences?|generates?|delivers?|ensures?|prevents?|describes?|explains?|represents?|indicates?|demonstrates?|shows?|proves?|confirms?)\s+\w+/i.test(s) ||
      /\b(\w+)\s+(zapewnia|oferuje|umożliwia|pozwala|wspiera|wymaga|zawiera|produkuje|tworzy|poprawia|zwiększa|zmniejsza|pomaga|powoduje|wpływa|generuje|dostarcza|opisuje|wyjaśnia|przedstawia|wskazuje|pokazuje)\s+\w+/i.test(s);
    if (strongPredicate) return true;

    // Comparative/relational: "X is better/faster/more X than Y"
    const comparative =
      /\b\w+\s+(is|are|jest|są)\s+(better|faster|cheaper|more|less|higher|lower|larger|smaller|lepsz|szybsz|tańsz|więcej|mniej|wyższ|niższ)\b/i.test(s);
    return comparative;
  });

  const spoRatio = sentences.length > 0 ? (spoSentences.length / sentences.length) * 100 : 0;

  // Thresholds: ≥40% of sentences carry SPO = good; ≥20% = moderate; <20% = weak
  const tripleStatus = spoRatio >= 40 ? "pass" : spoRatio >= 20 ? "warning" : "fail";

  checks.push({
    id: "semantic_triples",
    label: "Gęstość trójek semantycznych (SPO)",
    status: tripleStatus,
    description: spoRatio >= 40
      ? `Silna gęstość SPO: ${Math.round(spoRatio)}% zdań zawiera strukturę podmiot-orzeczenie-dopełnienie. Silniki AI budują grafy wiedzy z takich stwierdzeń — treść jest gotowa do ekstrakcji faktów.`
      : spoRatio >= 20
      ? `Umiarkowana gęstość SPO: ${Math.round(spoRatio)}% zdań. Pisz więcej stwierdzeń faktycznych: 'Schema markup poprawia widoczność w AI Search', 'Perplexity cytuje strony z bezpośrednimi odpowiedziami'. Każde zdanie powinno przenosić konkretny fakt.`
      : `Niska gęstość SPO: tylko ${Math.round(spoRatio)}% zdań zawiera jasne stwierdzenia faktyczne. Unikaj zdań ogólnikowych ('to może pomóc'). Pisz konkretnie: podmiot + co robi/jest + dopełnienie. To fundament grafu wiedzy AI.`,
    impact: "medium",
    value: `${Math.round(spoRatio)}% SPO sentences (${spoSentences.length}/${sentences.length})`,
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
    label: "Jasność ko-referencji",
    status: pronounRatio <= 3 ? "pass" : pronounRatio <= 6 ? "warning" : "fail",
    description: pronounRatio <= 3
      ? `Dobra jasność ko-referencji: niskie użycie niejednoznacznych zaimków (${Math.round(pronounRatio)}% słów). Konkretne rzeczowniki są używane spójnie — silniki AI mogą dokładnie rozpoznawać odniesienia do encji.`
      : pronounRatio <= 6
      ? `Umiarkowane użycie zaimków (${Math.round(pronounRatio)}% słów). Zastąp niejednoznaczne zaimki jak 'to', 'ono', 'oni' konkretnymi rzeczownikami. Zamiast 'to poprawia widoczność' napisz 'schema markup poprawia widoczność w wynikach AI search'.`
      : `Wysokie użycie niejednoznacznych zaimków (${Math.round(pronounRatio)}% słów). Znacznie zmniejsza to dokładność ekstrakcji AI. Każde zdanie powinno działać samodzielnie — powtarzaj kluczowe terminy zamiast używać 'to', 'ono', 'oni'. Rozpoznawanie ko-referencji przez AI zawodzi, gdy zaimki nie mają jasnych odniesień.`,
    impact: "medium",
    value: `${Math.round(pronounRatio)}% pronoun ratio`,
  });

  // ── 11. Lists (ul/ol) ──────────────────────────────────────────────────────
  const listCount = $("ul, ol").length;
  const hasLists = listCount >= 2;
  checks.push({
    id: "lists_present",
    label: "Listy i treść strukturalna",
    status: hasLists ? "pass" : listCount === 1 ? "warning" : "fail",
    description: hasLists
      ? `Znaleziono ${listCount} elementów listy — treść strukturalna jest preferowana przez silniki AI.`
      : listCount === 1
      ? "Znaleziono tylko 1 listę. Użyj więcej list punktowanych/numerowanych, aby treść była skanowalna przez AI."
      : "Brak list. Silniki AI preferują treść strukturalną z punktami i numerowanymi krokami.",
    impact: "medium",
    value: listCount,
  });

  // ── 12. Content length ─────────────────────────────────────────────────────
  const minWords = ["product", "product-listing"].includes(pageType) ? 200 : 300;
  const richWords = ["product", "product-listing"].includes(pageType) ? 400 : 800;

  checks.push({
    id: "content_length",
    label: "Odpowiednia długość treści",
    status: wordCount >= richWords ? "pass" : wordCount >= minWords ? "warning" : "fail",
    description:
      wordCount >= richWords
        ? `${wordCount} słów — bogata długość treści, dobra do cytowania przez AI.`
        : wordCount >= minWords
        ? `${wordCount} słów — wystarczające, ale rozważ rozszerzenie do ${richWords}+ słów dla lepszego pokrycia przez AI.`
        : `${wordCount} słów — cienka treść. Silniki AI preferują strony z co najmniej ${minWords} słowami.`,
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
    label: "Przyrost informacji (unikalne dane)",
    status: informationGainScore >= 2 ? "pass" : informationGainScore === 1 ? "warning" : "fail",
    description: informationGainScore >= 2
      ? `Silne sygnały przyrostu informacji: wykryto oryginalne dane, konkretne statystyki i/lub kontekst dat. LLM szukają wyrazistych, niepowtarzalnych treści — powtarzalne lub szablonowe treści są odfiltrowywane.`
      : informationGainScore === 1
      ? `Częściowy przyrost informacji: znaleziono niektóre unikalne sygnały, ale treść mogłaby być bardziej wyrazista. Dodaj oryginalne badania, własne dane lub konkretne statystyki z datami (np. 'stan na Q1 2025, 73% użytkowników...').`
      : `Niski przyrost informacji: treść wydaje się generyczna. LLM priorytetyzują treści, które tylko Ty możesz opublikować — osobiste spostrzegą, oryginalne badania, opinie ekspertów, własne dane. Generyczna treść powielająca tysiące innych stron jest odfiltrowywana z odpowiedzi AI.`,
    impact: "high",
    value: `${informationGainScore}/3 signals`,
  });

  // ── 13b. First paragraph direct answer (a) — Perplexity L3 reranker signal ──
  // Perplexity's reranker strongly rewards pages where the first ≤150 words
  // contain a direct, self-contained answer. This is the #1 citation signal.
  //
  // Page-type awareness:
  //  - article/service/generic: full check — first para should answer directly
  //  - homepage/landing: advisory only — hero copy often serves this role
  //  - product/product-listing: not applicable — product specs replace prose answers
  {
    const firstParagraphs = $('p').toArray()
      .map(el => $(el).text().trim())
      .filter(t => t.split(/\s+/).length >= 15); // skip micro-captions

    const firstPara = firstParagraphs[0] ?? "";
    const firstParaWords = firstPara.split(/\s+/).filter(Boolean).length;

    // Direct-answer signals: definitional openers, imperative starters, numeric facts
    const hasDirectOpener =
      /^(\w[\w\s]{0,40}\s+(is|are|was|were|jest|są|to|oznacza|refers?\s+to|is\s+defined\s+as)\s)/i.test(firstPara) ||
      /^(how\s+to|what\s+is|why\s+does|when\s+to|jak\s+|co\s+to\s+|dlaczego\s+|kiedy\s+)/i.test(firstPara) ||
      /\b(\d+%|\d+\s+(steps?|sposobów|kroków|tips?|wskazówek))\b/i.test(firstPara.slice(0, 200));

    const isProductType = ["product", "product-listing"].includes(pageType);
    const isAdvisoryType = ["homepage", "landing"].includes(pageType);

    let firstParaStatus: AuditCheck["status"];
    let firstParaDesc: string;

    if (isProductType) {
      // Not applicable — product pages use specs, not prose answers
      firstParaStatus = "info";
      firstParaDesc = "Strony produktowe nie wymagają akapitu z bezpośrednią odpowiedzią — opis produktu i specyfikacje pełnią tę rolę.";
    } else if (firstParagraphs.length === 0) {
      firstParaStatus = isAdvisoryType ? "warning" : "fail";
      firstParaDesc = "Brak akapitu otwierającego. Dodaj 2–3 zdania bezpośrednio odpowiadające na główne pytanie strony — to najważniejszy sygnał dla rerankerów Perplexity i Google AI Overviews.";
    } else if (firstParaWords > 150) {
      firstParaStatus = "warning";
      firstParaDesc = `Pierwszy akapit jest za długi (${firstParaWords} słów). Skróć go do ≤150 słów z bezpośrednią odpowiedzią na początku — Perplexity cytuje pierwsze zdania, nie środek akapitu.`;
    } else if (hasDirectOpener) {
      firstParaStatus = "pass";
      firstParaDesc = `Pierwszy akapit (${firstParaWords} słów) zawiera bezpośrednią odpowiedź — silny sygnał dla rerankerów AI. Perplexity i Google AI Overviews preferują strony, które odpowiadają natychmiast.`;
    } else {
      firstParaStatus = isAdvisoryType ? "warning" : "warning";
      firstParaDesc = `Pierwszy akapit (${firstParaWords} słów) nie zaczyna się od bezpośredniej odpowiedzi. Przesuń kluczową informację na sam początek: 'X jest/oznacza/pozwala...'. Perplexity nagradza strony, które odpowiadają w pierwszych 2 zdaniach.`;
    }

    checks.push({
      id: "first_paragraph_answer",
      label: "Bezpośrednia odpowiedź w pierwszym akapicie",
      status: firstParaStatus,
      description: firstParaDesc,
      impact: isProductType ? "low" : "high",
      value: firstParagraphs.length > 0 ? `${firstParaWords} words, direct opener: ${hasDirectOpener}` : "no paragraphs",
    });
  }

  // ── 13c. Intent blocks — definition / steps / comparison (b) ─────────────
  // Perplexity explicitly rewards content that covers 3 intent archetypes:
  //  1. Definition block: "What is X" — definitional sentence or heading
  //  2. Steps block: numbered list or HowTo-style sequence
  //  3. Comparison block: "X vs Y" or comparative table/list
  //
  // Context-aware: not a hard requirement — advisory for non-article types.
  // A page can rank well without all 3 if its intent is narrow (e.g. pure product).
  {
    const allText = bodyText;
    const allHtml = fullHtml;

    // 1. Definition block
    const hasDefinitionBlock =
      /\b(what\s+is|what\s+are|how\s+does|why\s+is|co\s+to\s+jest|czym\s+jest|co\s+oznacza|jak\s+działa)\b/i.test(allText) ||
      /\b(\w[\w\s]{1,40}\s+(is\s+defined\s+as|refers?\s+to|means?|is\s+a\s+type\s+of|jest\s+to|oznacza|definiuje\s+się\s+jako))\b/i.test(allText);

    // 2. Steps block: ordered list, or numbered headings, or "Step N" patterns
    const hasStepsBlock =
      $('ol li').length >= 3 ||
      /\b(step\s+\d|krok\s+\d|\d+\.\s+\w|po\s+pierwsze|po\s+drugie|first[,:]|second[,:]|third[,:]|finally[,:]|następnie|najpierw|potem)\b/i.test(allText) ||
      /\b(how\s+to\s+\w|jak\s+\w{3,}\s+(krok|step))\b/i.test(allText);

    // 3. Comparison block: "X vs Y", "compared to", comparison table
    const hasComparisonBlock =
      /\b(vs\.?|versus|compared?\s+to|in\s+comparison|on\s+the\s+other\s+hand|alternatively|porównanie|w\s+porównaniu|natomiast|z\s+kolei|podczas\s+gdy)\b/i.test(allText) ||
      $('table').length >= 1; // tables often represent comparisons

    const intentBlocksFound = [hasDefinitionBlock, hasStepsBlock, hasComparisonBlock].filter(Boolean).length;

    // Relevance: articles and service pages benefit most; product/listing pages less so
    const intentRelevant = ["article", "service", "generic"].includes(pageType);
    const intentAdvisory = ["homepage", "landing"].includes(pageType);

    let intentStatus: AuditCheck["status"];
    let intentDesc: string;
    const foundLabels = [
      hasDefinitionBlock ? "definicja" : null,
      hasStepsBlock ? "kroki" : null,
      hasComparisonBlock ? "porównanie" : null,
    ].filter(Boolean).join(", ");
    const missingLabels = [
      !hasDefinitionBlock ? "definicja (co to jest X)" : null,
      !hasStepsBlock ? "kroki (jak to zrobić)" : null,
      !hasComparisonBlock ? "porównanie (X vs Y)" : null,
    ].filter(Boolean).join(", ");

    if (["product", "product-listing"].includes(pageType)) {
      intentStatus = "info";
      intentDesc = "Strony produktowe skupiają się na specyfikacjach i ofertach — bloki intencji nie są tu kluczowym sygnałem GEO.";
    } else if (intentBlocksFound === 3) {
      intentStatus = "pass";
      intentDesc = `Wykryto wszystkie 3 bloki intencji: ${foundLabels}. Perplexity nagradza treści pokrywające pełen zakres intencji użytkownika — definicję, instrukcję i porównanie.`;
    } else if (intentBlocksFound === 2) {
      intentStatus = intentRelevant ? "warning" : "info";
      intentDesc = `Wykryto ${intentBlocksFound}/3 bloków intencji (${foundLabels}). Brakuje: ${missingLabels}. Dodanie brakującego bloku może zwiększyć szansę cytowania przez Perplexity dla szerszego zakresu zapytań.`;
    } else if (intentBlocksFound === 1) {
      intentStatus = intentRelevant ? "warning" : "info";
      intentDesc = `Wykryto tylko ${intentBlocksFound}/3 bloków intencji (${foundLabels}). Brakuje: ${missingLabels}. Treść pokrywa wąski zakres intencji — rozważ rozbudowę o sekcje definicji i/lub kroków.`;
    } else {
      intentStatus = intentRelevant ? "fail" : intentAdvisory ? "warning" : "info";
      intentDesc = `Brak wykrytych bloków intencji. Perplexity preferuje treści, które jednocześnie definiują temat, pokazują jak coś zrobić i porównują opcje. Dodaj co najmniej jeden z bloków: definicja, lista kroków lub porównanie.`;
    }

    checks.push({
      id: "intent_blocks",
      label: "Pokrycie bloków intencji (definicja / kroki / porównanie)",
      status: intentStatus,
      description: intentDesc,
      impact: intentRelevant ? "high" : "low",
      value: `${intentBlocksFound}/3 (${foundLabels || "none"})`,
    });
  }

  // ── 14. Answer-pattern detection ───────────────────────────────────────────
  const hasAnswerPatterns =
    /\b(is\s+defined\s+as|refers?\s+to|means?\s+that|in\s+other\s+words|for\s+example|the\s+answer\s+is|oznacza|definiuje\s+się|to\s+znaczy)\b/i.test(
      bodyText
    );
  checks.push({
    id: "answer_patterns",
    label: "Wzorce bezpośrednich odpowiedzi",
    status: hasAnswerPatterns ? "pass" : "info",
    description: hasAnswerPatterns
      ? "Wykryto język definicyjny i wzorce odpowiedzi — silniki AI uwielbiają cytowalne bezpośrednie odpowiedzi."
      : "Rozważ dodanie jasnych definicji i bezpośrednich odpowiedzi na prawdopodobne pytania użytkowników, aby poprawić potencjał cytowania.",
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
    label: "Cytowania zewnętrzne i linki",
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
        ? `Znaleziono ${externalLinkCount} linków zewnętrznych — dobre sygnały cytowania dla silników AI.`
        : externalLinkCount >= 1
        ? `Znaleziono tylko ${externalLinkCount} link zewnętrzny. Dodaj 3–5 linków do autorytatywnych źródeł.`
        : citationRelevant
        ? "Brak cytowań zewnętrznych. Linkowanie do autorytatywnych źródeł (badania, statystyki, oficjalne strony) to kluczowy sygnał E-E-A-T i GEO."
        : "Brak linków zewnętrznych. Rozważ cytowanie źródeł tam, gdzie jest to zasadne.",
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
    label: "Fakty i dane liczbowe w tekście",
    status: hasDataPoints ? "pass" : "info",
    description: hasDataPoints
      ? "Znaleziono fakty liczbowe i dane w tekście — silniki AI mogą cytować je bezpośrednio."
      : "Brak wyraźnych danych liczbowych w tekście. Umieść statystyki i fakty w tekście (nie tylko w obrazach) do cytowania przez AI.",
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
    heading_hierarchy: 0,  // Advisory only — not a ranking factor (iPullRank: heading order is UX, not GEO signal)
    passage_optimization: 10,  // NEW — iPullRank Ch.10 core concept
    tldr_summary: 12,
    faq_section: 12,
    semantic_chunking: 10,      // NEW — iPullRank Ch.9 core concept
    entity_richness: 8,         // NEW — iPullRank Ch.9 NER
    readability: 5,             // NEW — iPullRank Ch.9 Flesch-Kincaid
    semantic_triples: 5,        // v3 — NLP-quality SPO density
    first_paragraph_answer: 8,  // NEW — Perplexity L3 reranker signal
    intent_blocks: 6,           // NEW — Perplexity intent coverage
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
  const typeLabel = pageType === "article" ? "artykuł" : pageType === "product-listing" ? "strona kategorii" : "strona";
  if (score >= 80)
    return `Treść jest dobrze ustrukturyzowana pod cytowanie przez AI — dobry chunking semantyczny, bogactwo encji i treści Q&A.`;
  const missing: string[] = [];
  if (!hasTldr && !["product", "product-listing"].includes(pageType)) missing.push("podsumowanie TL;DR");
  if (!hasFaq) missing.push("sekcja FAQ");
  if (wordCount < 300) missing.push("więcej treści");
  if (missing.length > 0)
    return `Brakuje kluczowych elementów GEO dla tej ${typeLabel}: ${missing.join(", ")}.`;
  return `Wynik struktury treści: ${score}/100. Skup się na chunkingu semantycznym, bogactwie encji i optymalizacji fragmentów.`;
}
