/**
 * Content Intelligence Module
 *
 * LLM-powered analysis of content quality from an AI-citation perspective.
 * Evaluates 8 dimensions that determine whether AI engines (ChatGPT, Perplexity,
 * Google AI Overviews) will cite, quote, or surface this page in their answers.
 *
 * Language enforcement: ALL LLM outputs (descriptions, recommendations, top_questions,
 * page_topics, semantic_gaps) are generated in the NATIVE LANGUAGE of the audited page.
 * Detection priority: html[lang] attr > TLD > Polish character heuristic > default "en".
 */

import { invokeLLM } from "../_core/llm";
import { safeParseLLMJson } from "../utils/jsonSanitizer";
import { computeCosineSimilarity, extractQuerySignal, getOpenAIApiKey } from "./cosineSimilarity";
import type { ScrapedPage } from "./scraper";
import type { PageType } from "./pageTypeDetector";
import type { CheckStatus } from "./types";

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface ContentIntelligenceCheck {
  id: string;
  label: string;
  score: number;       // 0–100 per check
  status: CheckStatus;
  description: string; // What was found
  recommendation: string; // Specific, actionable fix
  impact: "high" | "medium" | "low";
  examples?: string[]; // Concrete examples from the page (good or bad)
}

export interface ContentIntelligenceResult {
  overallScore: number;        // 0–100 weighted average
  citeabilityScore: number;    // 0–100 "how likely is an AI to cite this page"
  checks: ContentIntelligenceCheck[];
  summary: string;             // 1–2 sentence overall assessment
  topOpportunity: string;      // Single most impactful improvement
  pageTopics: string[];        // Detected main topics (for virality/sharing)
  semanticGaps: string[];      // Missing subtopics/questions (iPullRank Ch.11)
  detectedLanguage: string;    // ISO 639-1 language code detected for this page
  /** Cosine similarity score (0–100) between query signal and content body.
   * Present when OpenAI embeddings API is available. null = not computed. */
  cosineSimilarityScore: number | null;
  /** Raw cosine similarity value (0–1) for debugging */
  cosineSimilarityRaw: number | null;
  isLLMPowered: true;
}

// ─── LLM Schema ──────────────────────────────────────────────────────────────

interface LLMContentAnalysis {
  embedding_language: {
    score: number;
    status: "pass" | "warning" | "fail";
    description: string;
    recommendation: string;
  };
  topic_authority: {
    score: number;
    status: "pass" | "warning" | "fail";
    description: string;
    recommendation: string;
    missing_subtopics: string[];
  };
  freshness_signals: {
    score: number;
    status: "pass" | "warning" | "fail";
    description: string;
    recommendation: string;
  };
  answer_density: {
    score: number;
    status: "pass" | "warning" | "fail";
    description: string;
    recommendation: string;
    examples: string[];
  };
  factual_density: {
    score: number;
    status: "pass" | "warning" | "fail";
    description: string;
    recommendation: string;
    examples: string[];
  };
  duplicate_risk: {
    score: number;
    status: "pass" | "warning" | "fail";
    description: string;
    recommendation: string;
  };
  citation_readiness: {
    score: number;
    status: "pass" | "warning" | "fail";
    description: string;
    recommendation: string;
    examples: string[];
  };
  query_coverage: {
    score: number;
    status: "pass" | "warning" | "fail";
    description: string;
    recommendation: string;
    top_questions: string[];
  };
  overall_summary: string;
  top_opportunity: string;
  citeability_score: number;
  page_topics: string[];
  semantic_gaps: string[];
}

// ─── Language Detection ───────────────────────────────────────────────────────

/**
 * TLD → ISO 639-1 language code mapping.
 * Country-code TLDs are strong signals for page language.
 * Shared with citation/worker.ts — keep in sync.
 */
const TLD_LANG_MAP: Record<string, string> = {
  pl: "pl", de: "de", fr: "fr", es: "es", it: "it",
  nl: "nl", ru: "ru", pt: "pt", cs: "cs", sk: "sk",
  hu: "hu", ro: "ro", bg: "bg", hr: "hr", sl: "sl",
  sv: "sv", no: "no", da: "da", fi: "fi",
};

/**
 * Detect the native language of a page.
 * Priority: html[lang] attr > TLD > Polish character heuristic > "en" default.
 *
 * @param html  Raw HTML string of the page
 * @param url   Page URL (used for TLD detection)
 * @returns     ISO 639-1 language code, e.g. "pl", "de", "en"
 */
