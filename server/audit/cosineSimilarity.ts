/**
 * Cosine Similarity Module — Mike King / iPullRank methodology
 *
 * Computes the semantic alignment between a page's "query intent signal"
 * (H1 + first 150 words of body text) and the full content body.
 *
 * Why this matters (Mike King, iPullRank):
 *   AI retrieval systems use dense vector embeddings to match content to queries.
 *   A page can have perfect technical SEO but score 0 in AI retrieval if its
 *   embedding vector is semantically distant from the query vector.
 *   Cosine similarity is the ONLY mathematically precise measure of this alignment.
 *
 * Model: OpenAI text-embedding-3-large (3072 dimensions)
 *   - Best-in-class semantic understanding
 *   - Multilingual — handles Polish, German, French, etc.
 *   - Cost: ~$0.00013 per 1K tokens (~$0.0001 per audit)
 *
 * Approach (Opcja C — H1 + first 150 words as "query signal"):
 *   - query_signal = H1 text + first 150 words of body (what AI sees as "topic")
 *   - content_body = full body text (what AI reads for retrieval)
 *   - cosine_similarity = dot(emb_query, emb_content) / (|emb_query| * |emb_content|)
 *
 * Fail-safe: if OpenAI API is unreachable, returns null (non-fatal).
 * The CI module treats null as "not available" and skips this dimension.
 */

import { invokeLLM } from "../_core/llm";

export interface CosineSimilarityResult {
  /** Cosine similarity score 0–1 (higher = better semantic alignment) */
  rawScore: number;
  /** Normalised 0–100 score for display and weighting */
  score: number;
  /** The query signal used (H1 + first 150 words) */
  querySignal: string;
  /** Number of tokens in the content body (approximate) */
  contentTokens: number;
  /** Whether the result is from the live API or a fallback estimate */
  isLive: boolean;
}

// ─── OpenAI Embeddings API ────────────────────────────────────────────────────

const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const EMBEDDING_MODEL = "text-embedding-3-large";
const EMBEDDING_TIMEOUT_MS = 8000;

/**
 * Fetch embeddings for one or two texts in a single API call.
 * Returns an array of float32 vectors, one per input.
 * Throws on API error — caller handles fallback.
 */
async function fetchEmbeddings(
  texts: string[],
  apiKey: string
): Promise<number[][]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS);

  try {
    const res = await fetch(OPENAI_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: texts,
        encoding_format: "float",
        // Reduce dimensions to 512 for cost/speed — still excellent quality
        // text-embedding-3-large supports Matryoshka Representation Learning
        dimensions: 512,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`OpenAI embeddings API error ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await res.json() as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    // Sort by index to guarantee order matches input
    const sorted = data.data.sort((a, b) => a.index - b.index);
    return sorted.map(d => d.embedding);
  } finally {
    clearTimeout(timer);
  }
}

// ─── Math ─────────────────────────────────────────────────────────────────────

/**
 * Compute cosine similarity between two vectors.
 * Both vectors must have the same length.
 * Returns a value in [-1, 1]; for text embeddings typically [0, 1].
 */
function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

/**
 * Normalise cosine similarity to 0–100 score.
 *
 * For text-embedding-3-large with 512 dimensions:
 *   - Same document: ~0.98–1.00
 *   - Highly related: ~0.85–0.95
 *   - Related: ~0.70–0.85
 *   - Loosely related: ~0.55–0.70
 *   - Unrelated: ~0.30–0.55
 *
 * We map [0.55, 0.95] → [0, 100] to make the score actionable.
 * Anything below 0.55 = 0/100 (semantically unrelated).
 * Anything above 0.95 = 100/100 (essentially identical).
 */
function normaliseScore(cosine: number): number {
  const MIN_COSINE = 0.50; // below this = semantically unrelated
  const MAX_COSINE = 0.93; // above this = essentially same document

  if (cosine <= MIN_COSINE) return 0;
  if (cosine >= MAX_COSINE) return 100;

  const normalised = (cosine - MIN_COSINE) / (MAX_COSINE - MIN_COSINE);
  return Math.round(normalised * 100);
}

// ─── Text Preparation ─────────────────────────────────────────────────────────

/**
 * Truncate text to approximately maxTokens tokens.
 * Rough approximation: 1 token ≈ 4 characters for English/Polish.
 * text-embedding-3-large has an 8192 token limit.
 */
function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

/**
 * Extract the "query signal" from a page:
 *   H1 text + first 150 words of body content.
 * This is what AI systems use to understand the page's primary topic.
 */
export function extractQuerySignal(
  h1Text: string,
  bodyText: string
): string {
  const first150Words = bodyText.split(/\s+/).slice(0, 150).join(" ");
  const signal = [h1Text.trim(), first150Words.trim()].filter(Boolean).join(". ");
  return signal;
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Compute cosine similarity between the page's query signal and full content.
 *
 * @param querySignal  H1 + first 150 words (from extractQuerySignal)
 * @param contentBody  Full body text of the page
 * @param apiKey       OpenAI API key
 * @returns            CosineSimilarityResult or null on failure
 */
export async function computeCosineSimilarity(
  querySignal: string,
  contentBody: string,
  apiKey: string
): Promise<CosineSimilarityResult | null> {
  if (!apiKey || !querySignal.trim() || !contentBody.trim()) {
    return null;
  }

  // Truncate to safe token limits
  const truncatedQuery = truncateToTokens(querySignal, 512);
  const truncatedContent = truncateToTokens(contentBody, 7000);
  const contentTokens = Math.round(truncatedContent.length / 4);

  try {
    const embeddings = await fetchEmbeddings([truncatedQuery, truncatedContent], apiKey);

    if (embeddings.length < 2) {
      throw new Error("Expected 2 embeddings, got " + embeddings.length);
    }

    const rawScore = cosineSim(embeddings[0], embeddings[1]);
    const score = normaliseScore(rawScore);

    return {
      rawScore: Math.round(rawScore * 10000) / 10000, // 4 decimal places
      score,
      querySignal: truncatedQuery,
      contentTokens,
      isLive: true,
    };
  } catch (err) {
    console.warn(
      "[CosineSimilarity] API call failed, skipping dimension:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

/**
 * Get the OpenAI API key from environment.
 * Returns null if not available.
 */
export function getOpenAIApiKey(): string | null {
  return process.env.OPENAI_API_KEY ?? null;
}
