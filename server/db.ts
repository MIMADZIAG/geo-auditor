import { eq, desc, and, gte, lt, inArray, asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users, audits, auditRateLimits, InsertAudit,
  monitoredPages, InsertMonitoredPage, scoreSnapshots, InsertScoreSnapshot,
  emailLeads, visibilitySnapshots, monitoredPagePhrases,
  entityWorkspaces, entityWorkspacePrompts, entityWorkspaceCompetitors,
  entityWorkspaceAssets,
} from "../drizzle/schema";
import { ENV } from './_core/env';
import { computeAIVisibilityScore } from "../shared/visibilityScore";
import {
  domainToBrandName,
  getEntityHostname,
  getEntityRootDomain,
  normalizeEntityDomain,
  type EntityPageSummary,
  type EntityPortfolioResponse,
  type EntityPortfolioItem,
  type EntityWorkspaceConfig,
  type EntityWorkspaceCompetitor,
  type EntityWorkspacePrompt,
  type EntityWorkspaceResponse,
  type EntityWorkspaceAsset,
  type EntityMissingAsset,
  type EntityExplainabilitySummary,
  type EntityActionRecommendation,
  type EntityAssetType,
  type EntityStrategicRole,
  type PromptCluster,
  type ExplainabilityConfidence,
  type ActionPriority,
} from "../shared/entity";

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

function normalizeDomainInput(domainOrUrl: string) {
  return getEntityRootDomain(getEntityHostname(domainOrUrl.trim().toLowerCase()));
}

function normalizePromptCluster(input?: string | null): PromptCluster {
  const normalized = (input ?? "brand").trim().toLowerCase();
  switch (normalized) {
    case "comparison":
    case "comparative":
      return "comparison";
    case "transactional":
      return "transactional";
    case "how-to":
    case "how_to":
      return "how-to";
    case "local":
      return "local";
    case "trust":
    case "reputation":
      return "trust";
    case "problem-solving":
    case "problem_solving":
      return "problem-solving";
    case "category":
      return "category";
    default:
      return "brand";
  }
}

function inferAssetType(url: string, label?: string | null): EntityAssetType {
  const text = `${url} ${label ?? ""}`.toLowerCase();
  if (text.includes('/compare') || text.includes(' vs ') || text.includes('porown')) return 'comparison';
  if (text.endsWith('.pdf') || text.includes('/docs') || text.includes('/help')) return 'docs';
  if (text.includes('/faq')) return 'faq';
  if (text.includes('/blog') || text.includes('/article') || text.includes('/poradnik')) return 'blog';
  if (text.includes('/product') || text.includes('/produkt')) return 'product';
  if (text.includes('/category') || text.includes('/kategoria')) return 'category';
  if (text.includes('/about') || text.includes('/o-nas')) return 'about';
  if (text.includes('/trust') || text.includes('/opinie') || text.includes('/reviews')) return 'trust';
  if (text.endsWith('/') || text.endsWith('.pl') || text.endsWith('.com')) return 'homepage';
  return 'other';
}

function inferStrategicRole(assetType: EntityAssetType): EntityStrategicRole {
  switch (assetType) {
    case 'comparison':
      return 'comparison';
    case 'product':
    case 'category':
    case 'landing':
      return 'transactional';
    case 'trust':
    case 'about':
      return 'trust';
    case 'docs':
    case 'faq':
    case 'blog':
    case 'support':
      return 'problem-solving';
    default:
      return 'brand';
  }
}

function defaultClustersForRole(role: EntityStrategicRole): PromptCluster[] {
  switch (role) {
    case 'comparison':
      return ['comparison', 'category'];
    case 'transactional':
      return ['transactional', 'category'];
    case 'trust':
      return ['trust', 'brand'];
    case 'problem-solving':
      return ['how-to', 'problem-solving'];
    default:
      return ['brand'];
  }
}

function confidenceFromScore(score: number): ExplainabilityConfidence {
  if (score >= 80) return 'high';
  if (score >= 55) return 'medium';
  return 'low';
}

