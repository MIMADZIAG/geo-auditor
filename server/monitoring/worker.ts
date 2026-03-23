/**
 * Monitoring Cron Worker
 *
 * Architecture: Simple setInterval loop (no external cron library needed).
 * Runs every hour, queries DB for pages whose nextAuditAt <= now, and
 * triggers a full audit (scoring + issues + content intelligence, NO AI Exposure).
 *
 * Design decisions:
 * - No external queue (Bull/BullMQ) to keep infra minimal for MVP
 * - Concurrency limit: max 3 audits in parallel to avoid overloading LLM API
 * - Each run is idempotent: nextAuditAt is set BEFORE audit starts to prevent
 *   double-triggering if the process restarts mid-audit
 * - Email is sent after audit completes, failure is logged but non-fatal
 * - Only Starter and Pro plans are eligible (free plan excluded)
 */

import { runAudit } from "../audit/index";
import {
  getDb,
  getMonitoredPagesDueForAudit,
  updateMonitoredPageAfterAudit,
  addScoreSnapshot,
} from "../db";
import { monitorAuditRuns, monitoredPages, users, audits } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { sendMonitoringEmail } from "./email";

const WORKER_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const MAX_PARALLEL = 3; // max concurrent audits
const ELIGIBLE_PLANS = ["starter", "pro", "business"] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getAppUrl(): Promise<string> {
  // Use VITE_APP_URL if set, otherwise derive from VITE_APP_ID
  return process.env.VITE_APP_URL ?? "https://geo-auditor.app";
}

async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return rows[0] ?? null;
}

async function insertAuditRow(url: string, userId: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(audits).values({
    url,
    userId,
    status: "pending",
  });
  const [res] = result as unknown as [{ insertId: number }];
  return res.insertId;
}

async function updateAuditRow(auditId: number, data: Partial<typeof audits.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(audits).set(data).where(eq(audits.id, auditId));
}

async function insertMonitorRun(data: typeof monitorAuditRuns.$inferInsert) {
  const db = await getDb();
  if (!db) return;
  await db.insert(monitorAuditRuns).values(data);
}

async function markMonitorRunEmailSent(auditId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(monitorAuditRuns)
    .set({ emailSent: true })
    .where(eq(monitorAuditRuns.auditId, auditId));
}

/** Bump nextAuditAt immediately to prevent double-triggering */
async function reservePage(pageId: number, frequencyDays: number) {
  const db = await getDb();
  if (!db) return;
  const nextAuditAt = new Date(Date.now() + frequencyDays * 24 * 60 * 60 * 1000);
  await db
    .update(monitoredPages)
    .set({ nextAuditAt })
    .where(eq(monitoredPages.id, pageId));
}

// ─── Single page audit ────────────────────────────────────────────────────────

