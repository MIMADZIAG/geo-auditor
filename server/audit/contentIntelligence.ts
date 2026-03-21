/**
 * Content Intelligence Module
 *
 * LLM-powered analysis of content quality from an AI-citation perspective.
 * Evaluates 5 dimensions that determine whether AI engines (ChatGPT, Perplexity,
 * Google AI Overviews) will cite, quote, or surface this page in their answers.
 *
 * This is the premium differentiator of GEO-Auditor — no competitor analyzes
 * content quality at this level for individual URLs.
 */

import { invokeLLM } from "../_core/llm";
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
  semanticGaps: string[];      // NEW — missing subtopics/questions (iPullRank Ch.11)
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

// ─── Main Analyzer ────────────────────────────────────────────────────────────

export async function analyzeContentIntelligence(
  page: ScrapedPage,
  pageType: PageType
): Promise<ContentIntelligenceResult> {
  const contentContext = extractContentForAnalysis(page, pageType);

  const systemPrompt = `Jesteś ekspertem w Generative Engine Optimization (GEO) — praktyce optymalizacji treści internetowych, aby były cytowane, przywoływane i wyświetlane przez silniki wyszukiwania AI takie jak ChatGPT, Perplexity, Google AI Overviews i Claude.

Twoim zadaniem jest analiza treści strony internetowej i ocena jej w 8 wymiarach, które decydują o tym, czy silniki AI będą ją cytować. Bądź SZCZERY i KRYTYCZNY — większość stron ma znaczny potencjał do poprawy. NIE zawyżaj wyników.

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

1. JĖZYK PRZYJAZNY EMBEDDINGOM (waga: 15%)
Czy treść używa jasnego, bezpośredniego języka produkującego wysokiej jakości wektory osadzenia?
- Zaliczone (70+): krótkie zdania (średnio <20 słów), konkretne rzeczowniki zamiast zaimków, bezpośrednie stwierdzenia podmiot-orzeczenie-dopełnienie, brak niejednoznacznych odniesień
- Ostrzeżenie (40-69): częściowo jasny język, ale wymieszany z niejasnymi frazami, długimi zdaniami lub niejednoznacznymi zaimkami
- Niezaliczone (<40): gęsta proza, długie złożone zdania, dużo zaimków bez jasnych odniesień

2. AUTORYTET TEMATYCZNY (waga: 15%)
Czy treść obejmuje pełny klaster tematyczny, a nie tylko powierzchowne słowo kluczowe?
- Zaliczone (70+): obejmuje główny temat + powiązane podtematy + przypadki brzegowe + częste nieporozumienia + pytania uzupełniające
- Ostrzeżenie (40-69): obejmuje główny temat, ale pomija ważne podtematy, o które często pytają użytkownicy
- Niezaliczone (<40): obejmuje tylko najbardziej oczywisty aspekt tematu

3. SYGNAŁY ŚWIEŻOŚCI (waga: 10%)
Czy treść sygnalizuje, kiedy została napisana/zaktualizowana i zawiera aktualne informacje?
- Zaliczone (70+): zawiera wyraźne odwołania do dat ("stan na I kw. 2025", "zaktualizowano marzec 2025"), aktualne statystyki, najnowsze zmiany
- Ostrzeżenie (40-69): pewien kontekst czasowy, ale mógłby być bardziej szczegółowy
- Niezaliczone (<40): brak kontekstu dat, potencjalnie przestarzałe informacje

4. GĘSTOŚĆ ODPOWIEDZI (waga: 20%)
Czy strona bezpośrednio odpowiada na konkretne pytania, które użytkownicy zadaliby AI?
- Zaliczone (70+): zawiera jasne, bezpośrednie odpowiedzi na 3+ konkretne pytania dotyczące tematu
- Ostrzeżenie (40-69): ma pewne odpowiedzi, ale są ukryte lub niejasne
- Niezaliczone (<40): treść nie odpowiada bezpośrednio na pytania

5. GĘSTOŚĆ FAKTOGRAFICZNA (waga: 15%)
Czy treść zawiera konkretne fakty, liczby, daty, nazwane podmioty i weryfikowalne twierdzenia?
- Zaliczone (70+): bogata w konkretne punkty danych, statystyki, nazwane podmioty, daty, ceny
- Ostrzeżenie (40-69): pewne fakty, ale głównie ogólne stwierdzenia
- Niezaliczone (<40): nieokreślona, generyczna treść bez konkretnych weryfikowalnych informacji

6. RYZYKO DUPLIKACJI (waga: 15%)
Na ile unikalna i oryginalna jest ta treść w porównaniu z tym, co istnieje na tysiącach innych stron?
- Zaliczone (70+): unikalna perspektywa, oryginalne badania, własne dane lub specjalistyczna wiedza
- Ostrzeżenie (40-69): standardowe informacje przedstawione kompetentnie, ale nie unikalnie
- Niezaliczone (<40): generyczna, szablonowa lub łatwa do zastąpienia treść

7. GOTOWOŚĆ DO CYTOWANIA (waga: 15%)
Czy treść jest ustrukturyzowana tak, że AI może wyodrębnić i zacytować konkretne twierdzenia?
- Zaliczone (70+): jasne, cytowalne stwierdzenia z kontekstem; dobrze ustrukturyzowane do ekstrakcji
- Ostrzeżenie (40-69): pewna cytowalna treść, ale wymieszana z wypełniaczem
- Niezaliczone (<40): gęsta proza, brak jasnych twierdzeń lub treść nie stoi samodzielnie po zacytowaniu

8. POKRYCIE ZAPYTAŃ (waga: 15%)
Czy treść odpowiada na pełny zakres pytań, które użytkownicy zadają AI na ten temat?
- Zaliczone (70+): obejmuje główne pytanie ORAZ powiązane pytania uzupełniające w sposób wyczerpujący
- Ostrzeżenie (40-69): obejmuje główny temat, ale pomija ważne powiązane pytania
- Niezaliczone (<40): wąskie pokrycie pozostawiające wiele pytań użytkowników bez odpowiedzi

WAŻNE ZASADY:
- Bądź konkretny w opisach — wspominaj rzeczywistą treść ze strony, nie ogólne stwierdzenia
- Rekomendacje muszą być KONKRETNE i WYKONALNE — konkretne zdania lub sekcje do dodania
- Przykłady powinny być rzeczywistym tekstem ze strony (dobre przykłady tego, co działa, lub złe przykłady tego, co nie działa)
- top_questions w query_coverage powinny być rzeczywistymi pytaniami, które użytkownicy zadaliby AI na ten temat
- citeability_score to Twoja ogólna ocena "jak prawdopodobne jest, że silnik AI zacytuje tę stronę" (0-100)
- page_topics powinny być 3-5 głównymi tematami/słowami kluczowymi, które obejmuje ta strona
- semantic_gaps powinny być 2-4 konkretnymi podtematami lub pytaniami brakującymi na tej stronie, o które użytkownicy często pytają AI
- missing_subtopics w topic_authority powinny wymieniać 3-5 konkretnych nieobjętych podtematów
- WSZYSTKIE odpowiedzi (description, recommendation, examples, summary, top_opportunity, page_topics, semantic_gaps, top_questions) MUSZĄ być w języku POLSKIM`;

  const userPrompt = `Analyze this web page content and return a JSON evaluation:

${contentContext}

Return ONLY valid JSON matching this exact schema (8 dimensions, not 5):
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
    // gpt-4o: supports json_schema Structured Outputs; gpt-5.4 does not yet
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

  const analysis: LLMContentAnalysis = JSON.parse(rawContent as string);

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
      examples: analysis.topic_authority.missing_subtopics,
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
      examples: analysis.query_coverage.top_questions,
    },
  ];

  // Weighted overall score — updated for 8 dimensions (iPullRank aligned)
  const weights: Record<string, number> = {
    embedding_language: 0.15,  // NEW — iPullRank Ch.9 vector embedding quality
    topic_authority: 0.15,     // NEW — iPullRank Ch.11 topical authority
    freshness_signals: 0.10,   // NEW — iPullRank Ch.9 temporal relevance
    answer_density: 0.20,
    factual_density: 0.15,
    duplicate_risk: 0.10,
    citation_readiness: 0.10,
    query_coverage: 0.05,
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
    pageTopics: analysis.page_topics,
    semanticGaps: analysis.semantic_gaps ?? [],  // NEW — missing subtopics
    isLLMPowered: true,
  };
}