function getMissingAssetRules(): Array<{
  cluster: PromptCluster;
  assetType: EntityAssetType;
  strategicRole: EntityStrategicRole;
  priority: ActionPriority;
  targetDescription: string;
  reason: string;
}> {
  return [
    {
      cluster: 'comparison',
      assetType: 'comparison',
      strategicRole: 'comparison',
      priority: 'critical',
      targetDescription: 'Dedykowany asset comparison z tabelą porównawczą i jasnym werdyktem.',
      reason: 'Prompty comparison zwykle przegrywają bez jawnego assetu z tabelą i parametrami.',
    },
    {
      cluster: 'transactional',
      assetType: 'category',
      strategicRole: 'transactional',
      priority: 'high',
      targetDescription: 'Asset category / product wspierający prompty transactional.',
      reason: 'Prompty transactional potrzebują assetu z ofertą, parametrami i CTA.',
    },
    {
      cluster: 'trust',
      assetType: 'trust',
      strategicRole: 'trust',
      priority: 'high',
      targetDescription: 'Asset trust / about z proof points i sygnałami E-E-A-T.',
      reason: 'Prompty trust potrzebują oddzielnej powierzchni z wiarygodnością marki.',
    },
    {
      cluster: 'how-to',
      assetType: 'blog',
      strategicRole: 'problem-solving',
      priority: 'high',
      targetDescription: 'Asset how-to / docs odpowiadający na pytania instruktażowe.',
      reason: 'Prompty how-to wymagają treści krok po kroku i FAQ.',
    },
    {
      cluster: 'problem-solving',
      assetType: 'docs',
      strategicRole: 'problem-solving',
      priority: 'high',
      targetDescription: 'Asset docs/support rozwiązujący konkretny problem użytkownika.',
      reason: 'Prompty problem-solving potrzebują jednoznacznych rozwiązań i structure-first contentu.',
    },
  ];
}

async function getEntityWorkspaceAssets(workspaceId: number | null, userId: number, linkedPages: EntityPageSummary[]): Promise<EntityWorkspaceAsset[]> {
  const db = await getDb();
  const explicitRows = workspaceId && db
    ? await db.select().from(entityWorkspaceAssets).where(and(eq(entityWorkspaceAssets.workspaceId, workspaceId), eq(entityWorkspaceAssets.userId, userId))).orderBy(asc(entityWorkspaceAssets.createdAt))
    : [];

  const explicitUrls = new Set(explicitRows.map((row) => row.url));
  const explicitAssets = explicitRows.map((row) => ({
    id: row.id,
    url: row.url,
    title: row.title,
    assetType: row.assetType as EntityAssetType,
    strategicRole: row.strategicRole as EntityStrategicRole,
    supportsPromptClusters: Array.isArray(row.supportsPromptClusters) ? row.supportsPromptClusters as PromptCluster[] : defaultClustersForRole(row.strategicRole as EntityStrategicRole),
    source: row.source as EntityWorkspaceAsset['source'],
    monitoredPageId: row.monitoredPageId ?? null,
    isPrimary: row.isPrimary,
    notes: row.notes ?? null,
    readinessScore: linkedPages.find((page) => page.id === row.monitoredPageId)?.lastScore ?? null,
    citationCoverage: null,
  } satisfies EntityWorkspaceAsset));

  const mappedAssets = linkedPages
    .filter((page) => !explicitUrls.has(page.url))
    .map((page) => {
      const assetType = inferAssetType(page.url, page.label);
      const strategicRole = inferStrategicRole(assetType);
      return {
        id: -page.id,
        url: page.url,
        title: page.label ?? page.url,
        assetType,
        strategicRole,
        supportsPromptClusters: defaultClustersForRole(strategicRole),
        source: 'mapped_from_monitoring' as const,
        monitoredPageId: page.id,
        isPrimary: assetType === 'homepage',
        notes: null,
        readinessScore: page.lastScore,
        citationCoverage: page.lastTotalEngines ? Math.round(((page.lastCitedEngines ?? 0) / page.lastTotalEngines) * 100) : null,
      } satisfies EntityWorkspaceAsset;
    });

  return [...explicitAssets, ...mappedAssets];
}

