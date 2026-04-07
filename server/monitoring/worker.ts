/**
 * Monitoring Cron Worker v2 — with AI Citation Visibility
 *
 * Architecture: Simple setInterval loop (no external cron library needed).
 * Runs every hour, queries DB for pages whose nextAuditAt <= now, and
 * triggers a full audit (scoring + issues + content intelligence).
 *
 * NEW in v2: After each successful audit, automatically triggers a citation
 * job (async, non-blocking). When the citation job completes, it:
 *   1. Updates monitored_pages.lastCitedEngines / lastTotalEngines
 *   2. Updates score_snapshots.citedEnginesCount / totalEnginesChecked
 *   3. Includes citation data in the monitoring email
 *
 * Design decisions:
 * - No external queue (Bull/BullMQ) to keep infra minimal for MVP
 * - Concurrency limit: max 3 audits in parallel to avoid overloading LLM API
 * - Each run is idempotent: nextAuditAt is set BEFORE audit starts to prevent
 *   double-triggering if the process restarts mid-audit
 * - Citation job is fire-and-forget — audit email sent immediately, citation
 *   data backfills the snapshot when the job finishes (5-10 min later)
 * - Query caching: citation worker reuses cached queries for known URLs
 *   (saves 4-12 LLM calls per re-audit via getQueriesForUrl)
 * - Only Starter and Pro plans are eligible (free plan excluded)
 */

import { runAudit } from "../audit/index";
import {
  getDb,
  getMonitoredPagesDueForAudit,
  updateMonitoredPageAfterAudit,
  addScoreSnapshot,
  updateMonitoredPageCitationStatus,
  updateScoreSnapshotCitation,
} from "../db";
import { createCitationJob, getCitationResultsForAudit } from "../citation/db";
import { runCitationJob } from "../citation/worker";
import { extractTopCompetitorUrls, runCompetitorAudits } from "../competitor/engine";
import { insertCompetitorAudit, competitorAuditsExist } from "../competitor/db";
import { monitorAuditRuns, monitoredPages, users, audits, monitoredPagePhrases, phraseCitationHistory, visibilitySnapshots, scoreSnapshots } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { sendMonitoringEmail, type MonitoringEmailPayload } from "./email";
import { evaluateAndSendAlerts } from "./alerts";
import { analyzeCitationSentiment } from "./sentimentAnalyzer";
import { computeAIVisibilityScore } from "../../shared/visibilityScore";

