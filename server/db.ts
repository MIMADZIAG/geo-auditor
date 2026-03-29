import { eq, desc, and, gte, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users, audits, auditRateLimits, InsertAudit,
  monitoredPages, InsertMonitoredPage, scoreSnapshots, InsertScoreSnapshot,
  emailLeads,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<{ isNew: boolean }> {
  if (!user.openId) throw new Error("User openId is required for upsert");

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return { isNew: false };
  }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

    // MySQL: INSERT ... ON DUPLICATE KEY UPDATE returns insertId > 0 for new rows, 0 for updates
    const result = await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
    const [res] = result as unknown as [{ insertId: number }];
    return { isNew: (res?.insertId ?? 0) > 0 };
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Audit helpers ────────────────────────────────────────────────────────────

export async function createAudit(data: InsertAudit) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(audits).values(data);
  return result;
}

export async function updateAudit(id: number, data: Partial<InsertAudit>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(audits).set(data).where(eq(audits.id, id));
}

export async function getAuditById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(audits).where(eq(audits.id, id)).limit(1);
  return result[0] ?? null;
}

export async function getAuditsByUser(userId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(audits)
    .where(eq(audits.userId, userId))
    .orderBy(desc(audits.createdAt))
    .limit(limit);
}

// ─── Rate limiting ─────────────────────────────────────────────────────────────

// Rate limit: 5 audits per 30-day rolling window for anonymous users
const RATE_LIMIT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const FREE_AUDITS_PER_WINDOW = 5;

export async function checkRateLimit(ipAddress: string): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const db = await getDb();
  if (!db) return { allowed: true, remaining: FREE_AUDITS_PER_WINDOW, resetAt: new Date() };

  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);

  const existing = await db
    .select()
    .from(auditRateLimits)
    .where(
      and(
        eq(auditRateLimits.ipAddress, ipAddress),
        gte(auditRateLimits.windowStart, windowStart)
      )
    )
    .limit(1);

  if (existing.length === 0) {
    return { allowed: true, remaining: FREE_AUDITS_PER_WINDOW - 1, resetAt: new Date(Date.now() + RATE_LIMIT_WINDOW_MS) };
  }

  const record = existing[0]!;
  const allowed = record.auditCount < FREE_AUDITS_PER_WINDOW;
  const remaining = Math.max(0, FREE_AUDITS_PER_WINDOW - record.auditCount - (allowed ? 1 : 0));
  const resetAt = new Date(record.windowStart.getTime() + RATE_LIMIT_WINDOW_MS);

  return { allowed, remaining, resetAt };
}

export async function incrementRateLimit(ipAddress: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);

  const existing = await db
    .select()
    .from(auditRateLimits)
    .where(
      and(
        eq(auditRateLimits.ipAddress, ipAddress),
        gte(auditRateLimits.windowStart, windowStart)
      )
    )
    .limit(1);

  if (existing.length === 0) {
    await db.insert(auditRateLimits).values({ ipAddress, auditCount: 1, windowStart: new Date() });
  } else {
    await db
      .update(auditRateLimits)
      .set({ auditCount: (existing[0]!.auditCount ?? 0) + 1 })
      .where(eq(auditRateLimits.id, existing[0]!.id));
  }
}

// ─── Monitored Pages helpers ──────────────────────────────────────────────────

export const FREE_MONITORING_SLOTS = 1;
export const MAX_MONITORING_SLOTS_FREE = 1;

export async function getMonitoredPagesByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(monitoredPages)
    .where(and(eq(monitoredPages.userId, userId), eq(monitoredPages.isActive, "yes")))
    .orderBy(desc(monitoredPages.createdAt));
}

export async function addMonitoredPage(data: InsertMonitoredPage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(monitoredPages).values(data);
  const [res] = result as unknown as [{ insertId: number }];
  return res.insertId;
}

export async function removeMonitoredPage(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(monitoredPages)
    .set({ isActive: "no" })
    .where(and(eq(monitoredPages.id, id), eq(monitoredPages.userId, userId)));
}

export async function updateMonitoredPageAfterAudit(
  id: number,
  auditId: number,
  score: number,
  frequencyDays: number = 7
) {
  const db = await getDb();
  if (!db) return;
  const nextAuditAt = new Date(Date.now() + frequencyDays * 24 * 60 * 60 * 1000);
  await db
    .update(monitoredPages)
    .set({ lastAuditId: auditId, lastScore: score, lastAuditAt: new Date(), nextAuditAt })
    .where(eq(monitoredPages.id, id));
}