export async function addEntityWorkspaceAsset(params: {
  workspaceId: number;
  userId: number;
  url: string;
  title: string;
  assetType: EntityAssetType;
  strategicRole: EntityStrategicRole;
  supportsPromptClusters: PromptCluster[];
  notes?: string | null;
  monitoredPageId?: number | null;
  isPrimary?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(entityWorkspaceAssets).values({
    workspaceId: params.workspaceId,
    userId: params.userId,
    url: params.url.trim(),
    title: params.title.trim(),
    assetType: params.assetType,
    strategicRole: params.strategicRole,
    supportsPromptClusters: params.supportsPromptClusters,
    source: params.monitoredPageId ? "mapped_from_monitoring" as const : "user_added" as const,
    monitoredPageId: params.monitoredPageId ?? null,
    isPrimary: params.isPrimary ?? false,
    notes: params.notes ?? null,
  });
  return (result as { insertId?: number }).insertId ?? null;
}

export async function updateEntityWorkspaceAsset(params: {
  assetId: number;
  userId: number;
  title?: string;
  assetType?: EntityAssetType;
  strategicRole?: EntityStrategicRole;
  supportsPromptClusters?: PromptCluster[];
  notes?: string | null;
  isPrimary?: boolean;
}) {
  const db = await getDb();
  if (!db) return false;
  await db.update(entityWorkspaceAssets).set({
    ...(params.title !== undefined ? { title: params.title } : {}),
    ...(params.assetType !== undefined ? { assetType: params.assetType } : {}),
    ...(params.strategicRole !== undefined ? { strategicRole: params.strategicRole } : {}),
    ...(params.supportsPromptClusters !== undefined ? { supportsPromptClusters: params.supportsPromptClusters } : {}),
    ...(params.notes !== undefined ? { notes: params.notes } : {}),
    ...(params.isPrimary !== undefined ? { isPrimary: params.isPrimary } : {}),
    updatedAt: new Date(),
  }).where(and(eq(entityWorkspaceAssets.id, params.assetId), eq(entityWorkspaceAssets.userId, params.userId)));
  return true;
}

export async function deleteEntityWorkspaceAsset(assetId: number, userId: number) {
  const db = await getDb();
  if (!db) return false;
  await db.delete(entityWorkspaceAssets).where(and(eq(entityWorkspaceAssets.id, assetId), eq(entityWorkspaceAssets.userId, userId)));
  return true;
}

async function getRepresentativeAuditId(representativePageId: number | null): Promise<number | null> {
  if (!representativePageId) return null;
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ lastAuditId: monitoredPages.lastAuditId })
    .from(monitoredPages)
    .where(eq(monitoredPages.id, representativePageId))
    .limit(1);
  return rows[0]?.lastAuditId ?? null;
}

function detectMissingAssets(prompts: EntityWorkspacePrompt[], assets: EntityWorkspaceAsset[]): EntityMissingAsset[] {
  const existingClusters = new Set<string>(assets.flatMap((asset) => asset.supportsPromptClusters));
  const promptClusters = new Set(prompts.map((prompt) => normalizePromptCluster(prompt.intentType)));
  return getMissingAssetRules()
    .filter((rule) => promptClusters.has(rule.cluster) && !existingClusters.has(rule.cluster as string))
    .map((rule) => ({
      id: `missing-${rule.cluster}`,
      assetType: rule.assetType,
      strategicRole: rule.strategicRole,
      promptCluster: rule.cluster,
      priority: rule.priority,
      reason: rule.reason,
      targetDescription: rule.targetDescription,
    }));
}

