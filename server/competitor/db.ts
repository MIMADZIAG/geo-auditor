/**
 * Competitor Intelligence — Database Helpers
 *
 * Thin wrappers around Drizzle queries for competitor_audits.
 * All business logic lives in engine.ts; this file is pure persistence.
 */

import { getDb } from "../db";
import { competitorAudits } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import type { CompetitorAuditColumns, CompetitorAuditInput } from "./engine";

// ─── Insert ───────────────────────────────────────────────────────────────────

export async function insertCompetitorAudit(params: {
  auditId: number;
  jobId: number;
  userId: number;
  input: CompetitorAuditInput;
  columns: CompetitorAuditColumns;
  pageTitle?: string | null;
  status: "completed" | "failed";
  errorMessage?: string | null;
}): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.insert(competitorAudits).values({
    auditId:       params.auditId,
    jobId:         params.jobId,
    userId:        params.userId,
    url:           params.input.url,
    domain:        params.input.domain,
    citationCount: params.input.citationCount,
    rank:          params.input.rank,
    pageTitle:     params.pageTitle ?? null,
    status:        params.status,
    errorMessage:  params.errorMessage ?? null,
    completedAt:   new Date(),
    ...params.columns,
  });
  return (result as { insertId: number }).insertId;
}

// ─── Query ────────────────────────────────────────────────────────────────────

/** Get all competitor audits for a given source audit, ordered by rank */
export async function getCompetitorAuditsForAudit(auditId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(competitorAudits)
    .where(eq(competitorAudits.auditId, auditId))
    .orderBy(competitorAudits.rank);
}

/** Get competitor audits for a given citation job */
export async function getCompetitorAuditsForJob(jobId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(competitorAudits)
    .where(eq(competitorAudits.jobId, jobId))
    .orderBy(competitorAudits.rank);
}

/** Check if competitor audits already exist for this audit (dedup guard) */
export async function competitorAuditsExist(auditId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db
    .select({ id: competitorAudits.id })
    .from(competitorAudits)
    .where(
      and(
        eq(competitorAudits.auditId, auditId),
        eq(competitorAudits.status, "completed")
      )
    )
    .limit(1);
  return rows.length > 0;
}
