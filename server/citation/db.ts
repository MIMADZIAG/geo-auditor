/**
 * Citation DB helpers — query functions for citation_jobs and citation_checks tables.
 */

import { getDb } from "../db";
import { citationJobs, citationChecks } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";

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
