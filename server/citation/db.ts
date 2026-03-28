/**
 * Citation DB helpers — query functions for citation_jobs and citation_checks tables.
 */

import { getDb } from "../db";
import { citationJobs, citationChecks } from "../../drizzle/schema";
import { eq, desc, and, gte } from "drizzle-orm";

export async function createCitationJob(params: {
  auditId: number;
  userId?: number | null;
  url: string;
  prompts: string[];
  language?: string;
}): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  const [result] = await db.insert(citationJobs).values({
    auditId: params.auditId,
    userId: params.userId ?? null,
    url: params.url,
    status: "pending",
    prompts: params.prompts,
    language: params.language ?? "en",
  });

  // MySQL insertId
  const insertResult = result as any;
  return insertResult?.insertId ?? null;
}

export async function getCitationJobByAuditId(auditId: number) {
  const db = await getDb();
  if (!db) return null;

  const jobs = await db
    .select()
    .from(citationJobs)
    .where(eq(citationJobs.auditId, auditId))
    .orderBy(desc(citationJobs.createdAt))
    .limit(1);

  return jobs[0] ?? null;
}

export async function getCitationChecksByJobId(jobId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(citationChecks)
    .where(eq(citationChecks.jobId, jobId))
    .orderBy(citationChecks.round, citationChecks.engine, citationChecks.checkedAt);
}

export async function getCitationResultsForAudit(auditId: number) {
  const db = await getDb();
  if (!db) return { job: null, checks: [] };

  const job = await getCitationJobByAuditId(auditId);
  if (!job) return { job: null, checks: [] };

  const checks = await getCitationChecksByJobId(job.id);
  return { job, checks };
}

/**
 * Returns per-engine queries from the last completed citation job for this URL.
 * Used to reuse proven queries instead of regenerating them via LLM on every re-audit.
 * Ensures analytical consistency: same URL is always checked with the same query set.
 *
 * Returns null if no completed job exists within maxAgeDays (default: 30 days),
 * triggering fresh query generation.
 */
export async function getQueriesForUrl(
  url: string,
  maxAgeDays = 30
): Promise<Record<string, string[]> | null> {
  const db = await getDb();
  if (!db) return null;

  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

  // Find last completed job for this exact URL within maxAgeDays
  const jobs = await db
    .select()
    .from(citationJobs)
    .where(
      and(
        eq(citationJobs.url, url),
        eq(citationJobs.status, "completed"),
        gte(citationJobs.createdAt, cutoff)
      )
    )
    .orderBy(desc(citationJobs.createdAt))
    .limit(1);

  const job = jobs[0];
  if (!job) return null;

  // Fetch all checks for this job and group unique queries by engine
  const checks = await getCitationChecksByJobId(job.id);
  if (checks.length === 0) return null;

  const byEngine: Record<string, string[]> = {};
  for (const check of checks) {
    if (!byEngine[check.engine]) byEngine[check.engine] = [];
    const q = check.query?.trim();
    if (q && !byEngine[check.engine].includes(q)) {
      byEngine[check.engine].push(q);
    }
  }

  // Return only if we have at least one engine with queries
  const hasAny = Object.values(byEngine).some(qs => qs.length > 0);
  return hasAny ? byEngine : null;
}
