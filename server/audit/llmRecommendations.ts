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
}

// ─── Context Assembly ─────────────────────────────────────────────────────────

function buildPageContext(
  page: ScrapedPage,
  findings: AuditFindings,
  pageType?: string
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

  // Extract all detected schema types from the structured data analysis
  const structuredDataFindings = findings.structuredData as { checks: AuditCheck[]; schemas?: Array<{ type: string }> };
  const detectedSchemaTypes: string[] = structuredDataFindings.schemas
    ? Array.from(new Set(structuredDataFindings.schemas.map((s) => s.type)))
    : [];

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

--- DETECTED SCHEMA TYPES (already present on page) ---
${detectedSchemaTypes.length > 0 ? detectedSchemaTypes.join(", ") : "(none found)"}

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
            "One sentence describing the single most impactful action the owner should take first.",
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
      required: ["aiInsight", "topPriority", "recommendations"],
      additionalProperties: false,
    },
  },
};

// ─── Main Function ────────────────────────────────────────────────────────────

export async function generateLLMRecommendations(
  page: ScrapedPage,
  findings: AuditFindings,
  pageType?: string
): Promise<LLMRecommendationsResult> {
  const pageContext = buildPageContext(page, findings, pageType);

  const systemPrompt = `You are an expert in GEO (Generative Engine Optimization) and AEO (Answer Engine Optimization). 
Your task is to analyze a web page's audit results and generate highly personalized, actionable recommendations 
to improve its visibility in AI-powered search engines like ChatGPT, Perplexity, Google AI Overviews, and Claude.

CRITICAL RULES:
1. Be SPECIFIC to this exact page — mention the actual page title, topic, and content in your recommendations.
2. For JSON-LD recommendations, generate COMPLETE, VALID, READY-TO-USE code tailored to the page's actual content.
3. For HTML recommendations, provide exact code the user can copy-paste.
4. Prioritize the 3–5 most impactful improvements based on the audit scores.
5. Write in plain language that a non-technical website owner can understand.
6. Always explain WHY each fix matters for AI visibility specifically.
7. NEVER suggest adding a schema type that is already listed under "DETECTED SCHEMA TYPES". If Product is already present, do NOT recommend adding Product schema.
8. If the page already has JSON-LD, improve or EXTEND it rather than replacing it. Focus on what is MISSING.
9. Focus on gaps that will have the highest impact on AI citation rates.
10. If a schema type is already present, acknowledge it and suggest improvements (e.g., missing properties) rather than re-adding it.`;

  const userPrompt = `Analyze this web page audit and generate personalized GEO recommendations:

${pageContext}

Generate 3–5 specific, personalized recommendations. For each one that involves JSON-LD or HTML changes, 
provide the COMPLETE, READY-TO-USE code snippet tailored to this specific page's content and topic.
The code must be immediately usable — fill in real values based on the page title, URL, and content you can see.`;

  const response = await invokeLLM({
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
  };
}