async function auditMonitoredPage(page: {
  id: number;
  url: string;
  userId: number;
  lastScore: number | null;
  scheduleFrequency: number;
  label: string | null;
}): Promise<void> {
  const { id: pageId, url, userId, lastScore, scheduleFrequency, label } = page;

  console.log(`[MonitorWorker] Auditing page #${pageId}: ${url}`);

  // Reserve slot immediately to prevent double-trigger
  await reservePage(pageId, scheduleFrequency);

  // Get user — verify plan eligibility
  const user = await getUserById(userId);
  if (!user) {
    console.warn(`[MonitorWorker] User #${userId} not found — skipping page #${pageId}`);
    return;
  }
  if (!(ELIGIBLE_PLANS as readonly string[]).includes(user.plan)) {
    console.log(`[MonitorWorker] User #${userId} on plan '${user.plan}' — not eligible, skipping`);
    return;
  }

  // Create audit row
  const auditId = await insertAuditRow(url, userId);

  try {
    await updateAuditRow(auditId, { status: "running" });

    // Run full audit (scoring + issues + content intelligence)
    // AI Exposure is intentionally excluded (expensive, on-demand only)
    const result = await runAudit(url);

    // Persist audit results
    await updateAuditRow(auditId, {
      status: "completed",
      overallScore: result.overallScore,
      technicalScore: result.findings.technical.score,
      structuredDataScore: result.findings.structuredData.score,
      contentStructureScore: result.findings.contentStructure.score,
      eeatScore: result.findings.eeat.score,
      aiCrawlerScore: result.findings.aiCrawlers.score,
      metaTagsScore: result.findings.metaTags.score,
      findings: result.findings as any,
      recommendations: result.recommendations as any,
      llmRecommendations: (result.llmResult?.recommendations ?? null) as any,
      llmAiInsight: result.llmResult?.aiInsight ?? null,
      llmTopPriority: result.llmResult?.topPriority ?? null,
      llmScoreGain: result.llmResult?.scoreGain ?? null,
      llmDifficulty: result.llmResult?.difficulty ?? null,
      contentIntelligence: (result.contentIntelligence ?? null) as any,
      contentIntelligenceScore: result.contentIntelligence?.overallScore ?? null,
      citeabilityScore: result.contentIntelligence?.citeabilityScore ?? null,
      pageTitle: result.pageTitle ?? null,
      completedAt: new Date(),
    });

    // Update monitored page record + score snapshot
    const scoreDelta =
      lastScore !== null && result.overallScore !== undefined
        ? parseFloat((result.overallScore - lastScore).toFixed(1))
        : null;

    await updateMonitoredPageAfterAudit(pageId, auditId, result.overallScore ?? 0);

    await addScoreSnapshot({
      monitoredPageId: pageId,
      auditId,
      overallScore: result.overallScore ?? 0,
      technicalScore: result.findings.technical.score,
      structuredDataScore: result.findings.structuredData.score,
      contentStructureScore: result.findings.contentStructure.score,
      eeatScore: result.findings.eeat.score,
      aiCrawlerScore: result.findings.aiCrawlers.score,
      metaTagsScore: result.findings.metaTags.score,
    });

    // Record monitor run
    await insertMonitorRun({
      monitoredPageId: pageId,
      auditId,
      userId,
      overallScore: result.overallScore ?? 0,
      scoreDelta,
      status: "completed",
      emailSent: false,
      triggeredBy: "cron",
    });

    // Send email notification if user has an email address
    if (user.email) {
      const appUrl = await getAppUrl();
      const emailSent = await sendMonitoringEmail({
        toEmail: user.email,
        toName: user.name,
        url,
        label,
        overallScore: result.overallScore ?? 0,
        scoreDelta,
        auditId,
        appUrl,
      });
      if (emailSent) {
        await markMonitorRunEmailSent(auditId);
      }
    } else {
      console.log(`[MonitorWorker] User #${userId} has no email — skipping notification`);
    }

    console.log(
      `[MonitorWorker] Page #${pageId} done — score: ${result.overallScore?.toFixed(1)}, delta: ${scoreDelta ?? "N/A"}`
    );
  } catch (err) {
    console.error(`[MonitorWorker] Audit failed for page #${pageId}:`, err);
    await updateAuditRow(auditId, {
      status: "failed",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    await insertMonitorRun({
      monitoredPageId: pageId,
      auditId,
      userId,
      overallScore: null,
      scoreDelta: null,
      status: "failed",
      emailSent: false,
      triggeredBy: "cron",
    });
  }
}

// ─── Batch runner ─────────────────────────────────────────────────────────────

async function runMonitoringBatch(): Promise<void> {
  console.log("[MonitorWorker] Checking for pages due for audit...");

  let pages: Awaited<ReturnType<typeof getMonitoredPagesDueForAudit>>;
  try {
    pages = await getMonitoredPagesDueForAudit();
  } catch (err) {
    console.error("[MonitorWorker] Failed to fetch due pages:", err);
    return;
  }

  if (pages.length === 0) {
    console.log("[MonitorWorker] No pages due for audit.");
    return;
  }

  console.log(`[MonitorWorker] Found ${pages.length} page(s) due for audit.`);

  // Process in batches of MAX_PARALLEL
  for (let i = 0; i < pages.length; i += MAX_PARALLEL) {
    const batch = pages.slice(i, i + MAX_PARALLEL);
    await Promise.allSettled(
      batch.map((page) =>
        auditMonitoredPage({
          id: page.id,
          url: page.url,
          userId: page.userId,
          lastScore: page.lastScore ?? null,
          scheduleFrequency: page.scheduleFrequency ?? 7,
          label: page.label ?? null,
        })
      )
    );
  }

  console.log("[MonitorWorker] Batch complete.");
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

export function startMonitoringWorker(): void {
  // Initial run 5 minutes after server start (let server warm up)
  setTimeout(() => {
    console.log("[MonitorWorker] Running initial check (5min after startup)...");
    runMonitoringBatch().catch((err) =>
      console.error("[MonitorWorker] Initial batch failed:", err)
    );
  }, 5 * 60 * 1000);

  // Recurring check every hour
  setInterval(() => {
    console.log("[MonitorWorker] Running hourly check...");
    runMonitoringBatch().catch((err) =>
      console.error("[MonitorWorker] Hourly batch failed:", err)
    );
  }, WORKER_INTERVAL_MS);

  console.log("[MonitorWorker] Scheduler active — checks every 1h, initial check in 5min.");
}