export function detectPageLanguageForCI(html: string, url: string): string {
  // 1. html[lang] attribute — most authoritative signal
  const langAttrMatch = html.match(/<html[^>]+lang=["']([a-zA-Z-]+)["']/i);
  if (langAttrMatch) {
    const lang = langAttrMatch[1].toLowerCase().split("-")[0];
    if (lang && lang !== "und" && lang !== "zxx") return lang;
  }

  // 2. TLD-based detection — country-code TLDs are strong language signals
  const tldMatch = url.match(/\.([a-z]{2,3})(?:\/|\?|#|$)/i);
  if (tldMatch) {
    const tldLang = TLD_LANG_MAP[tldMatch[1].toLowerCase()];
    if (tldLang) return tldLang;
  }

  // 3. Polish character heuristic — scan full HTML (not just first N chars)
  //    Category/product pages often have JS/CSS before visible text
  const hasPolish = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(html);
  if (hasPolish) return "pl";

  return "en";
}

// ─── Language-aware Prompt Builder ────────────────────────────────────────────

/**
 * Returns the human-readable language label for use in LLM prompts.
 */
function getLangLabel(lang: string): string {
  const labels: Record<string, string> = {
    pl: "Polish (język polski)",
    de: "German (Deutsch)",
    fr: "French (Français)",
    es: "Spanish (Español)",
    it: "Italian (Italiano)",
    nl: "Dutch (Nederlands)",
    ru: "Russian (Русский)",
    pt: "Portuguese (Português)",
    cs: "Czech (Čeština)",
    sk: "Slovak (Slovenčina)",
    hu: "Hungarian (Magyar)",
    ro: "Romanian (Română)",
    sv: "Swedish (Svenska)",
    no: "Norwegian (Norsk)",
    da: "Danish (Dansk)",
    fi: "Finnish (Suomi)",
  };
  return labels[lang] ?? `the page's native language (${lang})`;
}

/**
 * Build the language enforcement section for the CI system prompt.
 * Uses CRITICAL marker + concrete examples to prevent the model from
 * defaulting to English for non-English pages.
 */
function buildLangEnforcementNote(lang: string): string {
  const label = getLangLabel(lang);

  if (lang === "en") {
    return `LANGUAGE: Generate ALL outputs (descriptions, recommendations, examples, top_questions, page_topics, semantic_gaps, overall_summary, top_opportunity) in ENGLISH.`;
  }

  const polishExamples = lang === "pl"
    ? `\nExample top_questions in Polish: ["Jak wybrać płytki do łazienki?", "Jakie płytki są najlepsze do małej łazienki?", "Ile kosztują płytki ceramiczne?"]
Example semantic_gaps in Polish: ["porównanie materiałów płytek", "montaż i układanie płytek krok po kroku"]
Example page_topics in Polish: ["płytki ceramiczne", "remont łazienki", "wykończenie wnętrz"]`
    : "";

  return `CRITICAL LANGUAGE REQUIREMENT:
The audited page is in ${label}. You MUST generate ALL outputs in ${label}.
This applies to EVERY field: descriptions, recommendations, examples, top_questions, page_topics, semantic_gaps, overall_summary, top_opportunity.
NEVER use English in any output field. Every single string MUST be in ${label}.${polishExamples}`;
}

/**
 * Build the full system prompt for Content Intelligence analysis.
 * The prompt adapts to the detected page language.
 */
function buildSystemPrompt(lang: string): string {
  const langNote = buildLangEnforcementNote(lang);

  // Polish system prompt (most common use case for this product)
  if (lang === "pl") {
    return `Jesteś ekspertem w Generative Engine Optimization (GEO) — praktyce optymalizacji treści internetowych, aby były cytowane, przywoływane i wyświetlane przez silniki wyszukiwania AI takie jak ChatGPT, Perplexity, Google AI Overviews i Claude.

Twoim zadaniem jest analiza treści strony internetowej i ocena jej w 8 wymiarach, które decydują o tym, czy silniki AI będą ją cytować. Bądź SZCZERY i KRYTYCZNY — większość stron ma znaczny potencjał do poprawy. NIE zawyżaj wyników.

${langNote}

WSKAZÓWNIKI OCENIANIA (bądź surowy):
- 80–100: Doskonały — treść jest naprawdę warta cytowania przez silniki AI
- 60–79: Dobry — solidny, ale brakuje kilku kluczowych elementów
- 40–59: Średnio — znaczące luki zmniejszają prawdopodobieństwo cytowania
- 20–39: Słaby — poważne problemy uniemożliwiające cytowanie przez AI
- 0–19: Krytyczny — treść prawdopodobnie nigdy nie zostanie zacytowana przez silniki AI

KLUCZOWY WNIOSEK Z BADAŃ NAD AI SEARCH:
Silniki AI takie jak ChatGPT, Perplexity i Google AI Overviews używają gęstych wektorów osadzenia do pobierania treści. NIE dopasowują tylko słów kluczowych — dopasowują znaczenie semantyczne. Treść musi być:
1. Napisana jasnym, przyjaznym embeddingom językiem (krótkie zdania, bezpośrednie stwierdzenia, brak niejednoznacznych zaimków)
2. Bogata semantycznie (nazwane podmioty, trójki podmiot-orzeczenie-dopełnienie, konkretne fakty)
3. Autorytatywna tematycznie (obejmuje pełny klaster tematyczny, nie tylko powierzchowny poziom)
4. Aktualna i zakotwiczona czasowo (daty, "stan na 2025", najnowsze dane)
5. Zoptymalizowana pod kątem fragmentów (każdy akapit = jedna samodzielna idea, która może być wyodrębniona niezależnie)

8 WYMIARÓW DO OCENY:

1. JĘZYK PRZYJAZNY EMBEDDINGOM (waga: 15%)
Czy treść używa jasnego, bezpośredniego języka produkującego wysokiej jakości wektory osadzenia?
- Zaliczone (70+): krótkie zdania (średnio <20 słów), konkretne rzeczowniki zamiast zaimków, bezpośrednie stwierdzenia podmiot-orzeczenie-dopełnienie
- Ostrzeżenie (40-69): częściowo jasny język, ale wymieszany z niejasnymi frazami lub długimi zdaniami
- Niezaliczone (<40): gęsta proza, długie złożone zdania, dużo zaimków bez jasnych odniesień

2. AUTORYTET TEMATYCZNY (waga: 15%)
Czy treść obejmuje pełny klaster tematyczny, a nie tylko powierzchowne słowo kluczowe?
- Zaliczone (70+): obejmuje główny temat + powiązane podtematy + przypadki brzegowe + pytania uzupełniające
- Ostrzeżenie (40-69): obejmuje główny temat, ale pomija ważne podtematy
- Niezaliczone (<40): obejmuje tylko najbardziej oczywisty aspekt tematu

3. SYGNAŁY ŚWIEŻOŚCI (waga: 10%)
Czy treść sygnalizuje aktualność i zawiera świeże informacje?
- Zaliczone (70+): wyraźne odwołania do dat, aktualne statystyki, najnowsze zmiany
- Ostrzeżenie (40-69): pewien kontekst czasowy, ale mógłby być bardziej szczegółowy
- Niezaliczone (<40): brak kontekstu dat, potencjalnie przestarzałe informacje

4. GĘSTOŚĆ ODPOWIEDZI (waga: 20%)
Czy strona bezpośrednio odpowiada na konkretne pytania użytkowników AI?
- Zaliczone (70+): jasne, bezpośrednie odpowiedzi na 3+ konkretne pytania
- Ostrzeżenie (40-69): ma pewne odpowiedzi, ale są ukryte lub niejasne
- Niezaliczone (<40): treść nie odpowiada bezpośrednio na pytania

5. GĘSTOŚĆ FAKTOGRAFICZNA (waga: 15%)
Czy treść zawiera konkretne fakty, liczby, daty, nazwane podmioty?
- Zaliczone (70+): bogata w konkretne punkty danych, statystyki, ceny
- Ostrzeżenie (40-69): pewne fakty, ale głównie ogólne stwierdzenia
- Niezaliczone (<40): nieokreślona, generyczna treść bez konkretnych informacji

6. RYZYKO DUPLIKACJI (waga: 10%)
Na ile unikalna i oryginalna jest ta treść?
- Zaliczone (70+): unikalna perspektywa, oryginalne dane lub specjalistyczna wiedza
- Ostrzeżenie (40-69): standardowe informacje przedstawione kompetentnie, ale nie unikalnie
- Niezaliczone (<40): generyczna, szablonowa treść

7. GOTOWOŚĆ DO CYTOWANIA (waga: 10%)
Czy treść jest ustrukturyzowana tak, że AI może wyodrębnić i zacytować konkretne twierdzenia?
- Zaliczone (70+): jasne, cytowalne stwierdzenia z kontekstem
- Ostrzeżenie (40-69): pewna cytowalna treść, ale wymieszana z wypełniaczem
- Niezaliczone (<40): gęsta proza, brak jasnych twierdzeń

8. POKRYCIE ZAPYTAŃ (waga: 5%)
Czy treść odpowiada na pełny zakres pytań użytkowników AI?
- Zaliczone (70+): obejmuje główne pytanie ORAZ powiązane pytania uzupełniające
- Ostrzeżenie (40-69): obejmuje główny temat, ale pomija ważne powiązane pytania
- Niezaliczone (<40): wąskie pokrycie

WAŻNE ZASADY:
- Bądź konkretny w opisach — wspominaj rzeczywistą treść ze strony
- Rekomendacje muszą być KONKRETNE i WYKONALNE
- top_questions w query_coverage: RZECZYWISTE pytania po polsku, które użytkownicy wpisują w ChatGPT/Perplexity/Google AI dla tej strony
- citeability_score: ogólna ocena "jak prawdopodobne jest, że silnik AI zacytuje tę stronę" (0-100)
- page_topics: 3-5 głównych tematów/słów kluczowych po polsku
- semantic_gaps: 2-4 konkretnych podtematów lub pytań brakujących na tej stronie po polsku
- missing_subtopics w topic_authority: 3-5 konkretnych nieobjętych podtematów po polsku
- WSZYSTKIE odpowiedzi MUSZĄ być w języku POLSKIM`;
  }

  // Generic English/other language prompt
  return `You are an expert in Generative Engine Optimization (GEO) — the practice of optimizing web content to be cited, referenced, and surfaced by AI search engines like ChatGPT, Perplexity, Google AI Overviews, and Claude.

Your task: Analyze web page content and evaluate it across 8 dimensions that determine whether AI engines will cite it. Be HONEST and CRITICAL — most pages have significant room for improvement. Do NOT inflate scores.

${langNote}

SCORING GUIDELINES (be strict):
- 80–100: Excellent — content is genuinely worth citing by AI engines
- 60–79: Good — solid, but missing a few key elements
- 40–59: Average — significant gaps reduce citation likelihood
- 20–39: Poor — serious issues preventing AI citation
- 0–19: Critical — content will likely never be cited by AI engines

KEY INSIGHT FROM AI SEARCH RESEARCH:
AI engines like ChatGPT, Perplexity, and Google AI Overviews use dense embedding vectors for retrieval. They do NOT just match keywords — they match semantic meaning. Content must be:
1. Written in clear, embedding-friendly language (short sentences, direct statements, no ambiguous pronouns)
2. Semantically rich (named entities, subject-predicate-object triples, concrete facts)
3. Topically authoritative (covers the full topic cluster, not just surface level)
4. Fresh and time-anchored (dates, "as of 2025", latest data)
5. Fragment-optimized (each paragraph = one standalone idea that can be extracted independently)

8 DIMENSIONS TO EVALUATE:

1. EMBEDDING-FRIENDLY LANGUAGE (weight: 15%)
Does the content use clear, direct language that produces high-quality embedding vectors?
- Pass (70+): short sentences (avg <20 words), concrete nouns instead of pronouns, direct subject-predicate-object statements
- Warning (40-69): partially clear language mixed with vague phrases or long sentences
- Fail (<40): dense prose, long complex sentences, many pronouns without clear references

2. TOPICAL AUTHORITY (weight: 15%)
Does the content cover the full topic cluster, not just a surface keyword?
- Pass (70+): covers main topic + related subtopics + edge cases + follow-up questions
- Warning (40-69): covers main topic but misses important subtopics
- Fail (<40): covers only the most obvious aspect of the topic

3. FRESHNESS SIGNALS (weight: 10%)
Does the content signal when it was written/updated and contain current information?
- Pass (70+): explicit date references, current statistics, latest changes
- Warning (40-69): some temporal context but could be more specific
- Fail (<40): no date context, potentially outdated information

4. ANSWER DENSITY (weight: 20%)
Does the page directly answer specific questions users would ask AI?
- Pass (70+): clear, direct answers to 3+ specific questions about the topic
- Warning (40-69): has some answers but they are buried or unclear
- Fail (<40): content does not directly answer questions

5. FACTUAL DENSITY (weight: 15%)
Does the content contain specific facts, numbers, dates, named entities, and verifiable claims?
- Pass (70+): rich in specific data points, statistics, named entities, dates, prices
- Warning (40-69): some facts but mostly general statements
- Fail (<40): vague, generic content without specific verifiable information

6. DUPLICATION RISK (weight: 10%)
How unique and original is this content compared to what exists on thousands of other pages?
- Pass (70+): unique perspective, original research, proprietary data or specialized expertise
- Warning (40-69): standard information presented competently but not uniquely
- Fail (<40): generic, templated, or easily replaceable content

7. CITATION READINESS (weight: 10%)
Is the content structured so AI can extract and cite specific claims?
- Pass (70+): clear, citable statements with context; well-structured for extraction
- Warning (40-69): some citable content mixed with filler
- Fail (<40): dense prose, no clear claims, or content doesn't stand alone when cited

8. QUERY COVERAGE (weight: 5%)
Does the content answer the full range of questions users ask AI on this topic?
- Pass (70+): covers the main question AND related follow-up questions comprehensively
- Warning (40-69): covers main topic but misses important related questions
- Fail (<40): narrow coverage leaving many user questions unanswered

IMPORTANT RULES:
- Be specific in descriptions — mention actual content from the page, not generic statements
- Recommendations must be CONCRETE and ACTIONABLE — specific sentences or sections to add
- top_questions in query_coverage: REAL questions in the page's native language that users type into ChatGPT/Perplexity/Google AI for this page's topic
- citeability_score: overall "how likely is an AI engine to cite this page" (0-100)
- page_topics: 3-5 main topics/keywords in the page's native language
- semantic_gaps: 2-4 specific subtopics or questions missing from this page, in the page's native language
- missing_subtopics in topic_authority: 3-5 specific uncovered subtopics in the page's native language
- ALL outputs MUST be in ${getLangLabel(lang)}`;
}

// ─── Content Extraction ───────────────────────────────────────────────────────

function extractContentForAnalysis(page: ScrapedPage, pageType: PageType): string {
  const $ = page.$;

  // Clone to avoid mutating the original
  const $clone = $.root().clone();
  $clone.find("script, style, nav, footer, header, aside, noscript, .cookie-banner, .popup, [aria-hidden='true']").remove();

  const title = page.title || $clone.find("title").text().trim();
  const h1 = $clone.find("h1").first().text().trim();
  const metaDesc = $clone.find('meta[name="description"]').attr("content") || "";

  // Extract headings structure
  const headings: string[] = [];
  $clone.find("h2, h3").each((_, el) => {
    const text = $(el).text().trim();
    if (text) headings.push(`${el.tagName.toUpperCase()}: ${text}`);
  });

  // Extract main body text (first 3000 words to stay within LLM context)
  const bodyText = $clone.find("body").text().replace(/\s+/g, " ").trim();
  const words = bodyText.split(/\s+/);
  const truncatedBody = words.slice(0, 3000).join(" ");

  // Extract any FAQ-like Q&A pairs
  const faqPairs: string[] = [];
  $clone.find("h3, h4, dt, [class*='question'], [class*='faq']").each((_, el) => {
    const question = $(el).text().trim();
    const answer = $(el).next().text().trim().slice(0, 200);
    if (question && answer && question.includes("?")) {
      faqPairs.push(`Q: ${question}\nA: ${answer}`);
    }
  });

  return `
PAGE URL: ${page.finalUrl}
PAGE TITLE: ${title}
META DESCRIPTION: ${metaDesc}
PAGE TYPE: ${pageType}
H1: ${h1}

HEADING STRUCTURE:
${headings.slice(0, 20).join("\n") || "(none)"}

FAQ/Q&A PAIRS FOUND:
${faqPairs.slice(0, 5).join("\n\n") || "(none)"}

MAIN CONTENT (first 3000 words):
${truncatedBody}
`.trim();
}

// ─── Post-generation Language Validation ─────────────────────────────────────

/**
 * Validate that generated string arrays are in the expected language.
 * Returns filtered arrays — items in wrong language are removed.
 * If too many items are filtered, logs a warning.
 */
function validateLanguageOfStrings(
  items: string[],
  expectedLang: string,
  fieldName: string,
  url: string
): string[] {
  if (expectedLang !== "pl" || items.length === 0) return items;

  const polishCharRe = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;
  const polishWordRe = /\b(jak|co|czy|jaki|jakie|gdzie|kiedy|ile|który|dlaczego|najlepszy|najlepsze|pomóż|wybrać|porównanie|ranking|poradnik|wady|zalety|tanie|tani|opinie|strona|treść|sekcja|dodaj|zawiera|brakuje|należy|można|warto|jest|są|ma|mają|nie|tak|oraz|lub|ale|więcej|mniej)\b/i;

  const filtered = items.filter(item =>
    polishCharRe.test(item) || polishWordRe.test(item)
  );

  if (filtered.length < Math.ceil(items.length / 2)) {
    console.warn(
      `[CI] Language validation: ${fieldName} for ${url} — ` +
      `only ${filtered.length}/${items.length} items appear to be in Polish. ` +
      `Model may have ignored language instruction.`
    );
    // Return original items rather than empty array — better to have wrong language
    // than empty fields, but log the issue for monitoring
    return items;
  }

  return filtered.length > 0 ? filtered : items;
}

// ─── Main Analyzer ────────────────────────────────────────────────────────────

export async function analyzeContentIntelligence(
  page: ScrapedPage,
  pageType: PageType
): Promise<ContentIntelligenceResult> {
  // Detect page language BEFORE building the prompt
  const detectedLanguage = detectPageLanguageForCI(page.html, page.finalUrl || page.url);
  console.log(`[CI] Language detected: "${detectedLanguage}" for ${page.finalUrl || page.url}`);

  // ── Cosine Similarity (Task 3 — Mike King / iPullRank) ────────────────────
  // Run in parallel with LLM call — independent, non-blocking
  const $ = page.$;
  const h1Text = $('h1').first().text().trim();
  const $clone = $.root().clone();
  $clone.find('script, style, nav, footer, header, aside, noscript').remove();
  const bodyText = $clone.find('body').text().replace(/\s+/g, ' ').trim();

  const querySignal = extractQuerySignal(h1Text, bodyText);
  const openAIKey = getOpenAIApiKey();

  // Fire cosine similarity and LLM analysis in parallel
  const [cosineResult] = await Promise.all([
    openAIKey ? computeCosineSimilarity(querySignal, bodyText, openAIKey) : Promise.resolve(null),
  ]);

  const contentContext = extractContentForAnalysis(page, pageType);
  const systemPrompt = buildSystemPrompt(detectedLanguage);

  const userPrompt = `Analyze this web page content and return a JSON evaluation:

${contentContext}

Return ONLY valid JSON matching this exact schema (8 dimensions):
{
  "embedding_language": {
    "score": <0-100>,
    "status": <"pass"|"warning"|"fail">,
    "description": "<assessment of sentence clarity, pronoun usage, and directness>",
    "recommendation": "<specific language improvements for better vector embeddings>"
  },
  "topic_authority": {
    "score": <0-100>,
    "status": <"pass"|"warning"|"fail">,
    "description": "<how comprehensively the topic cluster is covered>",
    "recommendation": "<specific subtopics to add for full topical authority>",
    "missing_subtopics": ["<subtopic 1>", "<subtopic 2>", "<subtopic 3>"]
  },
  "freshness_signals": {
    "score": <0-100>,
    "status": <"pass"|"warning"|"fail">,
    "description": "<temporal context and currency of information>",
    "recommendation": "<how to add date context and fresh data>"
  },
  "answer_density": {
    "score": <0-100>,
    "status": <"pass"|"warning"|"fail">,
    "description": "<what you found — be specific, mention actual content>",
    "recommendation": "<concrete, actionable fix with specific examples>",
    "examples": ["<actual text from page that works well or poorly>"]
  },
  "factual_density": {
    "score": <0-100>,
    "status": <"pass"|"warning"|"fail">,
    "description": "<specific facts found or missing>",
    "recommendation": "<what specific data to add>",
    "examples": ["<actual numbers/facts found or missing>"]
  },
  "duplicate_risk": {
    "score": <0-100>,
    "status": <"pass"|"warning"|"fail">,
    "description": "<how unique/generic this content is>",
    "recommendation": "<how to differentiate this content>"
  },
  "citation_readiness": {
    "score": <0-100>,
    "status": <"pass"|"warning"|"fail">,
    "description": "<how extractable/quotable the content is>",
    "recommendation": "<how to restructure for AI citation>",
    "examples": ["<example of a citable or non-citable passage>"]
  },
  "query_coverage": {
    "score": <0-100>,
    "status": <"pass"|"warning"|"fail">,
    "description": "<what questions are covered and what's missing>",
    "recommendation": "<specific questions to add content for>",
    "top_questions": ["<question 1>", "<question 2>", "<question 3>", "<question 4>", "<question 5>"]
  },
  "overall_summary": "<1-2 sentences: honest overall assessment of AI-citation potential>",
  "top_opportunity": "<single most impactful improvement that would most increase AI citation likelihood>",
  "citeability_score": <0-100>,
  "page_topics": ["<topic 1>", "<topic 2>", "<topic 3>"],
  "semantic_gaps": ["<missing subtopic/question 1>", "<missing subtopic/question 2>"]
}`;

  // Add extracted schema signals to context for better LLM analysis
  const schemaSignals = (() => {
    const scripts = page.$("script[type='application/ld+json']").toArray();
    const types: string[] = [];
    for (const s of scripts) {
      try {
        const json = JSON.parse(page.$(s).html() ?? "{}");
        const t = json["@type"] ?? json["@graph"]?.[0]?.["@type"];
        if (t) types.push(Array.isArray(t) ? t.join(", ") : String(t));
      } catch { /* ignore */ }
    }
    return types.length > 0 ? `SCHEMA TYPES FOUND: ${types.join(", ")}` : "SCHEMA TYPES: none";
  })();

  const response = await invokeLLM({
    // gpt-4o: supports json_schema Structured Outputs
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `${userPrompt}\n\n${schemaSignals}` },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "content_intelligence_analysis",
        strict: true,
        schema: {
          type: "object",
          properties: {
            embedding_language: {
              type: "object",
              properties: {
                score: { type: "number" },
                status: { type: "string", enum: ["pass", "warning", "fail"] },
                description: { type: "string" },
                recommendation: { type: "string" },
              },
              required: ["score", "status", "description", "recommendation"],
              additionalProperties: false,
            },
            topic_authority: {
              type: "object",
              properties: {
                score: { type: "number" },
                status: { type: "string", enum: ["pass", "warning", "fail"] },
                description: { type: "string" },
                recommendation: { type: "string" },
                missing_subtopics: { type: "array", items: { type: "string" } },
              },
              required: ["score", "status", "description", "recommendation", "missing_subtopics"],
              additionalProperties: false,
            },
            freshness_signals: {
              type: "object",
              properties: {
                score: { type: "number" },
                status: { type: "string", enum: ["pass", "warning", "fail"] },
                description: { type: "string" },
                recommendation: { type: "string" },
              },
              required: ["score", "status", "description", "recommendation"],
              additionalProperties: false,
            },
            answer_density: {
              type: "object",
              properties: {
                score: { type: "number" },
                status: { type: "string", enum: ["pass", "warning", "fail"] },
                description: { type: "string" },
                recommendation: { type: "string" },
                examples: { type: "array", items: { type: "string" } },
              },
              required: ["score", "status", "description", "recommendation", "examples"],
              additionalProperties: false,
            },
            factual_density: {
              type: "object",
              properties: {
                score: { type: "number" },
                status: { type: "string", enum: ["pass", "warning", "fail"] },
                description: { type: "string" },
                recommendation: { type: "string" },
                examples: { type: "array", items: { type: "string" } },
              },
              required: ["score", "status", "description", "recommendation", "examples"],
              additionalProperties: false,
            },
            duplicate_risk: {
              type: "object",
              properties: {
                score: { type: "number" },
                status: { type: "string", enum: ["pass", "warning", "fail"] },
                description: { type: "string" },
                recommendation: { type: "string" },
              },
              required: ["score", "status", "description", "recommendation"],
              additionalProperties: false,
            },
            citation_readiness: {
              type: "object",
              properties: {
                score: { type: "number" },
                status: { type: "string", enum: ["pass", "warning", "fail"] },
                description: { type: "string" },
                recommendation: { type: "string" },
                examples: { type: "array", items: { type: "string" } },
              },
              required: ["score", "status", "description", "recommendation", "examples"],
              additionalProperties: false,
            },
            query_coverage: {
              type: "object",
              properties: {
                score: { type: "number" },
                status: { type: "string", enum: ["pass", "warning", "fail"] },
                description: { type: "string" },
                recommendation: { type: "string" },
                top_questions: { type: "array", items: { type: "string" } },
              },
              required: ["score", "status", "description", "recommendation", "top_questions"],
              additionalProperties: false,
            },
            overall_summary: { type: "string" },
            top_opportunity: { type: "string" },
            citeability_score: { type: "number" },
            page_topics: { type: "array", items: { type: "string" } },
            semantic_gaps: { type: "array", items: { type: "string" } },
          },
          required: [
            "embedding_language", "topic_authority", "freshness_signals",
            "answer_density", "factual_density", "duplicate_risk",
            "citation_readiness", "query_coverage",
            "overall_summary", "top_opportunity", "citeability_score", "page_topics", "semantic_gaps"
          ],
          additionalProperties: false,
        },
      },
    },
  });

  const rawContent = response.choices?.[0]?.message?.content;
  if (!rawContent) throw new Error("LLM returned empty content for Content Intelligence");

  const analysis: LLMContentAnalysis = safeParseLLMJson<LLMContentAnalysis>(rawContent as string, {} as LLMContentAnalysis);

  // ── Post-generation language validation ───────────────────────────────────
  // Validate that key string arrays are in the expected language.
  // This catches cases where the model ignored the language instruction.
  const pageUrl = page.finalUrl || page.url;
  const validatedTopQuestions = validateLanguageOfStrings(
    analysis.query_coverage.top_questions,
    detectedLanguage,
    "top_questions",
    pageUrl
  );
  const validatedPageTopics = validateLanguageOfStrings(
    analysis.page_topics,
    detectedLanguage,
    "page_topics",
    pageUrl
  );
  const validatedSemanticGaps = validateLanguageOfStrings(
    analysis.semantic_gaps ?? [],
    detectedLanguage,
    "semantic_gaps",
    pageUrl
  );
  const validatedMissingSubtopics = validateLanguageOfStrings(
    analysis.topic_authority.missing_subtopics,
    detectedLanguage,
    "missing_subtopics",
    pageUrl
  );

  // Build structured checks
  const checks: ContentIntelligenceCheck[] = [
    {
      id: "embedding_language",
      label: "Język przyjazny embeddingom",
      score: Math.round(analysis.embedding_language.score),
      status: analysis.embedding_language.status,
      description: analysis.embedding_language.description,
      recommendation: analysis.embedding_language.recommendation,
      impact: "high",
    },
    {
      id: "topic_authority",
      label: "Autorytet tematyczny i pokrycie",
      score: Math.round(analysis.topic_authority.score),
      status: analysis.topic_authority.status,
      description: analysis.topic_authority.description,
      recommendation: analysis.topic_authority.recommendation,
      impact: "high",
      examples: validatedMissingSubtopics,
    },
    {
      id: "freshness_signals",
      label: "Sygnały świeżości i aktualności",
      score: Math.round(analysis.freshness_signals.score),
      status: analysis.freshness_signals.status,
      description: analysis.freshness_signals.description,
      recommendation: analysis.freshness_signals.recommendation,
      impact: "medium",
    },
    {
      id: "answer_density",
      label: "Gęstość odpowiedzi",
      score: Math.round(analysis.answer_density.score),
      status: analysis.answer_density.status,
      description: analysis.answer_density.description,
      recommendation: analysis.answer_density.recommendation,
      impact: "high",
      examples: analysis.answer_density.examples,
    },
    {
      id: "factual_density",
      label: "Gęstość faktograficzna",
      score: Math.round(analysis.factual_density.score),
      status: analysis.factual_density.status,
      description: analysis.factual_density.description,
      recommendation: analysis.factual_density.recommendation,
      impact: "high",
      examples: analysis.factual_density.examples,
    },
    {
      id: "duplicate_risk",
      label: "Unikalność treści",
      score: Math.round(analysis.duplicate_risk.score),
      status: analysis.duplicate_risk.status,
      description: analysis.duplicate_risk.description,
      recommendation: analysis.duplicate_risk.recommendation,
      impact: "high",
    },
    {
      id: "citation_readiness",
      label: "Gotowość do cytowania",
      score: Math.round(analysis.citation_readiness.score),
      status: analysis.citation_readiness.status,
      description: analysis.citation_readiness.description,
      recommendation: analysis.citation_readiness.recommendation,
      impact: "high",
      examples: analysis.citation_readiness.examples,
    },
    {
      id: "query_coverage",
      label: "Pokrycie zapytań",
      score: Math.round(analysis.query_coverage.score),
      status: analysis.query_coverage.status,
      description: analysis.query_coverage.description,
      recommendation: analysis.query_coverage.recommendation,
      impact: "medium",
      examples: validatedTopQuestions,
    },
  ];

  // ── Cosine Similarity check (Task 3 — injected as 9th check) ─────────────
  if (cosineResult !== null) {
    const csScore = cosineResult.score;
    let csStatus: ContentIntelligenceCheck['status'];
    let csDescription: string;
    let csRecommendation: string;

    if (csScore >= 70) {
      csStatus = 'pass';
      csDescription = detectedLanguage === 'pl'
        ? `Wysoka spójność semantyczna (${csScore}/100, cosine: ${cosineResult.rawScore}). Treść strony jest silnie dopasowana do jej głównego tematu (H1 + pierwsze 150 słów). Silniki AI będą pobierać tę stronę dla zapytań powiązanych z jej tematem.`
        : `High semantic alignment (${csScore}/100, cosine: ${cosineResult.rawScore}). Page content is strongly aligned with its primary topic signal. AI engines will retrieve this page for queries related to its topic.`;
      csRecommendation = detectedLanguage === 'pl'
        ? 'Utrzymaj spójność tematyczną — nie rozmywaj treści niezwiązanymi tematami.'
        : 'Maintain topical coherence — avoid diluting content with unrelated topics.';
    } else if (csScore >= 40) {
      csStatus = 'warning';
      csDescription = detectedLanguage === 'pl'
        ? `Umiarkowana spójność semantyczna (${csScore}/100, cosine: ${cosineResult.rawScore}). Treść strony jest częściowo dopasowana do głównego tematu. Silniki AI mogą pobierać tę stronę, ale z niższym rankingiem.`
        : `Moderate semantic alignment (${csScore}/100, cosine: ${cosineResult.rawScore}). Page content is partially aligned with its primary topic. AI engines may retrieve this page but with lower ranking.`;
      csRecommendation = detectedLanguage === 'pl'
        ? `Wzmocnij spójność semantyczną: upewnij się, że H1 i pierwsze 150 słów dokładnie opisują główny temat całej strony. Usuń treści niezwiązane z głównym tematem.`
        : `Improve semantic alignment: ensure H1 and first 150 words precisely describe the main topic of the full page. Remove content unrelated to the primary topic.`;
    } else {
      csStatus = 'fail';
      csDescription = detectedLanguage === 'pl'
        ? `Niska spójność semantyczna (${csScore}/100, cosine: ${cosineResult.rawScore}). Treść strony jest słabo dopasowana do jej deklarowanego tematu. Silniki AI będą miały trudności z pobraniem tej strony dla odpowiednich zapytań.`
        : `Low semantic alignment (${csScore}/100, cosine: ${cosineResult.rawScore}). Page content is poorly aligned with its declared topic. AI engines will struggle to retrieve this page for relevant queries.`;
      csRecommendation = detectedLanguage === 'pl'
        ? `Krytyczna niezgodność semantyczna: H1 i pierwsze 150 słów muszą być silnie powiązane z całą treścią. Przepisz wstęp tak, aby bezpośrednio zapowiadał główną treść strony. Rozważ podzielenie strony na bardziej tematycznie spójne podstrony.`
        : `Critical semantic mismatch: H1 and first 150 words must strongly relate to the full content. Rewrite the introduction to directly preview the page's main content. Consider splitting the page into more topically focused subpages.`;
    }

    checks.push({
      id: 'cosine_similarity',
      label: detectedLanguage === 'pl' ? 'Spójność semantyczna (Cosine Similarity)' : 'Semantic Alignment (Cosine Similarity)',
      score: csScore,
      status: csStatus,
      description: csDescription,
      recommendation: csRecommendation,
      impact: 'high',
    });
  }

  // ── Weighted overall score — Task 4 rebalance (King/Yeşilyurt/Petrovic) ───
  // cosine_similarity: 0.25 (dominant — only when available)
  // entity_richness: 0.20 (elevated from 0.15)
  // answer_density: 0.12 (reduced from 0.20)
  // freshness_signals: 0.15 (elevated from 0.10)
  // Other dimensions scaled proportionally to sum to 1.0
  const hasCosine = cosineResult !== null;

  const weights: Record<string, number> = hasCosine ? {
    // With cosine similarity — 9 dimensions, sum = 1.0
    cosine_similarity:  0.25, // ← dominant (Mike King)
    answer_density:     0.12, // ↓ reduced from 0.20
    factual_density:    0.12, // ↓ reduced from 0.15
    embedding_language: 0.10, // ↓ reduced from 0.15
    topic_authority:    0.12, // ↓ reduced from 0.15
    freshness_signals:  0.15, // ↑ elevated from 0.10 (Metehan)
    duplicate_risk:     0.06, // ↓ reduced from 0.10
    citation_readiness: 0.05, // ↓ reduced from 0.10
    query_coverage:     0.03, // ↓ reduced from 0.05
  } : {
    // Without cosine similarity — 8 dimensions, sum = 1.0
    answer_density:     0.20, // original weight
    factual_density:    0.15,
    embedding_language: 0.15,
    topic_authority:    0.15,
    freshness_signals:  0.15, // ↑ elevated from 0.10
    duplicate_risk:     0.10,
    citation_readiness: 0.08, // ↓ slightly reduced
    query_coverage:     0.02, // ↓ slightly reduced
  };

  const overallScore = Math.round(
    checks.reduce((sum, check) => sum + check.score * (weights[check.id] ?? 0), 0)
  );

  return {
    overallScore,
    citeabilityScore: Math.round(analysis.citeability_score),
    checks,
    summary: analysis.overall_summary,
    topOpportunity: analysis.top_opportunity,
    pageTopics: validatedPageTopics,
    semanticGaps: validatedSemanticGaps,
    detectedLanguage,
    cosineSimilarityScore: cosineResult?.score ?? null,
    cosineSimilarityRaw: cosineResult?.rawScore ?? null,
    isLLMPowered: true,
  };
}
