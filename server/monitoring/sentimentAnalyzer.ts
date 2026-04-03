/**
 * Sentiment Analyzer — AI Citation Response Sentiment
 *
 * Analyzes the tone and content of AI engine responses that mention a brand/URL.
 * Runs after citation job completes, as a non-blocking enrichment step.
 *
 * Architecture:
 *   - Input: array of CitationResult with responseText
 *   - One batched LLM call per citation job (not per check) — cost efficient
 *   - Output: SentimentAnalysisResult with per-engine breakdown + aggregate
 *
 * Cost: ~$0.0008 per citation job (GPT-4o-mini, ~800 tokens input/output)
 * Latency: ~600ms (non-blocking — runs after monitoring email is sent)
 *
 * Metrics computed:
 *   sentimentScore     -1.0 to +1.0 (negative / neutral / positive)
 *   sentimentLabel     "positive" | "neutral" | "negative"
 *   themes             string[] — key themes extracted from AI responses
 *   avgMentionPosition float — 1.0 = first sentence, higher = later in response
 *   prominenceRate     fraction of responses where brand appears in first paragraph
 *   shareOfVoice       our citations / total citations across all queries
 *   topCompetitors     ranked list with citation count
 */

import { invokeLLM } from "../_core/llm";
import { safeParseLLMJson } from "../utils/jsonSanitizer";
import type { CitationResult } from "../citation/worker";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EnginesentimentResult {
  engine: string;
  cited: boolean;
  sentimentScore: number | null;   // -1.0 to +1.0, null if not cited
  snippet: string | null;          // best snippet from this engine
  themes: string[];                // themes extracted from this engine's responses
  mentionPosition: number | null;  // 1.0 = first sentence, null if not cited
  isLeadMention: boolean;          // brand in first paragraph
}