export async function updateMonitoredPageFrequency(
  id: number,
  userId: number,
  frequencyDays: number
) {
  const db = await getDb();
  if (!db) return;
  const rows = await db.select().from(monitoredPages).where(
    and(eq(monitoredPages.id, id), eq(monitoredPages.userId, userId))
  ).limit(1);
  if (!rows[0]) return;
  const base = rows[0].lastAuditAt ?? new Date();
  const nextAuditAt = new Date(base.getTime() + frequencyDays * 24 * 60 * 60 * 1000);
  await db
    .update(monitoredPages)
    .set({ scheduleFrequency: frequencyDays, nextAuditAt })
    .where(and(eq(monitoredPages.id, id), eq(monitoredPages.userId, userId)));
}

export async function getMonitoredPagesDueForAudit() {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  return db
    .select()
    .from(monitoredPages)
    .where(
      and(
        eq(monitoredPages.isActive, "yes"),
        lt(monitoredPages.nextAuditAt, now)
      )
    )
    .limit(50);
}

// ─── Score Snapshots helpers ──────────────────────────────────────────────────

export async function addScoreSnapshot(data: InsertScoreSnapshot) {
  const db = await getDb();
  if (!db) return;
  await db.insert(scoreSnapshots).values(data);
}

export async function getScoreSnapshots(monitoredPageId: number, limit = 10) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(scoreSnapshots)
    .where(eq(scoreSnapshots.monitoredPageId, monitoredPageId))
    .orderBy(desc(scoreSnapshots.recordedAt))
    .limit(limit);
}

export async function captureEmailLead(email: string, auditId?: number, source = "results_page") {
  const db = await getDb();
  if (!db) return null;
  try {
    await db.insert(emailLeads).values({ email, auditId, source });
    return true;
  } catch {
    return false;
  }
}

// ─── Citation Visibility helpers ────────────────────────────────────────────────

/**
 * Update monitored_pages with latest citation check results.
 * Called after each citation job completes for a monitored page.
 */
export async function updateMonitoredPageCitationStatus(
  monitoredPageId: number,
  citedEngines: number,
  totalEngines: number
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(monitoredPages)
    .set({
      lastCitedEngines: citedEngines,
      lastTotalEngines: totalEngines,
      lastCitationAt: new Date(),
    })
    .where(eq(monitoredPages.id, monitoredPageId));
}

/**
 * Update a score_snapshot with citation data after citation job completes.
 * Allows the history sparkline to show citation trend over time.
 */
export async function updateScoreSnapshotCitation(
  auditId: number,
  monitoredPageId: number,
  citedEngines: number,
  totalEngines: number,
  citationJobId: number
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(scoreSnapshots)
    .set({
      citedEnginesCount: citedEngines,
      totalEnginesChecked: totalEngines,
      citationJobId,
    })
    .where(
      and(
        eq(scoreSnapshots.auditId, auditId),
        eq(scoreSnapshots.monitoredPageId, monitoredPageId)
      )
    );
}

// ─── Usage Stats helper ───────────────────────────────────────────────────────
export async function getAuditUsageStats(userId: number) {
  const db = await getDb();
  if (!db) return { auditsThisMonth: 0, avgScore: null as number | null, bestScore: null as number | null, totalAudits: 0 };

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const allAudits = await db
    .select()
    .from(audits)
    .where(eq(audits.userId, userId));

  const monthlyCount = allAudits.filter(
    (a) => new Date(a.createdAt) >= monthStart
  ).length;

  const completedAudits = allAudits.filter((a) => a.overallScore != null);

  const avgScore =
    completedAudits.length > 0
      ? Math.round(
          completedAudits.reduce((sum, a) => sum + (a.overallScore ?? 0), 0) /
            completedAudits.length
        )
      : null;

  const bestScore =
    completedAudits.length > 0
      ? Math.round(Math.max(...completedAudits.map((a) => a.overallScore ?? 0)))
      : null;

  // AI Visibility: average cited engines across monitored pages with citation data
  const monitoredPagesData = await db
    .select()
    .from(monitoredPages)
    .where(and(eq(monitoredPages.userId, userId), eq(monitoredPages.isActive, "yes")));
  const pagesWithCitation = monitoredPagesData.filter(
    (p) => p.lastCitedEngines != null && p.lastTotalEngines != null && p.lastTotalEngines > 0
  );
  // avgCitedEngines: average number of engines citing across all monitored pages
  const avgCitedEngines =
    pagesWithCitation.length > 0
      ? Math.round(
          (pagesWithCitation.reduce((sum, p) => sum + (p.lastCitedEngines ?? 0), 0) /
            pagesWithCitation.length) * 10
        ) / 10
      : null;
  // Use the total engines from the first page with citation data (always 4 in practice)
  const citationTotal = pagesWithCitation.length > 0 ? (pagesWithCitation[0].lastTotalEngines ?? 4) : 4;
  return {
    auditsThisMonth: monthlyCount,
    avgScore,
    bestScore,
    totalAudits: allAudits.length,
    avgCitedEngines,
    citationTotal,
    pagesWithCitationCount: pagesWithCitation.length,
  };
}
