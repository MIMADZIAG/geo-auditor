import { invokeLLM, type Message } from "../_core/llm";
import type { AuditFindings, AuditCheck } from "./types";
import type { ScrapedPage } from "./scraper";

// ─── LLM Recommendation Types ────────────────────────────────────────────────

export interface LLMRecommendation {
  id: string;
  category: string;
  priority: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  howToFix: string;
  impact: string;
  codeSnippet?: {
    language: "json" | "html" | "markdown" | "text";
    label: string;
    code: string;
  };
  isPersonalized: true;
}

export interface LLMRecommendationsResult {
  recommendations: LLMRecommendation[];
  aiInsight: string; // 2–3 sentence overall AI-readiness summary
  topPriority: string; // The single most impactful action
  scoreGain: number; // Estimated score increase (1–15 pts) after implementing topPriority
  difficulty: "easy" | "medium" | "hard"; // Implementation difficulty
}

// ─── Context Assembly ─────────────────────────────────────────────────────────

function buildPageContext(
  page: ScrapedPage,
  findings: AuditFindings,
  pageType?: string,
  detectedSchemas?: Array<{ type: string }>
): string {
  const $ = page.$;

  // Extract meaningful text content (first 2000 chars)
  const bodyText = $("body")
    .clone()
    .find("script, style, nav, footer, header, aside")
    .remove()
    .end()
    .text()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);

  // Extract headings
  const headings: string[] = [];
  $("h1, h2, h3").each((_, el) => {
    const tag = el.tagName.toLowerCase();
    const text = $(el).text().trim();
    if (text) headings.push(`${tag.toUpperCase()}: ${text}`);
  });

  // Extract existing JSON-LD (first 500 chars per block)
  const jsonldBlocks: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const content = $(el).html()?.trim();
    if (content) jsonldBlocks.push(content.slice(0, 500));
  });

  // Extract all detected schema types — use the explicitly passed schemas if available,
  // otherwise fall back to findings (which may not have schemas after stripping)
  const structuredDataFindings = findings.structuredData as { checks: AuditCheck[]; schemas?: Array<{ type: string }> };
  const rawSchemas = detectedSchemas ?? structuredDataFindings.schemas ?? [];
  const detectedSchemaTypes: string[] = Array.from(new Set(rawSchemas.map((s) => s.type)));

  // Build a subtype-aware display: NewsArticle → Article (NewsArticle), etc.
  const SUBTYPE_MAP: Record<string, string> = {
    NewsArticle: "Article (NewsArticle)",
    BlogPosting: "Article (BlogPosting)",
    TechArticle: "Article (TechArticle)",
    MedicalWebPage: "WebPage (MedicalWebPage)",
    AboutPage: "WebPage (AboutPage)",
    ContactPage: "WebPage (ContactPage)",
    ItemPage: "WebPage (ItemPage)",
    CollectionPage: "WebPage (CollectionPage)",
    SearchResultsPage: "WebPage (SearchResultsPage)",
  };
  const displaySchemaTypes = detectedSchemaTypes.map((t) => SUBTYPE_MAP[t] ?? t);

  // Extract meta description
  const metaDesc =
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") ||
    "";

  // Build failed checks summary
  const failedChecks: string[] = [];
  for (const [catKey, catData] of Object.entries(findings)) {
    for (const check of catData.checks as AuditCheck[]) {
      if (check.status === "fail" || check.status === "warning") {
        failedChecks.push(`[${catKey}] ${check.label}: ${check.description}`);
      }
    }
  }

  return `
URL: ${page.finalUrl}
Page Title: ${page.title}
Meta Description: ${metaDesc || "(missing)"}
HTTPS: ${page.isHttps ? "Yes" : "No"}
Response Time: ${page.responseTimeMs}ms

--- HEADING STRUCTURE ---
${headings.slice(0, 15).join("\n") || "(no headings found)"}

--- DETECTED SCHEMA TYPES (already present on page — DO NOT suggest adding these) ---
${displaySchemaTypes.length > 0 ? displaySchemaTypes.join(", ") : "(none found)"}
Raw types: ${detectedSchemaTypes.length > 0 ? detectedSchemaTypes.join(", ") : "(none found)"}

--- EXISTING JSON-LD RAW (first 500 chars per block) ---
${jsonldBlocks.length > 0 ? jsonldBlocks.join("\n---\n") : "(none found)"}

--- PAGE CONTENT EXCERPT ---
${bodyText || "(could not extract text)"}

--- AUDIT SCORES ---
Overall: ${Object.values(findings).reduce((sum, c) => sum + c.score, 0) / 6 | 0}/100
Technical: ${findings.technical.score}/100
Structured Data: ${findings.structuredData.score}/100
Content Structure: ${findings.contentStructure.score}/100
E-E-A-T: ${findings.eeat.score}/100
AI Crawlers: ${findings.aiCrawlers.score}/100
Meta Tags: ${findings.metaTags.score}/100

--- FAILED/WARNING CHECKS ---
${failedChecks.slice(0, 20).join("\n") || "(all checks passed)"}
`.trim();
}