export interface SentimentAnalysisResult {
  // Aggregate across all cited engines
  sentimentScore: number;          // -1.0 to +1.0
  sentimentLabel: "positive" | "neutral" | "negative";
  themes: string[];                // deduplicated, sorted by frequency
  avgMentionPosition: number | null;
  prominenceRate: number;          // 0.0–1.0
  // Share of Voice
  shareOfVoice: number;            // 0.0–1.0
  competitorCitationCount: number;
  topCompetitorDomains: { domain: string; count: number; sentimentScore?: number }[];
  // Per-engine breakdown
  engineBreakdown: Record<string, EnginesentimentResult>;
  // Sample responses for Sentiment Dashboard (max 3, one per engine)
  sampleResponses: {
    engine: string;
    query: string;
    responseText: string;
    sentimentScore: number | null;
    themes: string[];
  }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Estimate mention position in response text.
 * Returns 1.0 if brand appears in first sentence, up to 5.0+ for later mentions.
 * Returns null if brand not found.
 */
function estimateMentionPosition(responseText: string, domain: string): number | null {
  if (!responseText || !domain) return null;

  // Extract bare domain name for matching (e.g. "example.com" → "example")
  const domainParts = domain.replace(/^www\./, "").split(".");
  const brandName = domainParts[0] ?? domain;
  const searchTerms = [domain, brandName].filter(Boolean);

  const lower = responseText.toLowerCase();
  let firstIndex = -1;
  for (const term of searchTerms) {
    const idx = lower.indexOf(term.toLowerCase());
    if (idx !== -1 && (firstIndex === -1 || idx < firstIndex)) {
      firstIndex = idx;
    }
  }

  if (firstIndex === -1) return null;

  // Split into sentences and find which sentence contains the mention
  const sentences = responseText.split(/[.!?]+/).filter(s => s.trim().length > 0);
  let charCount = 0;
  for (let i = 0; i < sentences.length; i++) {
    charCount += sentences[i].length + 1;
    if (charCount >= firstIndex) {
      return i + 1; // 1-indexed sentence position
    }
  }
  return sentences.length;
}

/**
 * Check if brand appears in the first paragraph of the response.
 */
function isLeadMention(responseText: string, domain: string): boolean {
  if (!responseText || !domain) return false;
  const firstParagraph = responseText.split(/\n\n/)[0] ?? responseText.substring(0, 500);
  const domainParts = domain.replace(/^www\./, "").split(".");
  const brandName = domainParts[0] ?? domain;
  const lower = firstParagraph.toLowerCase();
  return lower.includes(domain.toLowerCase()) || lower.includes(brandName.toLowerCase());
}

/**
 * Compute Share of Voice from citation results.
 * SoV = (queries where our domain is cited) / (total queries with any citation)
 */
function computeShareOfVoice(
  results: CitationResult[],
  targetDomain: string
): { shareOfVoice: number; competitorCitationCount: number; topCompetitorDomains: { domain: string; count: number }[] } {
  const domainCounts: Record<string, number> = {};
  let queriesWithAnyCitation = 0;
  let queriesWithOurCitation = 0;

  // Group by query to avoid double-counting per-engine
  const queryMap = new Map<string, CitationResult[]>();
  for (const r of results) {
    if (!queryMap.has(r.query)) queryMap.set(r.query, []);
    queryMap.get(r.query)!.push(r);
  }

  for (const [, queryResults] of Array.from(queryMap)) {
    const allDomains = new Set<string>();
    let ourCited = false;

    for (const r of queryResults) {
      // Count competitor domains
      const competitors = (r.competitorDomains ?? []) as string[];
      for (const d of competitors) {
        if (d && d !== targetDomain) {
          allDomains.add(d);
          domainCounts[d] = (domainCounts[d] ?? 0) + 1;
        }
      }
      if (r.isCited === "yes" || r.isCited === "domain") {
        ourCited = true;
      }
    }

    if (allDomains.size > 0 || ourCited) {
      queriesWithAnyCitation++;
    }
    if (ourCited) {
      queriesWithOurCitation++;
    }
  }

  const shareOfVoice = queriesWithAnyCitation > 0
    ? queriesWithOurCitation / queriesWithAnyCitation
    : 0;

  const topCompetitorDomains = Object.entries(domainCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([domain, count]) => ({ domain, count }));

  return {
    shareOfVoice: Math.round(shareOfVoice * 100) / 100,
    competitorCitationCount: Object.keys(domainCounts).length,
    topCompetitorDomains,
  };
}

// ─── LLM Sentiment Batch Call ─────────────────────────────────────────────────

interface LLMSentimentInput {
  engine: string;
  query: string;
  responseText: string;
}

interface LLMSentimentOutput {
  engine: string;
  sentimentScore: number;    // -1.0 to +1.0
  themes: string[];          // max 5 themes
}

/**
 * Batch sentiment analysis via single LLM call.
 * Analyzes up to 8 response snippets (one per engine per top query).
 * Returns per-response sentiment scores and themes.
 */
async function batchAnalyzeSentiment(
  inputs: LLMSentimentInput[]
): Promise<LLMSentimentOutput[]> {
  if (inputs.length === 0) return [];

  // Truncate each response to 400 chars to control token usage
  const truncated = inputs.map((inp, i) => ({
    id: i,
    engine: inp.engine,
    query: inp.query.substring(0, 100),
    text: inp.responseText.substring(0, 400),
  }));

  const prompt = `Analyze the sentiment of these AI search engine responses about a brand/website.
For each response, return:
- sentimentScore: number from -1.0 (very negative) to +1.0 (very positive), 0.0 = neutral
- themes: array of 2-5 key themes/attributes mentioned (e.g. "wysoka jakość", "drogi", "dobra obsługa", "innowacyjny")

Responses to analyze:
${JSON.stringify(truncated, null, 2)}

Return a JSON array with objects: {id: number, engine: string, sentimentScore: number, themes: string[]}
Themes should be in the same language as the response text.`;

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "You are a sentiment analysis expert. Return only valid JSON arrays. Be precise and consistent.",
        },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "sentiment_results",
          strict: true,
          schema: {
            type: "object",
            properties: {
              results: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "integer" },
                    engine: { type: "string" },
                    sentimentScore: { type: "number" },
                    themes: { type: "array", items: { type: "string" } },
                  },
                  required: ["id", "engine", "sentimentScore", "themes"],
                  additionalProperties: false,
                },
              },
            },
            required: ["results"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response?.choices?.[0]?.message?.content;
    if (!content) return [];

    const parsed = safeParseLLMJson(content) as { results?: LLMSentimentOutput[] };
    if (!parsed?.results || !Array.isArray(parsed.results)) return [];

    return parsed.results.map((r: any, fallbackIdx: number) => ({
      engine: r.engine ?? inputs[r.id ?? fallbackIdx]?.engine ?? "unknown",
      sentimentScore: typeof r.sentimentScore === "number"
        ? Math.max(-1, Math.min(1, r.sentimentScore))
        : 0,
      themes: Array.isArray(r.themes) ? r.themes.slice(0, 5) : [],
    }));
  } catch (err) {
    console.warn("[SentimentAnalyzer] LLM call failed:", err);
    return [];
  }
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Analyze sentiment of citation results for a monitored page.
 *
 * @param results     All citation results from a citation job
 * @param targetUrl   The URL being monitored (used to extract domain)
 * @returns           SentimentAnalysisResult — safe to store in visibility_snapshots
 */
