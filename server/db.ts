import { eq, desc, and, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, audits, auditRateLimits, InsertAudit } from "../drizzle/schema";
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

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
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

    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
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

const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const FREE_AUDITS_PER_WINDOW = 3;

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
