/**
 * Phrase CRUD — monitored_page_phrases
 *
 * All database operations for the stable phrase set of a monitored page.
 * These helpers are used by:
 *   - tRPC router (monitoring.getPhrases, addPhrase, togglePhrase, initializePhrases)
 *   - Citation worker (getActivePhrasesForPage — replaces LLM generation per run)
 *   - Alert system (updatePhraseCitationMetrics — after each citation job)
 */

import { getDb } from "../db";
import {
  monitoredPagePhrases,
  type MonitoredPagePhrase,
  type InsertMonitoredPagePhrase,
} from "../../drizzle/schema";
import { eq, and, asc } from "drizzle-orm";
import { generatePhrasesForPage } from "./phraseGenerator";
import { getPlanLimits } from "../stripe/products";

// ─── Semantic deduplication ──────────────────────────────────────────────────────────

/**
 * Tokenize a phrase into a set of significant words (removes stopwords).
 * Used for Jaccard similarity computation.
 */
function tokenize(phrase: string): Set<string> {
  const STOPWORDS = new Set([
    // Polish
    "jak", "co", "czy", "do", "na", "w", "z", "i", "a", "to", "się", "jest", "są",
    "nie", "dla", "po", "przy", "przez", "o", "ze", "od", "który", "która", "które",
    "ten", "ta", "te", "tego", "tej", "te", "można", "może", "którego", "której",
    // English
    "how", "what", "is", "are", "the", "a", "an", "to", "for", "in", "of", "and",
    "or", "best", "top", "vs", "vs.", "which", "why", "when", "where", "who",
  ]);
  return new Set(
    phrase
      .toLowerCase()
      .replace(/[^a-z0-9\s]/gi, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

/**
 * Jaccard similarity between two tokenized sets.
 * Returns 0–1 where 1 = identical, 0 = no overlap.
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const aArr = Array.from(a);
  const intersection = aArr.filter((w) => b.has(w)).length;
  const union = new Set(Array.from(a).concat(Array.from(b))).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Deduplicate a list of generated phrases using Jaccard similarity.
 * Keeps the highest-priority phrase when two are too similar (similarity ≥ threshold).
 * Priority order: high citationProbability > medium > low; earlier sortOrder wins ties.
 *
 * @param phrases - Sorted list of generated phrases (sortOrder ascending)
 * @param threshold - Jaccard similarity threshold (default 0.6 = 60% token overlap)
 */
export function deduplicatePhrases<T extends { phrase: string; citationProbability?: string | null; sortOrder?: number }>(phrases: T[], threshold = 0.6): T[] {
  const probRank: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const kept: T[] = [];
  const keptTokens: Set<string>[] = [];

  for (const candidate of phrases) {
    const tokens = tokenize(candidate.phrase);
    let isDuplicate = false;

    for (let i = 0; i < kept.length; i++) {
      const sim = jaccardSimilarity(tokens, keptTokens[i]);
      if (sim >= threshold) {
        // Duplicate found — keep the one with higher citation probability
        const existingRank = probRank[kept[i].citationProbability ?? "low"] ?? 1;
        const candidateRank = probRank[candidate.citationProbability ?? "low"] ?? 1;
        if (candidateRank > existingRank) {
          // Replace existing with higher-quality candidate
          kept[i] = candidate;
          keptTokens[i] = tokens;
        }
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      kept.push(candidate);
      keptTokens.push(tokens);
    }
  }

  return kept;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/** Returns all phrases for a page, ordered by sortOrder. Includes inactive ones. */
export async function getPhrasesForPage(monitoredPageId: number): Promise<MonitoredPagePhrase[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(monitoredPagePhrases)
    .where(eq(monitoredPagePhrases.monitoredPageId, monitoredPageId))
    .orderBy(asc(monitoredPagePhrases.sortOrder), asc(monitoredPagePhrases.createdAt));
}

/** Returns only active phrases — used by citation worker as stable query set. */
export async function getActivePhrasesForPage(monitoredPageId: number): Promise<MonitoredPagePhrase[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(monitoredPagePhrases)
    .where(
      and(
        eq(monitoredPagePhrases.monitoredPageId, monitoredPageId),
        eq(monitoredPagePhrases.isActive, true)
      )
    )
    .orderBy(asc(monitoredPagePhrases.sortOrder));
}

/** Returns true if phrases have already been initialized for this page. */
export async function hasPhrasesInitialized(monitoredPageId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db
    .select({ id: monitoredPagePhrases.id })
    .from(monitoredPagePhrases)
    .where(eq(monitoredPagePhrases.monitoredPageId, monitoredPageId))
    .limit(1);
  return rows.length > 0;
}

// ─── Write ────────────────────────────────────────────────────────────────────

/** Bulk-insert phrases (used during initialization). Skips if already initialized. */
export async function insertPhrases(
  phrases: InsertMonitoredPagePhrase[]
): Promise<void> {
  const db = await getDb();
  if (!db || phrases.length === 0) return;
  await db.insert(monitoredPagePhrases).values(phrases);
}

/** Toggle isActive for a single phrase (user can disable without deleting). */
export async function togglePhrase(
  phraseId: number,
  userId: number,
  isActive: boolean
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .update(monitoredPagePhrases)
    .set({ isActive })
    .where(
      and(
        eq(monitoredPagePhrases.id, phraseId),
        eq(monitoredPagePhrases.userId, userId)
      )
    );
  return (result as any)?.[0]?.affectedRows > 0;
}

/** Add a user-defined phrase. Enforces plan limit on custom phrases. */
export async function addCustomPhrase(params: {
  monitoredPageId: number;
  userId: number;
  phrase: string;
  plan: string;
}): Promise<{ success: boolean; error?: string; phrase?: MonitoredPagePhrase }> {
  const db = await getDb();
  if (!db) return { success: false, error: "DB unavailable" };

  const limits = getPlanLimits(params.plan);
  const maxCustom = limits.maxCustomPhrasesPerPage;

  // Count existing custom phrases for this page
  const existing = await db
    .select({ id: monitoredPagePhrases.id })
    .from(monitoredPagePhrases)
    .where(
      and(
        eq(monitoredPagePhrases.monitoredPageId, params.monitoredPageId),
        eq(monitoredPagePhrases.userId, params.userId)
      )
    );

  const customCount = existing.filter((_) => true).length; // count all user phrases
  // Get existing phrases to count only user_added
  const allPhrases = await getPhrasesForPage(params.monitoredPageId);
  const userAddedCount = allPhrases.filter((p) => p.source === "user_added" || p.source === "user_modified").length;

  if (maxCustom !== Infinity && userAddedCount >= maxCustom) {
    return {
      success: false,
      error: `Twój plan pozwala na ${maxCustom} własn${maxCustom === 1 ? "ą frazę" : maxCustom < 5 ? "e frazy" : "ych fraz"} per strona. Przejdź na wyższy plan, aby dodać więcej.`,
    };
  }

  // Determine sort order (append at end)
  const maxSort = allPhrases.reduce((max, p) => Math.max(max, p.sortOrder), 0);

  const [result] = await db.insert(monitoredPagePhrases).values({
    monitoredPageId: params.monitoredPageId,
    userId: params.userId,
    phrase: params.phrase.trim(),
    source: "user_added",
    aiRationale: null,
    intentType: "informational",
    isActive: true,
    sortOrder: maxSort + 1,
  });

  const insertId = (result as any)?.insertId;
  if (!insertId) return { success: false, error: "Insert failed" };

  const rows = await db
    .select()
    .from(monitoredPagePhrases)
    .where(eq(monitoredPagePhrases.id, insertId))
    .limit(1);

  return { success: true, phrase: rows[0] };
}

/** Delete a user-added phrase (only user_added/user_modified, not ai_generated). */
export async function deleteCustomPhrase(phraseId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Only allow deletion of user-added phrases
  const rows = await db
    .select()
    .from(monitoredPagePhrases)
    .where(
      and(
        eq(monitoredPagePhrases.id, phraseId),
        eq(monitoredPagePhrases.userId, userId)
      )
    )
    .limit(1);

  const phrase = rows[0];
  if (!phrase || phrase.source === "ai_generated") return false;

  await db.delete(monitoredPagePhrases).where(eq(monitoredPagePhrases.id, phraseId));
  return true;
}

// ─── Initialization ───────────────────────────────────────────────────────────

/**
 * Initialize phrases for a newly monitored page.
 * Generates phrases from CI data via LLM and stores them.
 * Idempotent: does nothing if phrases already exist.
 */
export async function initializePhrasesForPage(params: {
  monitoredPageId: number;
  userId: number;
  url: string;
  plan: string;
}): Promise<{ phrases: MonitoredPagePhrase[]; alreadyInitialized: boolean }> {
  const already = await hasPhrasesInitialized(params.monitoredPageId);
  if (already) {
    const phrases = await getPhrasesForPage(params.monitoredPageId);
    return { phrases, alreadyInitialized: true };
  }

  const limits = getPlanLimits(params.plan);
  const maxAi = limits.maxAiPhrasesPerPage;

  const generated = await generatePhrasesForPage({
    url: params.url,
    userId: params.userId,
    maxPhrases: maxAi,
  });

  if (generated.phrases.length === 0) {
    return { phrases: [], alreadyInitialized: false };
  }

  // Semantic deduplication: remove quasi-duplicate queries before saving.
  // Uses Jaccard similarity on tokenized phrases (threshold 0.6 = 60% token overlap).
  // Ensures diverse coverage across intent types instead of near-identical variants.
  const deduplicated = deduplicatePhrases(generated.phrases);
  if (deduplicated.length < generated.phrases.length) {
    console.log(
      `[phrases] Deduplication: ${generated.phrases.length} → ${deduplicated.length} phrases (removed ${generated.phrases.length - deduplicated.length} near-duplicates)`
    );
  }

  const toInsert: InsertMonitoredPagePhrase[] = deduplicated.map((p) => ({
    monitoredPageId: params.monitoredPageId,
    userId: params.userId,
    phrase: p.phrase,
    source: "ai_generated" as const,
    aiRationale: p.rationale,
    intentType: p.intentType,
    isActive: true,
    sortOrder: p.sortOrder,
    // INTENT-MATRIX v4: persist engine affinity and citation probability
    engineAffinity: p.engineAffinity ?? null,
    citationProbability: p.citationProbability ?? null,
  }));

  await insertPhrases(toInsert);

  const stored = await getPhrasesForPage(params.monitoredPageId);
  return { phrases: stored, alreadyInitialized: false };
}

// ─── Citation metrics update ────────────────────────────────────────────────────────────────

// Minimum consecutive zero-citation runs before a phrase is auto-flagged as weak
const WEAK_PHRASE_THRESHOLD = 3;

/**
 * After a citation job completes, update per-phrase citation metrics.
 * citationMap: { phrase → citedEnginesCount }
 */
export async function updatePhraseCitationMetrics(
  monitoredPageId: number,
  citationMap: Map<string, number>
): Promise<void> {
  const db = await getDb();
  if (!db || citationMap.size === 0) return;

  const phrases = await getActivePhrasesForPage(monitoredPageId);
  const now = new Date();

  for (const phrase of phrases) {
    const normalizedPhrase = phrase.phrase.toLowerCase().trim();
    // Find citation count for this phrase (case-insensitive match)
    let citedEngines = 0;
    for (const [key, count] of Array.from(citationMap.entries())) {
      if (key.toLowerCase().trim() === normalizedPhrase) {
        citedEngines = count;
        break;
      }
    }

    // Update streak: increment if cited, reset if not
    const currentStreak = phrase.citationStreakDays ?? 0;
    const newStreak = citedEngines > 0 ? currentStreak + 1 : 0;

    await db
      .update(monitoredPagePhrases)
      .set({
        lastCitedEngines: citedEngines,
        lastCheckedAt: now,
        citationStreakDays: newStreak,
      })
      .where(eq(monitoredPagePhrases.id, phrase.id));
  }
}

// ─── Citation feedback loop ────────────────────────────────────────────────────────────────

export interface WeakPhraseSummary {
  phraseId: number;
  phrase: string;
  zeroRunsCount: number;
  intentType: string | null;
}

/**
 * Citation feedback loop: analyse per-phrase citation history and flag weak phrases.
 *
 * A phrase is considered "weak" when it has accumulated WEAK_PHRASE_THRESHOLD (3)
 * consecutive monitoring runs with 0 citations across all engines.
 * Weak phrases are auto-deactivated (isActive = false) to prevent wasting API quota
 * on queries that never produce citations.
 *
 * Returns a summary of flagged phrases so the caller can notify the user.
 *
 * Design notes:
 * - Only AI-generated phrases are auto-deactivated; user-added phrases are never touched.
 * - The function is idempotent: re-running on already-inactive phrases is a no-op.
 * - Threshold of 3 runs balances false-positive risk vs. cost savings.
 */
export async function runCitationFeedbackLoop(
  monitoredPageId: number
): Promise<WeakPhraseSummary[]> {
  const db = await getDb();
  if (!db) return [];

  // Fetch all active AI-generated phrases for this page
  const phrases = await db
    .select()
    .from(monitoredPagePhrases)
    .where(
      and(
        eq(monitoredPagePhrases.monitoredPageId, monitoredPageId),
        eq(monitoredPagePhrases.isActive, true)
      )
    );

  const aiPhrases = phrases.filter((p) => p.source === "ai_generated");
  if (aiPhrases.length === 0) return [];

  const { phraseCitationHistory } = await import("../../drizzle/schema");
  const { desc: descOrd } = await import("drizzle-orm");

  const flagged: WeakPhraseSummary[] = [];

  for (const phrase of aiPhrases) {
    // Fetch last N citation history rows for this phrase (most recent first)
    const history = await db
      .select({ citedEnginesCount: phraseCitationHistory.citedEnginesCount })
      .from(phraseCitationHistory)
      .where(eq(phraseCitationHistory.phraseId, phrase.id))
      .orderBy(descOrd(phraseCitationHistory.recordedAt))
      .limit(WEAK_PHRASE_THRESHOLD);

    // Only flag if we have enough history (at least THRESHOLD runs)
    if (history.length < WEAK_PHRASE_THRESHOLD) continue;

    // Check if ALL recent runs have 0 citations
    const allZero = history.every((h) => (h.citedEnginesCount ?? 0) === 0);
    if (!allZero) continue;

    // Auto-deactivate the weak phrase
    await db
      .update(monitoredPagePhrases)
      .set({ isActive: false })
      .where(eq(monitoredPagePhrases.id, phrase.id));

    flagged.push({
      phraseId: phrase.id,
      phrase: phrase.phrase,
      zeroRunsCount: WEAK_PHRASE_THRESHOLD,
      intentType: phrase.intentType ?? null,
    });

    console.log(
      `[CitationFeedback] Deactivated weak phrase #${phrase.id} "${phrase.phrase}" (${WEAK_PHRASE_THRESHOLD} consecutive zero-citation runs)`
    );
  }

  return flagged;
}
