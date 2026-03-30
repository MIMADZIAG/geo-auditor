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

  const toInsert: InsertMonitoredPagePhrase[] = generated.phrases.map((p) => ({
    monitoredPageId: params.monitoredPageId,
    userId: params.userId,
    phrase: p.phrase,
    source: "ai_generated" as const,
    aiRationale: p.rationale,
    intentType: p.intentType,
    isActive: true,
    sortOrder: p.sortOrder,
  }));

  await insertPhrases(toInsert);

  const stored = await getPhrasesForPage(params.monitoredPageId);
  return { phrases: stored, alreadyInitialized: false };
}

// ─── Citation metrics update ──────────────────────────────────────────────────

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