// ─── LLM Schema ──────────────────────────────────────────────────────────────

const LLM_RESPONSE_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "geo_audit_recommendations",
    strict: true,
    schema: {
      type: "object",
      properties: {
        aiInsight: {
          type: "string",
          description:
            "2–3 sentence personalized AI-readiness assessment for this specific page, mentioning the page topic and most critical gaps.",
        },
        topPriority: {
          type: "string",
          description:
            "One sentence describing the single most impactful action the owner should take first. Base it ONLY on the detected issues listed in the audit context — do not invent new problems.",
        },
        scoreGain: {
          type: "integer",
          description:
            "Estimated score increase in points (1–15) after implementing the topPriority fix. Base this on the severity of the issue: critical issues = 6–15 pts, high = 4–8 pts, medium = 2–5 pts, low = 1–3 pts.",
        },
        difficulty: {
          type: "string",
          enum: ["easy", "medium", "hard"],
          description:
            "Implementation difficulty of the topPriority fix. Use 'easy' for changes doable in a CMS/WordPress without a developer (e.g., adding text, meta tags, FAQ section) — typically 5–15 min. Use 'medium' for changes requiring a developer ~30 min (e.g., adding JSON-LD schema, fixing robots.txt). Use 'hard' for changes requiring a developer 2h+ (e.g., fixing render-blocking scripts, major structural refactoring).",
        },
        recommendations: {
          type: "array",
          description: "3–5 personalized, actionable recommendations with code snippets where applicable.",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              category: {
                type: "string",
                enum: [
                  "Structured Data",
                  "Content Structure",
                  "E-E-A-T",
                  "Technical",
                  "Meta Tags",
                  "AI Crawler Access",
                ],
              },
              priority: {
                type: "string",
                enum: ["critical", "high", "medium", "low"],
              },
              title: { type: "string" },
              description: { type: "string" },
              howToFix: { type: "string" },
              impact: { type: "string" },
              hasCodeSnippet: { type: "boolean" },
              codeSnippetLanguage: {
                type: "string",
                enum: ["json", "html", "markdown", "text"],
              },
              codeSnippetLabel: { type: "string" },
              codeSnippetCode: { type: "string" },
            },
            required: [
              "id",
              "category",
              "priority",
              "title",
              "description",
              "howToFix",
              "impact",
              "hasCodeSnippet",
              "codeSnippetLanguage",
              "codeSnippetLabel",
              "codeSnippetCode",
            ],
            additionalProperties: false,
          },
        },
      },
      required: ["aiInsight", "topPriority", "scoreGain", "difficulty", "recommendations"],
      additionalProperties: false,
    },
  },
};

// ─── Main Function ────────────────────────────────────────────────────────────