export async function analyzeCitationSentiment(
  results: CitationResult[],
  targetUrl: string
): Promise<SentimentAnalysisResult> {
  let targetDomain = "";
  try {
    targetDomain = new URL(targetUrl).hostname.replace(/^www\./, "");
  } catch {
    targetDomain = targetUrl;
  }

  // ── 1. Filter to cited results with responseText ───────────────────────────
  const citedResults = results.filter(
    (r) => (r.isCited === "yes" || r.isCited === "domain") && r.responseText
  );

  // ── 2. Build per-engine best snippet map ──────────────────────────────────
  const engineMap = new Map<string, CitationResult[]>();
  for (const r of citedResults) {
    if (!engineMap.has(r.engine)) engineMap.set(r.engine, []);
    engineMap.get(r.engine)!.push(r);
  }

  // ── 3. Compute SoV from all results (not just cited) ─────────────────────
  const sovData = computeShareOfVoice(results, targetDomain);

  // ── 4. Prepare LLM inputs — best snippet per engine (max 8 total) ─────────
  const llmInputs: LLMSentimentInput[] = [];
  for (const [engine, engineResults] of Array.from(engineMap)) {
    // Pick the result with the longest responseText (most informative)
    const best = engineResults.reduce((a: CitationResult, b: CitationResult) =>
      (b.responseText?.length ?? 0) > (a.responseText?.length ?? 0) ? b : a
    );
    if (best.responseText) {
      llmInputs.push({
        engine,
        query: best.query,
        responseText: best.responseText,
      });
    }
    if (llmInputs.length >= 8) break;
  }

  // ── 5. Run batch sentiment analysis ───────────────────────────────────────
  const llmResults = await batchAnalyzeSentiment(llmInputs);
  const llmByEngine = new Map(llmResults.map(r => [r.engine, r]));

  // ── 6. Build per-engine breakdown ─────────────────────────────────────────
  const engines = ["chatgpt", "google", "perplexity", "gemini"];
  const engineBreakdown: Record<string, EnginesentimentResult> = {};

  for (const engine of engines) {
    const engineResults = engineMap.get(engine) ?? [];
    const cited = engineResults.length > 0;
    const llm = llmByEngine.get(engine);

    // Best snippet: prefer cited result with responseText
    const bestResult = engineResults[0];
    const snippet = bestResult?.snippet ?? bestResult?.responseText?.substring(0, 200) ?? null;

    // Mention position
    const mentionPos = bestResult?.responseText
      ? estimateMentionPosition(bestResult.responseText, targetDomain)
      : null;

    engineBreakdown[engine] = {
      engine,
      cited,
      sentimentScore: llm?.sentimentScore ?? null,
      snippet,
      themes: llm?.themes ?? [],
      mentionPosition: mentionPos,
      isLeadMention: bestResult?.responseText
        ? isLeadMention(bestResult.responseText, targetDomain)
        : false,
    };
  }

  // ── 7. Compute aggregate metrics ──────────────────────────────────────────
  const citedEngineBreakdowns = Object.values(engineBreakdown).filter(e => e.cited);

  // Aggregate sentiment score (average of cited engines with LLM scores)
  const sentimentScores = citedEngineBreakdowns
    .map(e => e.sentimentScore)
    .filter((s): s is number => s !== null);

  const avgSentimentScore = sentimentScores.length > 0
    ? sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length
    : 0;

  const sentimentLabel: "positive" | "neutral" | "negative" =
    avgSentimentScore >= 0.2 ? "positive" :
    avgSentimentScore <= -0.2 ? "negative" : "neutral";

  // Deduplicated themes sorted by frequency
  const themeFreq: Record<string, number> = {};
  for (const e of citedEngineBreakdowns) {
    for (const theme of e.themes) {
      themeFreq[theme] = (themeFreq[theme] ?? 0) + 1;
    }
  }
  const themes = Object.entries(themeFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([theme]) => theme);

  // Average mention position
  const mentionPositions = citedEngineBreakdowns
    .map(e => e.mentionPosition)
    .filter((p): p is number => p !== null);
  const avgMentionPosition = mentionPositions.length > 0
    ? mentionPositions.reduce((a, b) => a + b, 0) / mentionPositions.length
    : null;

  // Prominence rate
  const prominenceRate = citedEngineBreakdowns.length > 0
    ? citedEngineBreakdowns.filter(e => e.isLeadMention).length / citedEngineBreakdowns.length
    : 0;

  // ── 8. Build sample responses for Sentiment Dashboard ─────────────────────
  const sampleResponses = llmInputs
    .filter(inp => llmByEngine.has(inp.engine))
    .slice(0, 4)
    .map(inp => {
      const llm = llmByEngine.get(inp.engine)!;
      return {
        engine: inp.engine,
        query: inp.query,
        responseText: inp.responseText.substring(0, 600),
        sentimentScore: llm.sentimentScore,
        themes: llm.themes,
      };
    });

  return {
    sentimentScore: Math.round(avgSentimentScore * 100) / 100,
    sentimentLabel,
    themes,
    avgMentionPosition: avgMentionPosition !== null
      ? Math.round(avgMentionPosition * 10) / 10
      : null,
    prominenceRate: Math.round(prominenceRate * 100) / 100,
    shareOfVoice: sovData.shareOfVoice,
    competitorCitationCount: sovData.competitorCitationCount,
    topCompetitorDomains: sovData.topCompetitorDomains,
    engineBreakdown,
    sampleResponses,
  };
}