const WORKER_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const MAX_PARALLEL = 3; // max concurrent audits
const ELIGIBLE_PLANS = ["starter", "pro", "business"] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getAppUrl(): Promise<string> {
  return process.env.VITE_APP_URL ?? "https://geoauditor-2tppvwaq.manus.space";
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

// ─── Citation job runner (async, non-blocking) ────────────────────────────────

/**
 * Triggers a citation job for a monitored page after its audit completes.
 * Runs asynchronously — does NOT block the main audit flow.
 *
 * When complete:
 *   1. Updates monitored_pages with latest citation counts
 *   2. Backfills score_snapshot with citation data for trend tracking
 *   3. Sends a follow-up email if citation status changed significantly
 */
async function triggerCitationJobForMonitoredPage(params: {
  pageId: number;
  auditId: number;
  url: string;
  userId: number;
  previousCitedEngines: number | null;
  userEmail: string | null;
  userName: string | null;
  label: string | null;
  appUrl: string;
  plan?: string;
}): Promise<void> {
  const { pageId, auditId, url, userId, previousCitedEngines, userEmail, userName, label, appUrl, plan } = params;

  try {
    console.log(`[MonitorWorker][Citation] Starting citation job for page #${pageId}: ${url}`);

    // Load INTENT-MATRIX phrases from DB — these are the canonical monitoring phrases
    // generated by phraseGenerator.ts (reverse-engineered from page content).
    // Passing them as prompts ensures the cron uses the same phrase set as manual checks,
    // enabling reliable trend tracking across runs.
    let seedPhrases: string[] = [];
    try {
      const { getActivePhrasesForPage } = await import("./phrases");
      const storedPhrases = await getActivePhrasesForPage(pageId);
      seedPhrases = storedPhrases.map((p) => p.phrase);
      if (seedPhrases.length > 0) {
        console.log(`[MonitorWorker][Citation] Seeding ${seedPhrases.length} INTENT-MATRIX phrases for page #${pageId}`);
      }
    } catch (phraseErr) {
      console.warn(`[MonitorWorker][Citation] Phrase seed lookup failed (non-fatal), falling back to LLM generation:`, phraseErr);
    }

    // Create citation job — uses INTENT-MATRIX phrases as round 1 queries (if available)
    // Falls back to LLM-generated fanOutQueries when no phrases stored yet
    const jobId = await createCitationJob({
      auditId,
      userId,
      url,
      prompts: seedPhrases, // INTENT-MATRIX phrases from monitored_page_phrases
      language: "auto",
    });

    if (!jobId) {
      console.warn(`[MonitorWorker][Citation] Failed to create citation job for page #${pageId}`);
      return;
    }

    // Run citation job synchronously within this async context
    // (the outer caller already runs this in a fire-and-forget promise)
    const citationResult = await runCitationJob(jobId);

    if (!citationResult) {
      console.warn(`[MonitorWorker][Citation] Citation job ${jobId} returned null for page #${pageId}`);
      return;
    }

    // Calculate citation summary
    const summary = citationResult.summary;
    const engines = ["chatgpt", "google", "perplexity", "gemini"] as const;
    const citedEngines = engines.filter(
      (e) => summary[e].cited > 0 || summary[e].domainCited > 0
    ).length;
    const totalEngines = engines.length;

    console.log(
      `[MonitorWorker][Citation] Page #${pageId} — ${citedEngines}/${totalEngines} engines cite this page`
    );

    // 1. Update monitored_pages with latest citation status
    await updateMonitoredPageCitationStatus(pageId, citedEngines, totalEngines);

    // 2. Backfill score_snapshot with citation data for trend chart
    await updateScoreSnapshotCitation(auditId, pageId, citedEngines, totalEngines, jobId);

    // 3. Trigger competitor intelligence — parallel audit of top-5 cited competitor URLs
    // Fire-and-forget: non-blocking, non-critical, deduped by auditId
    if (!await competitorAuditsExist(auditId)) {
      void (async () => {
        try {
          let targetDomain = "";
          try { targetDomain = new URL(url).hostname.replace(/^www\./, ""); } catch {}
          const topUrls = extractTopCompetitorUrls(citationResult.allResults, targetDomain);
          if (topUrls.length > 0) {
            console.log(`[CompetitorIntel] Auditing ${topUrls.length} competitors for audit #${auditId}`);
            const results = await runCompetitorAudits(topUrls);
            for (const r of results) {
              await insertCompetitorAudit({
                auditId,
                jobId,
                userId,
                input: r.input,
                columns: r.columns,
                pageTitle: null,
                status: r.error ? "failed" : "completed",
                errorMessage: r.error ?? null,
              });
            }
            console.log(`[CompetitorIntel] Saved ${results.length} competitor audits for audit #${auditId}`);
          }
        } catch (err) {
          console.error(`[CompetitorIntel] Failed for audit #${auditId}:`, err);
        }
      })();
    }

    // 3.5 Record per-phrase citation history for sparkline trend chart
    // Maps each active phrase to its per-engine citation result from this run
    try {
      const db = await getDb();
      if (db) {
        const phrases = await db
          .select({ id: monitoredPagePhrases.id, phrase: monitoredPagePhrases.phrase })
          .from(monitoredPagePhrases)
          .where(and(
            eq(monitoredPagePhrases.monitoredPageId, pageId),
            eq(monitoredPagePhrases.isActive, true)
          ));

        if (phrases.length > 0) {
          const historyRows: typeof phraseCitationHistory.$inferInsert[] = phrases.map((p) => {
            // Match citation results to this phrase (case-insensitive substring match)
            const phraseNorm = p.phrase.toLowerCase();
            const phraseResults = citationResult.allResults.filter(
              (r) => r.query.toLowerCase().includes(phraseNorm) || phraseNorm.includes(r.query.toLowerCase())
            );
            const cited = (engine: string) =>
              phraseResults.some((r) => r.engine === engine && (r.isCited === "yes" || r.isCited === "domain"));
            const chatgptCited = cited("chatgpt");
            const perplexityCited = cited("perplexity");
            const googleCited = cited("google");
            const geminiCited = cited("gemini");
            const citedCount = [chatgptCited, perplexityCited, googleCited, geminiCited].filter(Boolean).length;
            return {
              phraseId: p.id,
              monitoredPageId: pageId,
              citationJobId: jobId,
              chatgptCited,
              perplexityCited,
              googleCited,
              geminiCited,
              citedEnginesCount: citedCount,
            };
          });
          await db.insert(phraseCitationHistory).values(historyRows);
          console.log(`[MonitorWorker][PhraseHistory] Recorded ${historyRows.length} phrase history rows for page #${pageId}`);

          // 3.6b Citation feedback loop: auto-deactivate weak phrases after THRESHOLD zero-citation runs.
          // Runs after history is recorded so the new run is included in the analysis.
          // Non-fatal: if this fails, monitoring continues normally.
          try {
            const { runCitationFeedbackLoop } = await import("./phrases");
            const weakPhrases = await runCitationFeedbackLoop(pageId);
            if (weakPhrases.length > 0) {
              console.log(
                `[MonitorWorker][FeedbackLoop] Deactivated ${weakPhrases.length} weak phrase(s) for page #${pageId}: ` +
                weakPhrases.map((p) => `"${p.phrase}"`).join(", ")
              );
            }
          } catch (feedbackErr) {
            console.warn(`[MonitorWorker][FeedbackLoop] Failed for page #${pageId} (non-fatal):`, feedbackErr);
          }
        }
      }
    } catch (histErr) {
      // Non-fatal — sparkline data missing for this run but monitoring continues
      console.warn(`[MonitorWorker][PhraseHistory] Failed to record phrase history for page #${pageId}:`, histErr);
    }

    // 3.7 Sentiment analysis + visibility snapshot — fire-and-forget enrichment
    //     Runs after phrase history, non-blocking, non-critical
    void (async () => {
      try {
        const sentimentResult = await analyzeCitationSentiment(
          citationResult.allResults,
          url
        );
        const visibilityRate = totalEngines > 0 ? citedEngines / totalEngines : 0;
        const visibilityScore = computeAIVisibilityScore(citedEngines, totalEngines, null);
        const db = await getDb();
        if (db) {
          // Write visibility_snapshots row (independent from score_snapshots)
          await db.insert(visibilitySnapshots).values({
            monitoredPageId: pageId,
            citationJobId: jobId,
            auditId,
            citedEnginesCount: citedEngines,
            totalEnginesChecked: totalEngines,
            visibilityRate,
            visibilityScore,
            sentimentScore: sentimentResult.sentimentScore,
            sentimentLabel: sentimentResult.sentimentLabel,
            sentimentThemes: sentimentResult.themes,
            avgMentionPosition: sentimentResult.avgMentionPosition,
            prominenceRate: sentimentResult.prominenceRate,
            shareOfVoice: sentimentResult.shareOfVoice,
            competitorCitationCount: sentimentResult.competitorCitationCount,
            topCompetitorDomains: sentimentResult.topCompetitorDomains,
            engineBreakdown: sentimentResult.engineBreakdown,
            sampleResponses: sentimentResult.sampleResponses,
          });
          // Backfill score_snapshots with new visibility dimensions
          await db
            .update(scoreSnapshots)
            .set({
              visibilityRate,
              sentimentScore: sentimentResult.sentimentScore,
              prominenceRate: sentimentResult.prominenceRate,
              shareOfVoice: sentimentResult.shareOfVoice,
              competitorCitationCount: sentimentResult.competitorCitationCount,
              avgMentionPosition: sentimentResult.avgMentionPosition,
            })
            .where(
              and(
                eq(scoreSnapshots.auditId, auditId),
                eq(scoreSnapshots.monitoredPageId, pageId)
              )
            );
          console.log(`[MonitorWorker][Sentiment] Saved visibility snapshot for page #${pageId} — sentiment: ${sentimentResult.sentimentLabel} (${sentimentResult.sentimentScore})`);
        }
      } catch (sentErr) {
        console.warn(`[MonitorWorker][Sentiment] Failed for page #${pageId}:`, sentErr);
      }
    })();

    // 4. Detect significant citation change — send follow-up email if needed
    // "Significant" = went from 0 to any, or increased by 2+ engines
    const citationChanged =
      previousCitedEngines !== null &&
      (
        (previousCitedEngines === 0 && citedEngines > 0) ||
        Math.abs(citedEngines - previousCitedEngines) >= 2
      );

    if (citationChanged && userEmail) {
      // Send citation change notification
      await sendCitationChangeEmail({
        toEmail: userEmail,
        toName: userName,
        url,
        label,
        citedEngines,
        totalEngines,
        previousCitedEngines,
        auditId,
        appUrl,
      });
      console.log(`[MonitorWorker][Citation] Citation change email sent to ${userEmail}`);
    }

    // 5. Smart alert system — new_citation / lost_citation / competitor
    //    Non-blocking, fire-and-forget with built-in cooldowns
    const competitorDomains: string[] = [];
    if (citationResult.allResults) {
      let ownDomain = "";
      try { ownDomain = new URL(url).hostname.replace(/^www\./, ""); } catch {}
      for (const r of citationResult.allResults as Array<{ cited?: boolean; citedUrl?: string | null }>) {
        if (r.cited && r.citedUrl) {
          try {
            const d = new URL(r.citedUrl).hostname.replace(/^www\./, "");
            if (d && d !== ownDomain) competitorDomains.push(d);
          } catch {}
        }
      }
    }
    void evaluateAndSendAlerts({
      pageId, url, label, userEmail, userName, appUrl, auditId,
      citedEngines, totalEngines,
      previousCitedEngines,
      plan: plan ?? "starter",
      competitorDomains: Array.from(new Set(competitorDomains)).slice(0, 3),
    });

  } catch (err) {
    // Citation failure is non-fatal — audit already completed successfully
    console.error(`[MonitorWorker][Citation] Job failed for page #${pageId}:`, err);
  }
}

// ─── Citation change email ────────────────────────────────────────────────────

async function sendCitationChangeEmail(params: {
  toEmail: string;
  toName: string | null;
  url: string;
  label: string | null;
  citedEngines: number;
  totalEngines: number;
  previousCitedEngines: number;
  auditId: number;
  appUrl: string;
}): Promise<void> {
  const { toEmail, toName, url, label, citedEngines, totalEngines, previousCitedEngines, auditId, appUrl } = params;

  const pageLabel = label ?? url;
  const reportUrl = `${appUrl}/results/${auditId}?tab=visibility`;
  const isImprovement = citedEngines > previousCitedEngines;
  const subject = isImprovement
    ? `🎉 Twoja strona jest teraz widoczna w ${citedEngines}/${totalEngines} silnikach AI`
    : `⚠️ Zmiana widoczności AI — ${pageLabel}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
        <div style="margin-bottom:24px;">
          <span style="font-size:13px;font-weight:700;letter-spacing:0.08em;color:#7c3aed;text-transform:uppercase;">GEO-Auditor</span>
        </div>
        <h1 style="font-size:22px;font-weight:700;color:#f4f4f5;margin:0 0 8px 0;">
          ${isImprovement ? '🎉 Wzrost widoczności AI!' : '⚠️ Zmiana widoczności AI'}
        </h1>
        <p style="font-size:14px;color:#a1a1aa;margin:0 0 24px 0;">${pageLabel}</p>

        <div style="background:#18181b;border-radius:12px;padding:20px;margin-bottom:20px;border:1px solid #27272a;">
          <p style="font-size:13px;color:#71717a;margin:0 0 12px 0;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Widoczność w AI Search</p>
          <div style="display:flex;align-items:center;gap:16px;">
            <div style="text-align:center;">
              <div style="font-size:32px;font-weight:800;color:${previousCitedEngines > 0 ? '#22c55e' : '#ef4444'};">${previousCitedEngines}</div>
              <div style="font-size:11px;color:#71717a;">poprzednio</div>
            </div>
            <div style="font-size:20px;color:#3f3f46;">→</div>
            <div style="text-align:center;">
              <div style="font-size:32px;font-weight:800;color:${citedEngines > 0 ? '#22c55e' : '#ef4444'};">${citedEngines}</div>
              <div style="font-size:11px;color:#71717a;">teraz</div>
            </div>
            <div style="font-size:14px;color:#71717a;">/ ${totalEngines} silników AI</div>
          </div>
        </div>

        <p style="font-size:14px;color:#a1a1aa;margin:0 0 24px 0;">
          ${isImprovement
            ? `Twoja strona jest teraz cytowana przez <strong style="color:#f4f4f5;">${citedEngines} z ${totalEngines}</strong> silników AI (ChatGPT, Perplexity, Google AI, Gemini). To oznacza, że więcej użytkowników AI Search może trafić na Twoją stronę.`
            : `Widoczność Twojej strony w AI Search zmieniła się. Sprawdź raport, aby zobaczyć szczegóły i rekomendacje.`
          }
        </p>

        <a href="${reportUrl}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
          Zobacz raport widoczności AI →
        </a>

        <p style="font-size:12px;color:#52525b;margin:32px 0 0 0;">
          GEO-Auditor monitoruje Twoją stronę automatycznie. <a href="${appUrl}/dashboard" style="color:#7c3aed;text-decoration:none;">Zarządzaj monitoringiem</a>
        </p>
      </div>
    </body>
    </html>
  `;

  try {
    if (process.env.RESEND_API_KEY) {
      const { default: axios } = await import("axios");
      await axios.post(
        "https://api.resend.com/emails",
        {
          from: "GEO-Auditor <monitoring@geoauditor.app>",
          to: [toEmail],
          subject,
          html,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 10000,
        }
      );
    } else {
      // Dev fallback — log to console
      console.log(`[CitationEmail] DEV MODE — would send to ${toEmail}: ${subject}`);
    }
  } catch (err) {
    console.error("[CitationEmail] Failed to send citation change email:", err);
  }
}

// ─── Single page audit ────────────────────────────────────────────────────────

async function auditMonitoredPage(page: {
  id: number;
  url: string;
  userId: number;
  lastScore: number | null;
  lastCitedEngines: number | null;
  scheduleFrequency: number;
  label: string | null;
}): Promise<void> {
  const { id: pageId, url, userId, lastScore, lastCitedEngines, scheduleFrequency, label } = page;

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
      pageType: result.pageType ?? null,
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
      // Citation fields will be backfilled by triggerCitationJobForMonitoredPage
      citedEnginesCount: null,
      totalEnginesChecked: null,
      citationJobId: null,
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

    const appUrl = await getAppUrl();

    // Send audit email notification immediately (before citation job)
    if (user.email) {
      const emailSent = await sendMonitoringEmail({
        toEmail: user.email,
        toName: user.name,
        url,
        label,
        overallScore: result.overallScore ?? 0,
        scoreDelta,
        auditId,
        appUrl,
        // Citation data not yet available — will be shown in next email
        citedEngines: null,
        totalEngines: null,
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

    // ── Fire-and-forget citation job ──────────────────────────────────────────
    // Runs async after audit email is sent — backfills citation data in snapshot
    triggerCitationJobForMonitoredPage({
      pageId,
      auditId,
      url,
      userId,
      previousCitedEngines: lastCitedEngines,
      userEmail: user.email ?? null,
      userName: user.name ?? null,
      label,
      appUrl,
    }).catch((err) => {
      console.error(`[MonitorWorker][Citation] Background job failed for page #${pageId}:`, err);
    });

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
          lastCitedEngines: page.lastCitedEngines ?? null,
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