export async function generateLLMRecommendations(
  page: ScrapedPage,
  findings: AuditFindings,
  pageType?: string,
  detectedSchemas?: Array<{ type: string }>
): Promise<LLMRecommendationsResult> {
  const pageContext = buildPageContext(page, findings, pageType, detectedSchemas);

  const systemPrompt = `Jesteś ekspertem w GEO (Generative Engine Optimization) i AEO (Answer Engine Optimization).
Twoim zadaniem jest analiza wyników audytu strony internetowej i generowanie wysoce spersonalizowanych, wykonalnych rekomendacji
w celu poprawy jej widoczności w silnikach wyszukiwania opartych na AI, takich jak ChatGPT, Perplexity, Google AI Overviews i Claude.

KRYTYCZNE ZASADY:
1. Bądź KONKRETNY dla tej konkretnej strony — wspominaj rzeczywisty tytuł strony, temat i treść w swoich rekomendacjach.
2. Dla rekomendacji JSON-LD generuj KOMPLETNY, POPRAWNY, GOTOWY DO UŻYCIA kod dostosowany do rzeczywistej treści strony.
3. Dla rekomendacji HTML podaj dokładny kod, który użytkownik może skopiować i wkleić.
4. Priorytetyzuj 3–5 najbardziej wpływowych ulepszen na podstawie wyników audytu.
5. Pisz prostym językiem zrozumiałym dla nietechńicznego właściciela strony.
6. Zawsze wyjaśnij, DLACZEGO każda poprawka ma znaczenie dla widoczności w AI.
7. NIGDY nie sugeruj dodania typu schematu, który jest już wymieniony w "WYKRYTE TYPY SCHEMATU". Jeśli Product jest już obecny, NIE zalecaj dodawania schematu Product.
8. KRYTYCZNE: podtypy schematu liczą się jako ich typ nadrzędny. Jeśli wykryto NewsArticle, NIE sugeruj dodawania Article — NewsArticle JEST Article. Jeśli wykryto BlogPosting, NIE sugeruj dodawania Article. Jeśli wykryto LocalBusiness, NIE sugeruj dodawania Organization — LocalBusiness JEST Organization.
9. Jeśli strona ma już JSON-LD, ulepsz lub ROZSZERZ go zamiast zastępować. Skup się na tym, czego BRAKUJE.
10. Skup się na lukach, które będą miały najwyższy wpływ na wskaźniki cytowania przez AI.
11. Jeśli typ schematu jest już obecny, uznaj to i zaproponuj ulepszenia (np. brakujące właściwości, dodanie FAQPage, dodanie sameAs) zamiast ponownego dodawania.
12. Jeśli schemat Organization jest już obecny (bezpośrednio lub przez właściwość publisher w Article/NewsArticle), NIE zalecaj ponownego dodawania Organization.
13. WSZYSTKIE odpowiedzi tekstowe (aiInsight, topPriority, title, description, howToFix, impact, codeSnippetLabel) MUSZĄ być w języku POLSKIM. Kod (codeSnippetCode) może być po angielsku (JSON-LD, HTML).`;

  const userPrompt = `Analyze this web page audit and generate personalized GEO recommendations:

${pageContext}

Generate 3–5 specific, personalized recommendations. For each one that involves JSON-LD or HTML changes, 
provide the COMPLETE, READY-TO-USE code snippet tailored to this specific page's content and topic.
The code must be immediately usable — fill in real values based on the page title, URL, and content you can see.`;

  const response = await invokeLLM({
    // gpt-4o: supports json_schema Structured Outputs; gpt-5.4 does not yet
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: LLM_RESPONSE_SCHEMA,
  });

   const rawContent = response.choices[0]?.message?.content;
  if (!rawContent) {
    throw new Error("LLM returned empty response");
  }
  const parsed = JSON.parse(rawContent as string) as {
    aiInsight: string;
    topPriority: string;
    scoreGain: number;
    difficulty: "easy" | "medium" | "hard";
    recommendations: Array<{
      id: string;
      category: string;
      priority: "critical" | "high" | "medium" | "low";
      title: string;
      description: string;
      howToFix: string;
      impact: string;
      hasCodeSnippet: boolean;
      codeSnippetLanguage: "json" | "html" | "markdown" | "text";
      codeSnippetLabel: string;
      codeSnippetCode: string;
    }>;
  };

  const recommendations: LLMRecommendation[] = parsed.recommendations.map((rec) => ({
    id: `llm_${rec.id}`,
    category: rec.category,
    priority: rec.priority,
    title: rec.title,
    description: rec.description,
    howToFix: rec.howToFix,
    impact: rec.impact,
    isPersonalized: true as const,
    ...(rec.hasCodeSnippet && rec.codeSnippetCode
      ? {
          codeSnippet: {
            language: rec.codeSnippetLanguage,
            label: rec.codeSnippetLabel,
            code: rec.codeSnippetCode,
          },
        }
      : {}),
  }));

  return {
    recommendations,
    aiInsight: parsed.aiInsight,
    topPriority: parsed.topPriority,
    scoreGain: Math.min(15, Math.max(1, parsed.scoreGain ?? 5)),
    difficulty: parsed.difficulty ?? "medium",
  };
}