function buildExplainability(prompts: EntityWorkspacePrompt[], assets: EntityWorkspaceAsset[], missingAssets: EntityMissingAsset[], opportunityResult: any): EntityExplainabilitySummary {
  const promptDiffs = prompts.slice(0, 8).map((prompt) => {
    const cluster = normalizePromptCluster(prompt.intentType);
    const match = opportunityResult?.opportunities?.find((item: any) => normalizePromptCluster(item.semanticInsight?.queryIntent ?? item.query) === cluster) ?? opportunityResult?.opportunities?.[0] ?? null;
    const targetAsset = assets.find((asset) => asset.supportsPromptClusters.includes(cluster)) ?? null;
    const score = match ? Math.min(95, 45 + (match.structuralGaps?.length ?? 0) * 10) : targetAsset ? 62 : 42;
    return {
      prompt: prompt.prompt,
      promptCluster: cluster,
      topCompetitor: match?.competitorDomain ?? null,
      whyCompetitorWon: match?.semanticInsight?.whyCompetitorWon ?? match?.ahaMoment ?? `Brakuje dopasowanego assetu lub struktury dla klastra ${cluster}.`,
      missingStructures: match?.structuralGaps?.map((gap: any) => gap.label).slice(0, 4) ?? (targetAsset ? [] : ['Brak dedykowanego assetu dla klastra']),
      missingFacts: match?.structuralGaps?.filter((gap: any) => gap.checkId?.includes('data') || gap.checkId?.includes('information_gain')).map((gap: any) => gap.label) ?? [],
      missingSchema: match?.structuralGaps?.filter((gap: any) => gap.category === 'structuredData').map((gap: any) => gap.label) ?? [],
      recommendedAssetId: targetAsset?.id ?? null,
      recommendedAssetLabel: targetAsset?.title ?? `Nowy asset dla klastra ${cluster}`,
      confidenceScore: score,
      confidence: confidenceFromScore(score),
      engines: match?.engines ?? [],
    };
  });

  const topReasons = promptDiffs.slice(0, 4).map((diff) => ({
    label: diff.promptCluster,
    summary: diff.whyCompetitorWon,
    confidence: diff.confidence,
    evidence: [...diff.missingStructures, ...diff.missingSchema].slice(0, 3),
  }));

  return {
    topReasons,
    promptDiffs,
    blockerSummary: Array.from(new Set(missingAssets.map((item) => item.reason).concat(promptDiffs.flatMap((diff) => diff.missingStructures)))).slice(0, 6),
  };
}

