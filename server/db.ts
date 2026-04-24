import { eq, desc, and, gte, lt, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users, audits, auditRateLimits, InsertAudit,
  monitoredPages, InsertMonitoredPage, scoreSnapshots, InsertScoreSnapshot,
  emailLeads, visibilitySnapshots, monitoredPagePhrases,
} from "../drizzle/schema";
import { ENV } from './_core/env';
import { computeAIVisibilityScore } from "../shared/visibilityScore";
import { domainToBrandName, getEntityHostname, getEntityRootDomain, type EntityPortfolioResponse, type EntityPortfolioItem } from "../shared/entity";

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

  // avgVisibilityScore: AI Visibility Score (0-100) averaged across pages with citation data
  const { computeAIVisibilityScore } = await import("../shared/visibilityScore");
  const avgVisibilityScore =
    pagesWithCitation.length > 0
      ? Math.round(
          pagesWithCitation.reduce(
            (sum, p) => sum + computeAIVisibilityScore(p.lastCitedEngines ?? 0, p.lastTotalEngines ?? 4, null),
            0
          ) / pagesWithCitation.length
        )
      : null;

  return {
    auditsThisMonth: monthlyCount,
    avgScore,
    bestScore,
    totalAudits: allAudits.length,
    avgCitedEngines,
    citationTotal,
    pagesWithCitationCount: pagesWithCitation.length,
    avgVisibilityScore,
  };
}

// ─── Per-engine breakdown helper ──────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Returns per-engine citation status for a monitored page based on the latest
 * COMPLETED citation job. Falls back through score_snapshots to find the most
 * recent run that has actual citation data — handles the case where the current
 * audit's citation job is still running/pending.
 * Used by: MonitoredPageCard engine breakdown, Dashboard Hub, Citation Pulse.
 */
export async function getEngineBreakdownForPage(monitoredPageId: number): Promise<{
  engine: string;
  cited: boolean;
  citedUrl: string | null;
  query: string | null;
  jobStatus?: string;
  checkedAt?: Date | null;
}[]> {
  const db = await getDb();
  if (!db) return [];

  const { getCitationChecksByJobId } = await import("./citation/db");
  const { citationJobs } = await import("../drizzle/schema");

  // Strategy: find the most recent completed citation job for this monitored page
  // by joining score_snapshots → citation_jobs (completed only).
  // This handles the common case where lastAuditId's job is still running.
  const snapshots = await db
    .select({
      citationJobId: scoreSnapshots.citationJobId,
      recordedAt: scoreSnapshots.recordedAt,
    })
    .from(scoreSnapshots)
    .where(eq(scoreSnapshots.monitoredPageId, monitoredPageId))
    .orderBy(desc(scoreSnapshots.recordedAt))
    .limit(10);

  // Find the first snapshot that has a citation job in completed state
  let completedJobId: number | null = null;
  let completedAt: Date | null = null;
  for (const snap of snapshots) {
    if (!snap.citationJobId) continue;
    const jobs = await db
      .select({ id: citationJobs.id, status: citationJobs.status, createdAt: citationJobs.createdAt })
      .from(citationJobs)
      .where(and(eq(citationJobs.id, snap.citationJobId), eq(citationJobs.status, "completed")))
      .limit(1);
    if (jobs[0]) {
      completedJobId = jobs[0].id;
      completedAt = snap.recordedAt;
      break;
    }
  }

  // Also try lastAuditId directly (in case snapshot linkage is missing)
  if (!completedJobId) {
    const pages = await db
      .select({ lastAuditId: monitoredPages.lastAuditId })
      .from(monitoredPages)
      .where(eq(monitoredPages.id, monitoredPageId))
      .limit(1);
    const lastAuditId = pages[0]?.lastAuditId;
    if (lastAuditId) {
      const jobs = await db
        .select({ id: citationJobs.id, status: citationJobs.status })
        .from(citationJobs)
        .where(and(eq(citationJobs.auditId, lastAuditId), eq(citationJobs.status, "completed")))
        .orderBy(desc(citationJobs.id))
        .limit(1);
      if (jobs[0]) completedJobId = jobs[0].id;
    }
  }

  if (!completedJobId) return [];

  const checks = await getCitationChecksByJobId(completedJobId);
  if (checks.length === 0) return [];

  const ENGINES = ["chatgpt", "google", "perplexity", "gemini"] as const;
  const PRIORITY: Record<string, number> = { yes: 0, domain: 1, no: 2 };

  return ENGINES.map((engine) => {
    const engineChecks = checks.filter((c) => c.engine === engine);
    if (engineChecks.length === 0) return { engine, cited: false, citedUrl: null, query: null, checkedAt: completedAt };
    const best = [...engineChecks].sort(
      (a, b) => (PRIORITY[a.isCited] ?? 2) - (PRIORITY[b.isCited] ?? 2)
    )[0];
    return {
      engine,
      cited: best.isCited === "yes" || best.isCited === "domain",
      citedUrl: best.citedUrl ?? best.domainCitedUrl ?? null,
      query: best.query ?? null,
      checkedAt: completedAt,
    };
  });
}

