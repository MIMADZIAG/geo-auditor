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

  const systemPrompt = `You are an expert in Generative Engine Optimization (GEO) — the practice of optimizing web content to be cited, quoted, and surfaced by AI search engines like ChatGPT, Perplexity, Google AI Overviews, and Claude.

Your task is to analyze a web page's content and evaluate it across 8 dimensions that determine whether AI engines will cite it. Be HONEST and CRITICAL — most pages have significant room for improvement. Do NOT give inflated scores.

SCORING GUIDELINES (be strict):
- 80–100: Excellent — this content is genuinely citation-worthy for AI engines
- 60–79: Good — solid but missing some key elements
- 40–59: Fair — significant gaps that reduce citation likelihood
- 20–39: Poor — major issues that prevent AI citation
- 0–19: Critical — content is unlikely to ever be cited by AI engines

KEY INSIGHT FROM AI SEARCH RESEARCH (iPullRank AI Search Manual):
AI engines like ChatGPT, Perplexity, and Google AI Overviews use dense vector embeddings to retrieve content. They do NOT just keyword-match — they match semantic meaning. Content must be:
1. Written in clear, embedding-friendly language (short sentences, direct statements, no ambiguous pronouns)
2. Semantically rich (named entities, subject-predicate-object triples, specific facts)
3. Topically authoritative (covers the full topic cluster, not just surface-level)
4. Fresh and temporally anchored (dates, "as of 2025", recent data)
5. Passage-optimized (each paragraph = one self-contained idea that can be extracted independently)

THE 8 DIMENSIONS TO EVALUATE:

1. EMBEDDING-FRIENDLY LANGUAGE (weight: 15%)
Does the content use clear, direct language that produces high-quality vector embeddings?
- Pass (70+): Short sentences (avg <20 words), specific nouns instead of pronouns, direct subject-predicate-object statements, no ambiguous references
- Warning (40-69): Some clear language but mixed with vague phrases, long sentences, or ambiguous pronouns ("it", "this", "they" without clear referents)
- Fail (<40): Dense prose, long complex sentences, heavy use of pronouns without clear referents — this produces poor vector embeddings that don't match user queries

2. TOPIC AUTHORITY (weight: 15%)
Does the content cover the full topic cluster, not just the surface-level keyword?
- Pass (70+): Covers main topic + related subtopics + edge cases + common misconceptions + follow-up questions
- Warning (40-69): Covers main topic but misses important related subtopics that users frequently ask about
- Fail (<40): Covers only the most obvious aspect of the topic — AI engines prefer comprehensive topical coverage

3. FRESHNESS SIGNALS (weight: 10%)
Does the content signal when it was written/updated and contain current information?
- Pass (70+): Contains explicit date references ("as of Q1 2025", "updated March 2025"), current statistics, recent developments
- Warning (40-69): Some temporal context but could be more specific
- Fail (<40): No date context, potentially outdated information, no temporal anchoring — AI engines deprioritize content that may be stale

4. ANSWER DENSITY (weight: 20%)
Does the page directly answer specific questions users would ask an AI? 
- Pass (70+): Contains clear, direct answers to 3+ specific questions about the topic
- Warning (40-69): Has some answers but they're buried or vague
- Fail (<40): Content doesn't answer questions directly; requires users to "figure it out"

5. FACTUAL DENSITY (weight: 15%)
Does the content contain specific facts, numbers, dates, named entities, and verifiable claims?
- Pass (70+): Rich with specific data points, statistics, named entities, dates, prices
- Warning (40-69): Some facts but mostly general statements
- Fail (<40): Vague, generic content without specific verifiable information

6. DUPLICATE RISK (weight: 15%)
How unique and original is this content vs. what already exists on thousands of other pages?
- Pass (70+): Unique perspective, original research, proprietary data, or specialized expertise
- Warning (40-69): Standard information presented competently but not uniquely
- Fail (<40): Generic, templated, or easily replaceable content

7. CITATION READINESS (weight: 15%)
Is the content structured so that an AI can extract and cite specific claims?
- Pass (70+): Clear, quotable statements with context; well-structured for extraction
- Warning (40-69): Some citable content but mixed with filler
- Fail (<40): Dense prose, no clear claims, or content that doesn't stand alone when quoted

8. QUERY COVERAGE (weight: 15%)
Does the content address the full range of questions users ask AI about this topic?
- Pass (70+): Covers the main question AND related follow-up questions comprehensively
- Warning (40-69): Covers the main topic but misses important related questions
- Fail (<40): Narrow coverage that leaves many user questions unanswered

IMPORTANT RULES:
- Be specific in descriptions — mention actual content from the page, not generic statements
- Recommendations must be CONCRETE and ACTIONABLE — specific sentences or sections to add
- Examples should be actual text from the page (good examples of what works, or bad examples of what doesn't)
- top_questions in query_coverage should be the actual questions users would ask AI about this topic
- citeability_score is your overall assessment of "how likely is an AI engine to cite this page" (0-100)
- page_topics should be 3-5 main topics/keywords this page covers (used for social sharing)
- semantic_gaps should be 2-4 specific subtopics or questions that are missing from this page but users frequently ask AI about this topic
- missing_subtopics in topic_authority should list 3-5 specific subtopics not covered`;

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
      label: "Embedding-Friendly Language",
      score: Math.round(analysis.embedding_language.score),
      status: analysis.embedding_language.status,
      description: analysis.embedding_language.description,
      recommendation: analysis.embedding_language.recommendation,
      impact: "high",
    },
    {
      id: "topic_authority",
      label: "Topic Authority & Coverage",
      score: Math.round(analysis.topic_authority.score),
      status: analysis.topic_authority.status,
      description: analysis.topic_authority.description,
      recommendation: analysis.topic_authority.recommendation,
      impact: "high",
      examples: analysis.topic_authority.missing_subtopics,
    },
    {
      id: "freshness_signals",
      label: "Freshness & Temporal Signals",
      score: Math.round(analysis.freshness_signals.score),
      status: analysis.freshness_signals.status,
      description: analysis.freshness_signals.description,
      recommendation: analysis.freshness_signals.recommendation,
      impact: "medium",
    },
    {
      id: "answer_density",
      label: "Answer Density",
      score: Math.round(analysis.answer_density.score),
      status: analysis.answer_density.status,
      description: analysis.answer_density.description,
      recommendation: analysis.answer_density.recommendation,
      impact: "high",
      examples: analysis.answer_density.examples,
    },
    {
      id: "factual_density",
      label: "Factual Density",
      score: Math.round(analysis.factual_density.score),
      status: analysis.factual_density.status,
      description: analysis.factual_density.description,
      recommendation: analysis.factual_density.recommendation,
      impact: "high",
      examples: analysis.factual_density.examples,
    },
    {
      id: "duplicate_risk",
      label: "Content Uniqueness",
      score: Math.round(analysis.duplicate_risk.score),
      status: analysis.duplicate_risk.status,
      description: analysis.duplicate_risk.description,
      recommendation: analysis.duplicate_risk.recommendation,
      impact: "high",
    },
    {
      id: "citation_readiness",
      label: "Citation Readiness",
      score: Math.round(analysis.citation_readiness.score),
      status: analysis.citation_readiness.status,
      description: analysis.citation_readiness.description,
      recommendation: analysis.citation_readiness.recommendation,
      impact: "high",
      examples: analysis.citation_readiness.examples,
    },
    {
      id: "query_coverage",
      label: "Query Coverage",
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