function buildActionPlan(workspace: EntityWorkspaceConfig, prompts: EntityWorkspacePrompt[], competitors: EntityWorkspaceCompetitor[], assets: EntityWorkspaceAsset[], missingAssets: EntityMissingAsset[], explainability: EntityExplainabilitySummary): EntityActionRecommendation[] {
  const comparisonAsset = assets.find((asset) => asset.assetType === 'comparison' || asset.assetType === 'category') ?? null;
  const trustAsset = assets.find((asset) => asset.assetType === 'trust' || asset.assetType === 'about' || asset.assetType === 'homepage') ?? null;
  const homepageAsset = assets.find((asset) => asset.assetType === 'homepage') ?? assets[0] ?? null;

  const actions: EntityActionRecommendation[] = [
    {
      id: 'action-answer-first',
      type: 'answer-first-intro',
      priority: 'critical',
      title: 'Dodaj answer-first intro',
      summary: 'Bezpośrednia odpowiedź w pierwszych zdaniach wzmacnia cytowalność przez AI.',
      promptCluster: 'brand',
      targetAssetId: homepageAsset?.id ?? null,
      targetAssetLabel: homepageAsset?.title ?? 'Główny asset encji',
      suggestedSchemas: [],
      sourceReasons: explainability.topReasons.slice(0, 2).map((reason) => reason.summary),
      blocks: [
        {
          format: 'markdown',
          title: 'Answer-first intro',
          content: `**Krótka odpowiedź:** ${workspace.name} powinno odpowiadać na pytanie użytkownika już w pierwszych 2-3 zdaniach, wskazując przewagę marki i konkretny kontekst użycia.`,
        },
      ],
    },
    {
      id: 'action-jsonld',
      type: 'jsonld',
      priority: 'high',
      title: 'Wdróż JSON-LD dla encji i FAQ',
      summary: 'Dodaj Organization / FAQ / Article schema na kluczowych assetach.',
      promptCluster: 'brand',
      targetAssetId: homepageAsset?.id ?? null,
      targetAssetLabel: homepageAsset?.title ?? 'Główny asset encji',
      suggestedSchemas: ['Organization', 'SameAs', 'FAQ', 'Article', 'Breadcrumb'],
      sourceReasons: explainability.promptDiffs.flatMap((diff) => diff.missingSchema).slice(0, 3),
      blocks: [
        {
          format: 'jsonld',
          title: 'Organization JSON-LD',
          content: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: workspace.name,
            url: `https://${workspace.primaryDomain}`,
            sameAs: [],
          }, null, 2),
        },
      ],
    },
    {
      id: 'action-faq',
      type: 'faq-block',
      priority: 'high',
      title: 'Dodaj blok FAQ',
      summary: 'FAQ domyka strukturę pytań i odpowiedzi dla AI engines.',
      promptCluster: 'how-to',
      targetAssetId: trustAsset?.id ?? null,
      targetAssetLabel: trustAsset?.title ?? 'Asset trust/about',
      suggestedSchemas: ['FAQ'],
      sourceReasons: explainability.topReasons.slice(0, 2).map((reason) => reason.label),
      blocks: [
        {
          format: 'markdown',
          title: 'FAQ block',
          content:
            prompts
              .slice(0, 3)
              .map(
                (prompt, index) =>
                  `### Pytanie ${index + 1}: ${prompt.prompt}\nKrótka odpowiedź z konkretnym faktem, dowodem i call-to-action.`
              )
              .join("\n\n") ||
            "### FAQ\nDodaj pytania odpowiadające na najważniejsze intencje użytkownika.",
        },
      ],
    },
    {
      id: 'action-comparison-table',
      type: 'comparison-table',
      priority: 'critical',
      title: 'Dodaj comparison table',
      summary: 'Prompty comparison wymagają tabeli z parametrami i werdyktem.',
      promptCluster: 'comparison',
      targetAssetId: comparisonAsset?.id ?? null,
      targetAssetLabel: comparisonAsset?.title ?? 'Nowy asset comparison',
      suggestedSchemas: ['FAQ', 'Breadcrumb'],
      sourceReasons: explainability.promptDiffs.filter((diff) => diff.promptCluster === 'comparison').map((diff) => diff.whyCompetitorWon).slice(0, 2),
      blocks: [
        {
          format: 'markdown',
          title: 'Comparison table',
          content:
            `| Marka | Najmocniejsza przewaga | Luka do zamknięcia |\n` +
            `| --- | --- | --- |\n` +
            `| ${workspace.name} | główna przewaga encji | uzupełnij twarde dane i proof points |\n` +
            competitors
              .slice(0, 3)
              .map((competitor) => `| ${competitor.domain} | mocna strona | brak / luka |`)
              .join("\n"),
        },
      ],
    },
    {
      id: 'action-trust',
      type: 'trust-section',
      priority: 'high',
      title: 'Wzmocnij sekcję trust / author',
      summary: 'Dodaj sygnały E-E-A-T, autora i proof points.',
      promptCluster: 'trust',
      targetAssetId: trustAsset?.id ?? null,
      targetAssetLabel: trustAsset?.title ?? 'Asset trust/about',
      suggestedSchemas: ['Organization', 'SameAs', 'Article'],
      sourceReasons: explainability.promptDiffs.filter((diff) => diff.promptCluster === 'trust').map((diff) => diff.whyCompetitorWon).slice(0, 2),
      blocks: [
        {
          format: 'markdown',
          title: 'Trust section',
          content:
            `## Dlaczego warto zaufać ${workspace.name}\n` +
            `- oficjalna domena: ${workspace.primaryDomain}\n` +
            `- dowody wiarygodności i sygnały E-E-A-T\n` +
            `- autor / ekspert z doświadczeniem branżowym`,
        },
      ],
    },
  ];

  for (const missing of missingAssets.slice(0, 3)) {
    actions.push({
      id: `missing-${missing.id}`,
      type: 'new-asset',
      priority: missing.priority,
      title: `Zbuduj brakujący asset: ${missing.assetType}`,
      summary: missing.reason,
      promptCluster: missing.promptCluster,
      targetAssetId: null,
      targetAssetLabel: missing.targetDescription,
      suggestedSchemas: missing.assetType === 'comparison' ? ['FAQ', 'Breadcrumb'] : missing.assetType === 'trust' ? ['Organization', 'SameAs'] : ['Article'],
      sourceReasons: [missing.reason],
      blocks: [
        {
          format: 'markdown',
          title: 'Asset brief',
          content: `${missing.targetDescription}\n\nPowód: ${missing.reason}`,
        },
      ],
    });
  }

  return actions.sort((left, right) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return (order[left.priority] ?? 4) - (order[right.priority] ?? 4);
  }).slice(0, 8);
}
async function getWorkspaceByDomain(userId: number, domain: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(entityWorkspaces)
    .where(and(
      eq(entityWorkspaces.userId, userId),
      eq(entityWorkspaces.domain, domain),
    ))
    .limit(1);
  return rows[0] ?? null;
}

