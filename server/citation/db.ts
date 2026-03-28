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
 * Structured cache of queries per round per engine, with citation-priority ordering.
 * round 0 = "priority pool" (frazy które historycznie dały cytowanie — sprawdzane jako pierwsze)
 */
export type CachedQueryMap = {
  /** key: engine, value: queries ordered by citation priority (yes > domain > no) */
  byEngine: Record<string, string[]>;
  /** key: `${round}:${engine}`, value: queries in original round order */
  byRoundEngine: Record<string, string[]>;
  /** frazy które w poprzednim jobie dały isCited='yes' lub 'domain' — najwyższy priorytet */
  citedFirst: Record<string, string[]>;
  maxRound: number;
};

/**
 * Returns structured query cache from the last completed citation job for this URL.
 *
 * Priority ordering within each engine:
 *   1. isCited='yes'  — exact URL was cited (highest value, check first)
 *   2. isCited='domain' — same domain cited (high value)
 *   3. isCited='no'  — not cited (check last, may find new citations)
 *
 * Returns null if no completed job exists within maxAgeDays (default: 30 days).
 */
export async function getQueriesForUrl(
  url: string,
  maxAgeDays = 30
): Promise<CachedQueryMap | null> {
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

  const checks = await getCitationChecksByJobId(job.id);
  if (checks.length === 0) return null;

  // Group by engine with citation-priority sort
  // Priority: yes=0, domain=1, no=2
  const PRIORITY: Record<string, number> = { yes: 0, domain: 1, no: 2 };
  const sorted = [...checks].sort((a, b) => {
    const pa = PRIORITY[a.isCited] ?? 2;
    const pb = PRIORITY[b.isCited] ?? 2;
    if (pa !== pb) return pa - pb; // cited first
    return a.round - b.round;      // then by round (earlier rounds first)
  });

  const byEngine: Record<string, string[]> = {};
  const byRoundEngine: Record<string, string[]> = {};
  const citedFirst: Record<string, string[]> = {};
  let maxRound = 1;

  for (const check of sorted) {
    const q = check.query?.trim();
    if (!q) continue;
    const engine = check.engine;
    const roundKey = `${check.round}:${engine}`;

    // byEngine: priority-sorted, deduplicated
    if (!byEngine[engine]) byEngine[engine] = [];
    if (!byEngine[engine].includes(q)) byEngine[engine].push(q);

    // byRoundEngine: per-round per-engine, original order (round sort above)
    if (!byRoundEngine[roundKey]) byRoundEngine[roundKey] = [];
    if (!byRoundEngine[roundKey].includes(q)) byRoundEngine[roundKey].push(q);

    // citedFirst: only queries that produced a citation
    if (check.isCited === "yes" || check.isCited === "domain") {
      if (!citedFirst[engine]) citedFirst[engine] = [];
      if (!citedFirst[engine].includes(q)) citedFirst[engine].push(q);
    }

    if (check.round > maxRound) maxRound = check.round;
  }

  const hasAny = Object.values(byEngine).some(qs => qs.length > 0);
  if (!hasAny) return null;

  return { byEngine, byRoundEngine, citedFirst, maxRound };
}