function averageNumbers(values: Array<number | null | undefined>) {
  const filtered = values.filter((value): value is number => typeof value === "number");
  if (filtered.length === 0) return null;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function resolvePriorityAction(shareOfVoice: number | null, readinessScore: number | null) {
  if ((shareOfVoice ?? 0) < 30) {
    return "Priorytet: uruchom gap analysis i schema deployment dla promptow z niska cytowalnoscia.";
  }
  if ((shareOfVoice ?? 0) < 55 || (readinessScore ?? 0) < 60) {
    return "Priorytet: rozbuduj info gain oraz proof points, zeby przejac prompty porownawcze.";
  }
  return "Priorytet: utrzymaj momentum i rozszerz monitoring o kolejne prompt clusters.";
}

export async function getEntityPortfolioData(userId: number): Promise<EntityPortfolioResponse> {
  const db = await getDb();
  if (!db) {
    return {
      entities: [],
      summary: {
        totalEntities: 0,
        totalPages: 0,
        totalPrompts: 0,
        totalCitedPrompts: 0,
        avgReadinessScore: null,
        avgShareOfVoice: null,
        avgCoverageRate: null,
        activeAlertEntities: 0,
        lastUpdatedAt: null,
      },
    };
  }

  const pages = await getMonitoredPagesByUser(userId);
  if (pages.length === 0) {
    return {
      entities: [],
      summary: {
        totalEntities: 0,
        totalPages: 0,
        totalPrompts: 0,
        totalCitedPrompts: 0,
        avgReadinessScore: null,
        avgShareOfVoice: null,
        avgCoverageRate: null,
        activeAlertEntities: 0,
        lastUpdatedAt: null,
      },
    };
  }

  const pageIds = pages.map((page) => page.id);
  const [phraseRows, snapshotRows] = await Promise.all([
    db
      .select({
        monitoredPageId: monitoredPagePhrases.monitoredPageId,
        isActive: monitoredPagePhrases.isActive,
        lastCitedEngines: monitoredPagePhrases.lastCitedEngines,
      })
      .from(monitoredPagePhrases)
      .where(inArray(monitoredPagePhrases.monitoredPageId, pageIds)),
    db
      .select({
        monitoredPageId: visibilitySnapshots.monitoredPageId,
        shareOfVoice: visibilitySnapshots.shareOfVoice,
        sentimentLabel: visibilitySnapshots.sentimentLabel,
        sentimentScore: visibilitySnapshots.sentimentScore,
        sentimentThemes: visibilitySnapshots.sentimentThemes,
        topCompetitorDomains: visibilitySnapshots.topCompetitorDomains,
        visibilityScore: visibilitySnapshots.visibilityScore,
        recordedAt: visibilitySnapshots.recordedAt,
      })
      .from(visibilitySnapshots)
      .where(inArray(visibilitySnapshots.monitoredPageId, pageIds))
      .orderBy(desc(visibilitySnapshots.recordedAt)),
  ]);

  const latestSnapshotByPage = new Map<number, typeof snapshotRows[number]>();
  for (const row of snapshotRows) {
    if (!latestSnapshotByPage.has(row.monitoredPageId)) {
      latestSnapshotByPage.set(row.monitoredPageId, row);
    }
  }

  const phraseStatsByPage = new Map<number, { total: number; cited: number }>();
  for (const row of phraseRows) {
    if (!row.isActive) continue;
    const current = phraseStatsByPage.get(row.monitoredPageId) ?? { total: 0, cited: 0 };
    current.total += 1;
    if ((row.lastCitedEngines ?? 0) > 0) current.cited += 1;
    phraseStatsByPage.set(row.monitoredPageId, current);
  }

  const groups = new Map<string, typeof pages>();
  for (const page of pages) {
    const domain = getEntityRootDomain(getEntityHostname(page.url));
    const existing = groups.get(domain) ?? [];
    existing.push(page);
    groups.set(domain, existing);
  }

  const entities: EntityPortfolioItem[] = Array.from(groups.entries())
    .map(([domain, groupedPages]) => {
      const sortedPages = [...groupedPages].sort(
        (left, right) =>
          new Date(right.lastCitationAt ?? right.lastAuditAt ?? 0).getTime() -
          new Date(left.lastCitationAt ?? left.lastAuditAt ?? 0).getTime()
      );
      const representative = sortedPages[0]!;

      const promptStats = groupedPages.reduce(
        (acc, page) => {
          const pageStats = phraseStatsByPage.get(page.id) ?? { total: 0, cited: 0 };
          acc.total += pageStats.total;
          acc.cited += pageStats.cited;
          return acc;
        },
        { total: 0, cited: 0 }
      );

      const snapshots = groupedPages
        .map((page) => latestSnapshotByPage.get(page.id))
        .filter((snapshot): snapshot is NonNullable<typeof snapshotRows[number]> => Boolean(snapshot));

      const avgReadinessScore = averageNumbers(groupedPages.map((page) => page.lastScore));
      const fallbackVisibilityScores = groupedPages.map((page) =>
        page.lastCitedEngines != null && page.lastTotalEngines != null
          ? computeAIVisibilityScore(page.lastCitedEngines, page.lastTotalEngines, null)
          : null
      );
      const avgVisibilityScore = averageNumbers([
        ...snapshots.map((snapshot) => snapshot.visibilityScore),
        ...fallbackVisibilityScores,
      ]);
      const shareOfVoice = averageNumbers(snapshots.map((snapshot) =>
        typeof snapshot.shareOfVoice === "number" ? snapshot.shareOfVoice * 100 : null
      ));
      const coverageRate = promptStats.total > 0 ? (promptStats.cited / promptStats.total) * 100 : null;

      const competitorCounts = new Map<string, number>();
      const themeCounts = new Map<string, number>();
      for (const snapshot of snapshots) {
        const competitors = Array.isArray(snapshot.topCompetitorDomains)
          ? snapshot.topCompetitorDomains as Array<{ domain?: string; count?: number }>
          : [];
        for (const competitor of competitors) {
          if (!competitor?.domain) continue;
          competitorCounts.set(
            competitor.domain,
            (competitorCounts.get(competitor.domain) ?? 0) + (competitor.count ?? 1)
          );
        }

        const themes = Array.isArray(snapshot.sentimentThemes) ? snapshot.sentimentThemes as string[] : [];
        for (const theme of themes) {
          if (!theme) continue;
          themeCounts.set(theme, (themeCounts.get(theme) ?? 0) + 1);
        }
      }

      const topCompetitors = Array.from(competitorCounts.entries())
        .sort((left, right) => right[1] - left[1])
        .slice(0, 3)
        .map(([competitor]) => competitor);

      const topThemes = Array.from(themeCounts.entries())
        .sort((left, right) => right[1] - left[1])
        .slice(0, 3)
        .map(([theme]) => theme);

      const latestSnapshot = snapshots[0] ?? null;
      const lastUpdatedAt = groupedPages.reduce<Date | null>((latest, page) => {
        const candidate = page.lastCitationAt ?? page.lastAuditAt ?? null;
        if (!candidate) return latest;
        if (!latest || candidate > latest) return candidate;
        return latest;
      }, latestSnapshot?.recordedAt ?? null);

      const sentimentLabel =
        latestSnapshot?.sentimentLabel ??
        (shareOfVoice != null ? "modelled" : "neutral");
      const sentimentScore = latestSnapshot?.sentimentScore ?? null;
      const activeAlerts = groupedPages.filter((page) =>
        (page.lastScore ?? 0) < 60 || ((page.lastCitedEngines ?? 0) === 0 && (page.lastTotalEngines ?? 0) > 0)
      ).length;

      return {
        entityKey: domain,
        domain,
        brandName: domainToBrandName(domain),
        representative,
        representativePageId: representative.id,
        pages: groupedPages.map((page) => ({
          id: page.id,
          url: page.url,
          label: page.label,
          lastScore: page.lastScore,
          lastAuditAt: page.lastAuditAt,
          lastCitationAt: page.lastCitationAt,
          lastCitedEngines: page.lastCitedEngines,
          lastTotalEngines: page.lastTotalEngines,
          scheduleFrequency: page.scheduleFrequency,
        })),
        avgScore: avgReadinessScore != null ? Math.round(avgReadinessScore) : null,
        avgReadinessScore: avgReadinessScore != null ? Math.round(avgReadinessScore) : null,
        avgVisibilityScore: avgVisibilityScore != null ? Math.round(avgVisibilityScore) : null,
        shareOfVoice: shareOfVoice != null ? Math.round(shareOfVoice) : null,
        promptEstimate: promptStats.total,
        promptCount: promptStats.total,
        citedPromptCount: promptStats.cited,
        coverageRate: coverageRate != null ? Math.round(coverageRate) : null,
        topCompetitors,
        topThemes,
        sentimentLabel,
        sentimentScore,
        lastUpdatedAt,
        activeAlerts,
        priorityAction: resolvePriorityAction(shareOfVoice, avgReadinessScore),
        dataSource: snapshots.length > 0 ? "monitoring" : "fallback",
      } satisfies EntityPortfolioItem;
    })
    .sort((left, right) => {
      const leftScore = left.shareOfVoice ?? left.avgScore ?? 0;
      const rightScore = right.shareOfVoice ?? right.avgScore ?? 0;
      return rightScore - leftScore;
    });

  const summary = {
    totalEntities: entities.length,
    totalPages: pages.length,
    totalPrompts: entities.reduce((sum, entity) => sum + entity.promptCount, 0),
    totalCitedPrompts: entities.reduce((sum, entity) => sum + entity.citedPromptCount, 0),
    avgReadinessScore: averageNumbers(entities.map((entity) => entity.avgReadinessScore)),
    avgShareOfVoice: averageNumbers(entities.map((entity) => entity.shareOfVoice)),
    avgCoverageRate: averageNumbers(entities.map((entity) => entity.coverageRate)),
    activeAlertEntities: entities.filter((entity) => entity.activeAlerts > 0).length,
    lastUpdatedAt: entities.reduce<Date | null>((latest, entity) => {
      if (!entity.lastUpdatedAt) return latest;
      if (!latest || entity.lastUpdatedAt > latest) return entity.lastUpdatedAt;
      return latest;
    }, null),
  };

  return {
    entities,
    summary: {
      ...summary,
      avgReadinessScore: summary.avgReadinessScore != null ? Math.round(summary.avgReadinessScore) : null,
      avgShareOfVoice: summary.avgShareOfVoice != null ? Math.round(summary.avgShareOfVoice) : null,
      avgCoverageRate: summary.avgCoverageRate != null ? Math.round(summary.avgCoverageRate) : null,
    },
  };
}