export async function listEntityWorkspaces(userId: number): Promise<EntityWorkspaceConfig[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(entityWorkspaces)
    .where(eq(entityWorkspaces.userId, userId))
    .orderBy(desc(entityWorkspaces.updatedAt), desc(entityWorkspaces.createdAt));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    primaryDomain: row.domain,
    description: row.description,
    market: row.market,
    language: row.language,
    onboardingCompleted: true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function createEntityWorkspace(params: {
  userId: number;
  name: string;
  domain: string;
  description?: string | null;
  market?: string | null;
  language?: string | null;
  promptSeeds?: string[];
  competitorSeeds?: string[];
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const normalizedDomain = normalizeDomainInput(params.domain);
  const existing = await getWorkspaceByDomain(params.userId, normalizedDomain);
  if (existing) {
    throw new Error("Entity workspace for this domain already exists");
  }

  const [result] = await db.insert(entityWorkspaces).values({
    userId: params.userId,
    name: params.name.trim(),
    domain: normalizedDomain,
    normalizedDomain,
    description: params.description ?? null,
    market: params.market ?? null,
    language: params.language ?? "pl",
  });

  const workspaceId = (result as { insertId?: number })?.insertId;
  if (!workspaceId) throw new Error("Failed to create entity workspace");

  const promptSeeds = Array.from(new Set((params.promptSeeds ?? []).map((item) => item.trim()).filter(Boolean)));
  const competitorSeeds = Array.from(new Set((params.competitorSeeds ?? []).map((item) => normalizeDomainInput(item)).filter(Boolean)));

  if (promptSeeds.length > 0) {
    await db.insert(entityWorkspacePrompts).values(
      promptSeeds.map((prompt) => ({
        workspaceId,
        userId: params.userId,
        prompt,
        promptCluster: "brand",
        priority: "medium" as const,
        source: "onboarding" as const,
        isActive: true,
      }))
    );
  }

  if (competitorSeeds.length > 0) {
    await db.insert(entityWorkspaceCompetitors).values(
      competitorSeeds.map((domain) => ({
        workspaceId,
        userId: params.userId,
        domain,
        label: domainToBrandName(domain),
        source: "user_added" as const,
        isActive: true,
      }))
    );
  }

  return workspaceId;
}

export async function updateEntityWorkspace(params: {
  workspaceId: number;
  userId: number;
  name: string;
  description?: string | null;
  market?: string | null;
  language?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(entityWorkspaces)
    .set({
      name: params.name.trim(),
      description: params.description ?? null,
      market: params.market ?? null,
      language: params.language ?? "pl",
      updatedAt: new Date(),
    })
    .where(and(
      eq(entityWorkspaces.id, params.workspaceId),
      eq(entityWorkspaces.userId, params.userId),
    ));
}

export async function getEntityWorkspacePrompts(workspaceId: number, userId: number): Promise<EntityWorkspacePrompt[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(entityWorkspacePrompts)
    .where(and(
      eq(entityWorkspacePrompts.workspaceId, workspaceId),
      eq(entityWorkspacePrompts.userId, userId),
    ))
    .orderBy(asc(entityWorkspacePrompts.createdAt));

  return rows.map((row) => ({
    id: row.id,
    prompt: row.prompt,
    intentType: row.promptCluster,
    category: row.priority,
    source: row.source === "synced_from_monitoring" ? "suggested" : row.source,
    isActive: row.isActive,
    syncedAssets: row.mappedMonitoredPageId ? 1 : 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function getEntityWorkspaceCompetitors(workspaceId: number, userId: number): Promise<EntityWorkspaceCompetitor[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(entityWorkspaceCompetitors)
    .where(and(
      eq(entityWorkspaceCompetitors.workspaceId, workspaceId),
      eq(entityWorkspaceCompetitors.userId, userId),
    ))
    .orderBy(asc(entityWorkspaceCompetitors.createdAt));

  return rows.map((row) => ({
    id: row.id,
    domain: row.domain,
    label: row.label,
    createdAt: row.createdAt,
  }));
}

export async function addEntityWorkspacePrompt(params: {
  workspaceId: number;
  userId: number;
  prompt: string;
  intentType?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(entityWorkspacePrompts).values({
    workspaceId: params.workspaceId,
    userId: params.userId,
    prompt: params.prompt.trim(),
    promptCluster: params.intentType ?? "commercial",
    priority: "medium" as const,
    source: "user_added" as const,
    isActive: true,
  });

  return (result as { insertId?: number })?.insertId ?? null;
}

export async function toggleEntityWorkspacePrompt(params: {
  promptId: number;
  userId: number;
  isActive: boolean;
}) {
  const db = await getDb();
  if (!db) return false;
  await db
    .update(entityWorkspacePrompts)
    .set({ isActive: params.isActive, updatedAt: new Date() })
    .where(and(
      eq(entityWorkspacePrompts.id, params.promptId),
      eq(entityWorkspacePrompts.userId, params.userId),
    ));
  return true;
}

export async function deleteEntityWorkspacePrompt(promptId: number, userId: number) {
  const db = await getDb();
  if (!db) return false;
  await db
    .delete(entityWorkspacePrompts)
    .where(and(
      eq(entityWorkspacePrompts.id, promptId),
      eq(entityWorkspacePrompts.userId, userId),
    ));
  return true;
}

export async function addEntityWorkspaceCompetitor(params: {
  workspaceId: number;
  userId: number;
  domain: string;
  label?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const normalizedDomain = normalizeDomainInput(params.domain);

  const [result] = await db.insert(entityWorkspaceCompetitors).values({
    workspaceId: params.workspaceId,
    userId: params.userId,
    domain: normalizedDomain,
    label: params.label ?? domainToBrandName(normalizedDomain),
    source: "user_added" as const,
    isActive: true,
  });

  return (result as { insertId?: number })?.insertId ?? null;
}

export async function deleteEntityWorkspaceCompetitor(competitorId: number, userId: number) {
  const db = await getDb();
  if (!db) return false;
  await db
    .delete(entityWorkspaceCompetitors)
    .where(and(
      eq(entityWorkspaceCompetitors.id, competitorId),
      eq(entityWorkspaceCompetitors.userId, userId),
    ));
  return true;
}

export async function syncEntityWorkspacePromptsToMonitoring(params: {
  workspaceId: number;
  userId: number;
}) {
  const db = await getDb();
  if (!db) return { syncedPages: 0, syncedPrompts: 0 };

  const workspaceRows = await db
    .select()
    .from(entityWorkspaces)
    .where(and(
      eq(entityWorkspaces.id, params.workspaceId),
      eq(entityWorkspaces.userId, params.userId),
    ))
    .limit(1);

  const workspace = workspaceRows[0];
  if (!workspace) return { syncedPages: 0, syncedPrompts: 0 };

  const pages = await getMonitoredPagesByUser(params.userId);
  const matchingPages = pages.filter((page) => normalizeDomainInput(page.url) === workspace.domain);
  if (matchingPages.length === 0) return { syncedPages: 0, syncedPrompts: 0 };

  const prompts = await getEntityWorkspacePrompts(params.workspaceId, params.userId);
  const activePrompts = prompts.filter((prompt) => prompt.isActive);
  if (activePrompts.length === 0) return { syncedPages: matchingPages.length, syncedPrompts: 0 };

  const { addCustomPhrase, getPhrasesForPage } = await import("./monitoring/phrases");
  let syncedPrompts = 0;

  for (const page of matchingPages) {
    const existingPhrases = await getPhrasesForPage(page.id);
    const existingTexts = new Set(existingPhrases.map((phrase) => phrase.phrase.trim().toLowerCase()));

    for (const prompt of activePrompts) {
      if (existingTexts.has(prompt.prompt.trim().toLowerCase())) continue;
      const result = await addCustomPhrase({
        monitoredPageId: page.id,
        userId: params.userId,
        phrase: prompt.prompt,
        plan: "business",
      });
      if (result.success) {
        syncedPrompts += 1;
        existingTexts.add(prompt.prompt.trim().toLowerCase());
      }
    }
  }

  return { syncedPages: matchingPages.length, syncedPrompts };
}

export async function getEntityDetailData(userId: number, domain: string): Promise<EntityWorkspaceResponse | null> {
  const portfolioData = await getEntityPortfolioData(userId);
  const normalizedDomain = normalizeDomainInput(domain);
  const entity = portfolioData.entities.find((item) => item.domain === normalizedDomain) ?? null;
  const workspaceRow = await getWorkspaceByDomain(userId, normalizedDomain);

  if (!entity && !workspaceRow) return null;

  const workspace: EntityWorkspaceConfig = workspaceRow
    ? {
        id: workspaceRow.id,
        name: workspaceRow.name,
        primaryDomain: workspaceRow.domain,
        description: workspaceRow.description,
        market: workspaceRow.market,
        language: workspaceRow.language,
        onboardingCompleted: true,
        createdAt: workspaceRow.createdAt,
        updatedAt: workspaceRow.updatedAt,
      }
    : {
        id: null,
        name: domainToBrandName(normalizedDomain),
        primaryDomain: normalizedDomain,
        description: null,
        market: null,
        language: "pl",
        onboardingCompleted: false,
        createdAt: null,
        updatedAt: null,
      };

  const linkedPages = entity?.pages ?? [];
  const prompts = workspace.id ? await getEntityWorkspacePrompts(workspace.id, userId) : [];
  const competitors = workspace.id ? await getEntityWorkspaceCompetitors(workspace.id, userId) : [];
  const assets = await getEntityWorkspaceAssets(workspace.id, userId, linkedPages);
  const missingAssets = detectMissingAssets(prompts, assets);

  let explainability: EntityExplainabilitySummary = {
    topReasons: [],
    promptDiffs: [],
    blockerSummary: [],
  };

  const representativeAuditId = entity?.representativePageId
    ? await getRepresentativeAuditId(entity.representativePageId)
    : null;

  if (representativeAuditId) {
    try {
      const { computeOpportunities } = await import("./citation/opportunityFinder");
      const opportunities = await computeOpportunities(representativeAuditId, { includeSemanticInsights: false });
      explainability = buildExplainability(prompts, assets, missingAssets, opportunities);
    } catch (error) {
      console.warn("[entity.workspace] explainability fallback used:", error);
    }
  }

  if (explainability.topReasons.length === 0) {
    explainability = buildExplainability(prompts, assets, missingAssets, null);
  }

  const actionPlan = buildActionPlan(workspace, prompts, competitors, assets, missingAssets, explainability);

  const resolvedPortfolio = entity ?? {
    entityKey: normalizedDomain,
    domain: normalizedDomain,
    brandName: workspace.name,
    representative: {
      id: 0,
      url: `https://${normalizedDomain}`,
      label: "Brand root",
      lastScore: null,
      lastAuditAt: null,
      lastCitationAt: null,
      lastCitedEngines: null,
      lastTotalEngines: null,
      scheduleFrequency: 7,
    },
    representativePageId: null,
    pages: [],
    avgScore: null,
    avgReadinessScore: null,
    avgVisibilityScore: null,
    shareOfVoice: null,
    promptEstimate: prompts.length,
    promptCount: prompts.length,
    citedPromptCount: 0,
    coverageRate: null,
    topCompetitors: competitors.map((item) => item.domain),
    topThemes: [],
    sentimentLabel: "modelled" as const,
    sentimentScore: null,
    lastUpdatedAt: workspace.updatedAt,
    activeAlerts: 0,
    priorityAction: actionPlan[0]?.summary ?? "Zacznij od dodania prompt library i pierwszego monitorowanego assetu.",
    dataSource: "fallback" as const,
  };

  return {
    workspace,
    portfolio: resolvedPortfolio,
    prompts,
    competitors,
    linkedPages,
    assets,
    missingAssets,
    explainability,
    actionPlan,
    summary: portfolioData.summary,
    isConfigured: Boolean(workspace.id),
  };
}
