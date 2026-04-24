import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { runAudit } from "./audit/index";
import { createCitationJob, getCitationResultsForAudit } from "./citation/db";
import { computeOpportunities } from "./citation/opportunityFinder";
import { runCitationJob } from "./citation/worker";
import { getQuickSignal } from "./citation/quickSignal";
import { getLastHealthReport, runAndCacheHealthCheck } from "./citation/selectorHealth";
import { createCheckoutSession, createBillingPortalSession } from "./stripe/handler";
import { PLANS, getPlanLimits } from "./stripe/products";
import { getDb } from "./db";
import { users, audits } from "../drizzle/schema";
import { eq, sql, desc } from "drizzle-orm";
import {
  createAudit,
  updateAudit,
  getAuditById,
  getAuditsByUser,
  getAuditUsageStats,
  checkRateLimit,
  incrementRateLimit,
  getMonitoredPagesByUser,
  addMonitoredPage,
  removeMonitoredPage,
  updateMonitoredPageAfterAudit,
  updateMonitoredPageFrequency,
  addScoreSnapshot,
  getScoreSnapshots,
  MAX_MONITORING_SLOTS_FREE,
  captureEmailLead,
  updateMonitoredPageCitationStatus,
  updateScoreSnapshotCitation,
  getEntityPortfolioData,
  createEntityWorkspace,
  getEntityDetailData,
  addEntityWorkspacePrompt,
  toggleEntityWorkspacePrompt,
  deleteEntityWorkspacePrompt,
  addEntityWorkspaceCompetitor,
  deleteEntityWorkspaceCompetitor,
  syncEntityWorkspacePromptsToMonitoring,
} from "./db";
import { guardAgainstHallucinations } from "./rewrite/hallucinationGuard";
import { runRewriteResearch } from "./rewrite/rewriteResearch";
import { normalizePolishCapitalization, normalizePolishContent, isPolishText } from "./utils/textNormalization";
import { runPageCreatorPipeline } from "./pageCreator/index";
import { pageCreations, aiExposureCache, citationJobs, citationChecks } from "../drizzle/schema";
import { computeAiExposureScore, type AiExposureResult } from "./aiExposure/index";
import { ENV } from "./_core/env";
import { notifyOwner } from "./_core/notification";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  audit: router({
    run: publicProcedure
      .input(
        z.object({
          url: z.string().url("Please enter a valid URL (e.g. https://example.com)"),
          monitoredPageId: z.number().optional(), // if triggered by monitoring scheduler
        })
      )
      .mutation(async ({ ctx, input }) => {
        const ip =
          (ctx.req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
          (ctx.req as unknown as { ip?: string }).ip ??
          "unknown";

        // Rate limit only anonymous users
        if (!ctx.user) {
          const { allowed, remaining, resetAt } = await checkRateLimit(ip);
          if (!allowed) {
            throw new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message: `Free audit limit reached. You can run ${remaining} more audit${remaining !== 1 ? "s" : ""} after ${resetAt.toLocaleTimeString()}.`,
            });
          }
        }

        const insertResult = await createAudit({
          url: input.url,
          userId: ctx.user?.id ?? null,
          ipAddress: ip,
          status: "running",
        });

        const auditId = Number((insertResult as unknown as [{ insertId: number }, unknown])[0]?.insertId);

        try {
          const result = await runAudit(input.url);

          await updateAudit(auditId, {
            status: result.error ? "failed" : "completed",
            overallScore: result.overallScore,
            technicalScore: result.findings.technical.score,
            structuredDataScore: result.findings.structuredData.score,
            contentStructureScore: result.findings.contentStructure.score,
            eeatScore: result.findings.eeat.score,
            aiCrawlerScore: result.findings.aiCrawlers.score,
            metaTagsScore: result.findings.metaTags.score,
            findings: result.findings as unknown as Record<string, unknown>,
            recommendations: result.recommendations as unknown as Record<string, unknown>[],
            llmRecommendations: result.llmResult?.recommendations as unknown as Record<string, unknown>[] ?? null,
            llmAiInsight: result.llmResult?.aiInsight ?? null,
            llmTopPriority: result.llmResult?.topPriority ?? null,
            llmScoreGain: result.llmResult?.scoreGain ?? null,
            llmDifficulty: result.llmResult?.difficulty ?? null,
            contentIntelligence: result.contentIntelligence as unknown as Record<string, unknown> ?? null,
            contentIntelligenceScore: result.contentIntelligence?.overallScore ?? null,
            citeabilityScore: result.contentIntelligence?.citeabilityScore ?? null,
            pageTitle: result.pageTitle,
            pageType: result.pageType ?? null,
            wafBlocked: result.wafBlocked ?? false,
            errorMessage: result.error ?? null,
            completedAt: new Date(),
          });

          // If this audit was triggered for a monitored page, update it + add snapshot
          if (input.monitoredPageId && result.overallScore != null) {
            await updateMonitoredPageAfterAudit(input.monitoredPageId, auditId, result.overallScore);
            await addScoreSnapshot({
              monitoredPageId: input.monitoredPageId,
              auditId,
              overallScore: result.overallScore,
              technicalScore: result.findings.technical.score,
              structuredDataScore: result.findings.structuredData.score,
              contentStructureScore: result.findings.contentStructure.score,
              eeatScore: result.findings.eeat.score,
              aiCrawlerScore: result.findings.aiCrawlers.score,
              metaTagsScore: result.findings.metaTags.score,
            });
          }

          if (!ctx.user) {
            await incrementRateLimit(ip);
          }

          return { auditId, result };
        } catch (err) {
          await updateAudit(auditId, {
            status: "failed",
            errorMessage: err instanceof Error ? err.message : "Unknown error",
            completedAt: new Date(),
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Audit failed. Please try again.",
          });
        }
      }),

    // Public endpoint — anyone can view a report by ID (for share links)
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const audit = await getAuditById(input.id);
        if (!audit) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Audit not found." });
        }
        return audit;
      }),

    myHistory: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(200).default(20) }))
      .query(async ({ ctx, input }) => {
        return getAuditsByUser(ctx.user.id, input.limit);
      }),
    getUsageStats: protectedProcedure.query(async ({ ctx }) => {
      return getAuditUsageStats(ctx.user.id);
    }),

    getGlobalStats: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { totalAudits: 0 };
      const result = await db.select({ count: sql`COUNT(*)` }).from(audits);
      const count = Number(result[0]?.count ?? 0);
      return { totalAudits: count };
    }),

    /**
     * audit.start — Fire-and-forget variant of audit.run.
     *
     * Returns { auditId } IMMEDIATELY after creating the DB row (status="running").
     * The full Signal Audit runs in the background — the client navigates to
     * /results/:auditId right away and polls audit.getById for live progress.
     *
     * This enables TRUE PARALLEL execution:
     *   - Signal Audit runs in the background (30–60s)
     *   - Citation Intelligence starts concurrently on the frontend
     *   - User sees live SSE feed from Citation from the very first second
     *   - CitationLoadingBridge shows Signal Audit issues as they arrive
     */
    start: publicProcedure
      .input(
        z.object({
          url: z.string().url("Please enter a valid URL (e.g. https://example.com)"),
          monitoredPageId: z.number().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const ip =
          (ctx.req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
          (ctx.req as unknown as { ip?: string }).ip ??
          "unknown";

        if (!ctx.user) {
          const { allowed, remaining, resetAt } = await checkRateLimit(ip);
          if (!allowed) {
            throw new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message: `Free audit limit reached. You can run ${remaining} more audit${remaining !== 1 ? "s" : ""} after ${resetAt.toLocaleTimeString()}.`,
            });
          }
          // Increment immediately to prevent concurrent abuse before audit finishes
          await incrementRateLimit(ip);
        }

        const insertResult = await createAudit({
          url: input.url,
          userId: ctx.user?.id ?? null,
          ipAddress: ip,
          status: "running",
        });
        const auditId = Number((insertResult as unknown as [{ insertId: number }, unknown])[0]?.insertId);

        // Fire-and-forget — do NOT await
        const capturedMonitoredPageId = input.monitoredPageId;
        (async () => {
          try {
            const result = await runAudit(input.url);
            await updateAudit(auditId, {
              status: result.error ? "failed" : "completed",
              overallScore: result.overallScore,
              technicalScore: result.findings.technical.score,
              structuredDataScore: result.findings.structuredData.score,
              contentStructureScore: result.findings.contentStructure.score,
              eeatScore: result.findings.eeat.score,
              aiCrawlerScore: result.findings.aiCrawlers.score,
              metaTagsScore: result.findings.metaTags.score,
              findings: result.findings as unknown as Record<string, unknown>,
              recommendations: result.recommendations as unknown as Record<string, unknown>[],
              llmRecommendations: result.llmResult?.recommendations as unknown as Record<string, unknown>[] ?? null,
              llmAiInsight: result.llmResult?.aiInsight ?? null,
              llmTopPriority: result.llmResult?.topPriority ?? null,
              llmScoreGain: result.llmResult?.scoreGain ?? null,
              llmDifficulty: result.llmResult?.difficulty ?? null,
              contentIntelligence: result.contentIntelligence as unknown as Record<string, unknown> ?? null,
              contentIntelligenceScore: result.contentIntelligence?.overallScore ?? null,
              citeabilityScore: result.contentIntelligence?.citeabilityScore ?? null,
              pageTitle: result.pageTitle,
              pageType: result.pageType ?? null,
              wafBlocked: result.wafBlocked ?? false,
              errorMessage: result.error ?? null,
              completedAt: new Date(),
            });
            if (capturedMonitoredPageId && result.overallScore != null) {
              await updateMonitoredPageAfterAudit(capturedMonitoredPageId, auditId, result.overallScore);
              await addScoreSnapshot({
                monitoredPageId: capturedMonitoredPageId,
                auditId,
                overallScore: result.overallScore,
                technicalScore: result.findings.technical.score,
                structuredDataScore: result.findings.structuredData.score,
                contentStructureScore: result.findings.contentStructure.score,
                eeatScore: result.findings.eeat.score,
                aiCrawlerScore: result.findings.aiCrawlers.score,
                metaTagsScore: result.findings.metaTags.score,
              });
            }
          } catch (err) {
            await updateAudit(auditId, {
              status: "failed",
              errorMessage: err instanceof Error ? err.message : "Unknown error",
              completedAt: new Date(),
            }).catch(() => {/* non-fatal */});
            console.error(`[audit.start] Background audit ${auditId} failed:`, err);
          }
        })();

        // Return immediately — client navigates to /results/:auditId right away
        return { auditId };
      }),
  }),

  // ─── Monitoring procedures ────────────────────────────────────────────────────

  monitoring: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const pages = await getMonitoredPagesByUser(ctx.user.id);
      return pages;
    }),

    add: protectedProcedure
      .input(
        z.object({
          url: z.string().url("Please enter a valid URL"),
          label: z.string().max(255).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const existing = await getMonitoredPagesByUser(ctx.user.id);
        const userPlan = ctx.user.plan ?? "free";
        const planLimits = getPlanLimits(userPlan);
        const maxPages = planLimits.monitoredPages; // Infinity for business/pro

        // Enforce per-plan monitoring slot limit
        if (maxPages !== Infinity && existing.length >= maxPages) {
          const planLabel = userPlan === "free" ? "Free" : userPlan.charAt(0).toUpperCase() + userPlan.slice(1);
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `${planLabel} plan allows monitoring ${maxPages} page${maxPages !== 1 ? "s" : ""}. Upgrade to monitor more.`,
          });
        }

        // Schedule first audit immediately (nextAuditAt = now)
        const nextAuditAt = new Date();
        const id = await addMonitoredPage({
          userId: ctx.user.id,
          url: input.url,
          label: input.label ?? null,
          nextAuditAt,
        });

        // Fire-and-forget: initialize CI-based phrases for this page.
        // Runs async — user gets instant response, phrases appear in PhraseManager shortly after.
        (async () => {
          try {
            const { initializePhrasesForPage } = await import("./monitoring/phrases");
            await initializePhrasesForPage({
              monitoredPageId: id,
              userId: ctx.user.id,
              url: input.url,
              plan: userPlan,
            });
          } catch (err) {
            // Non-fatal — phrases can be initialized manually via PhraseManager
            console.warn("[monitoring.add] phrase init failed (non-fatal):", err);
          }
        })();

        return { id };
      }),

    remove: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await removeMonitoredPage(input.id, ctx.user.id);
        return { success: true };
      }),

    getSnapshots: protectedProcedure
      .input(z.object({ monitoredPageId: z.number(), limit: z.number().default(10) }))
      .query(async ({ ctx, input }) => {
        // Verify ownership
        const pages = await getMonitoredPagesByUser(ctx.user.id);
        const owned = pages.find((p) => p.id === input.monitoredPageId);
        if (!owned) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Monitored page not found." });
        }
        const snapshots = await getScoreSnapshots(input.monitoredPageId, input.limit);
        return snapshots;
      }),

    // Change monitoring frequency (Pro/Business only for non-weekly)
    setFrequency: protectedProcedure
      .input(z.object({
        id: z.number(),
        frequencyDays: z.number().int().min(1).max(30),
      }))
      .mutation(async ({ ctx, input }) => {
        const plan = ctx.user.plan ?? "free";
        const limits = getPlanLimits(plan);

        // Starter: locked to 7 days (weekly)
        if (plan === "starter" && input.frequencyDays !== 7) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Plan Starter obsługuje wyłącznie cotygodniowy monitoring. Przejdź na plan Pro, aby zmienić częstotliwość.",
          });
        }
        // Free: no monitoring
        if (plan === "free") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Automatyczny monitoring jest dostępny od planu Starter.",
          });
        }

        // Verify ownership
        const pages = await getMonitoredPagesByUser(ctx.user.id);
        const owned = pages.find((p) => p.id === input.id);
        if (!owned) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Monitorowana strona nie została znaleziona." });
        }

        await updateMonitoredPageFrequency(input.id, ctx.user.id, input.frequencyDays);
        return { success: true, frequencyDays: input.frequencyDays };
      }),

    // Get monitor audit run history for a page
    getRunHistory: protectedProcedure
      .input(z.object({ monitoredPageId: z.number(), limit: z.number().default(10) }))
      .query(async ({ ctx, input }) => {
        const pages = await getMonitoredPagesByUser(ctx.user.id);
        const owned = pages.find((p) => p.id === input.monitoredPageId);
        if (!owned) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Monitorowana strona nie została znaleziona." });
        }
        const db = await (await import("./db")).getDb();
        if (!db) return [];
        const { monitorAuditRuns } = await import("../drizzle/schema");
        const { desc: descOrd } = await import("drizzle-orm");
        return db
          .select()
          .from(monitorAuditRuns)
          .where((await import("drizzle-orm")).eq(monitorAuditRuns.monitoredPageId, input.monitoredPageId))
          .orderBy(descOrd(monitorAuditRuns.createdAt))
          .limit(input.limit);
      }),

    // Per-engine citation breakdown for a monitored page (latest citation job)
    getEngineBreakdown: protectedProcedure
      .input(z.object({ monitoredPageId: z.number() }))
      .query(async ({ ctx, input }) => {
        const pages = await getMonitoredPagesByUser(ctx.user.id);
        const owned = pages.find((p) => p.id === input.monitoredPageId);
        if (!owned) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Monitorowana strona nie została znaleziona." });
        }
        const { getEngineBreakdownForPage } = await import("./db");
        return getEngineBreakdownForPage(input.monitoredPageId);
      }),

    // ── Phrase management ─────────────────────────────────────────────────────
    /**
     * Get canonical phrases for a URL — used by AICitationPanel to show the
     * same phrase set that Monitoring uses, unifying the phrase source of truth.
     * Returns null if the URL is not monitored by this user.
     */
    getPhrasesForUrl: protectedProcedure
      .input(z.object({ url: z.string().url() }))
      .query(async ({ ctx, input }) => {
        const pages = await getMonitoredPagesByUser(ctx.user.id);
        // Normalize URL for comparison (strip trailing slash)
        const normalize = (u: string) => {
          try { return new URL(u).href.replace(/\/$/, ""); }
          catch { return u.replace(/\/$/, ""); }
        };
        const normalizedInput = normalize(input.url);
        const page = pages.find((p) => normalize(p.url) === normalizedInput);
        if (!page) return null; // not monitored — caller shows CTA
        const { getPhrasesForPage } = await import("./monitoring/phrases");
        const phrases = await getPhrasesForPage(page.id);
        return { monitoredPageId: page.id, phrases };
      }),

    getPhrases: protectedProcedure
      .input(z.object({ monitoredPageId: z.number() }))
      .query(async ({ ctx, input }) => {
        const pages = await getMonitoredPagesByUser(ctx.user.id);
        const owned = pages.find((p) => p.id === input.monitoredPageId);
        if (!owned) throw new TRPCError({ code: "NOT_FOUND", message: "Monitorowana strona nie została znaleziona." });
        const { getPhrasesForPage } = await import("./monitoring/phrases");
        return getPhrasesForPage(input.monitoredPageId);
      }),

    initializePhrases: protectedProcedure
      .input(z.object({ monitoredPageId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const pages = await getMonitoredPagesByUser(ctx.user.id);
        const owned = pages.find((p) => p.id === input.monitoredPageId);
        if (!owned) throw new TRPCError({ code: "NOT_FOUND", message: "Monitorowana strona nie została znaleziona." });
        const { initializePhrasesForPage } = await import("./monitoring/phrases");
        const result = await initializePhrasesForPage({
          monitoredPageId: input.monitoredPageId,
          userId: ctx.user.id,
          url: owned.url,
          plan: ctx.user.plan ?? "free",
        });
        return result;
      }),

    addPhrase: protectedProcedure
      .input(z.object({
        monitoredPageId: z.number(),
        phrase: z.string().min(3).max(300),
      }))
      .mutation(async ({ ctx, input }) => {
        const pages = await getMonitoredPagesByUser(ctx.user.id);
        const owned = pages.find((p) => p.id === input.monitoredPageId);
        if (!owned) throw new TRPCError({ code: "NOT_FOUND", message: "Monitorowana strona nie została znaleziona." });
        const { addCustomPhrase } = await import("./monitoring/phrases");
        const result = await addCustomPhrase({
          monitoredPageId: input.monitoredPageId,
          userId: ctx.user.id,
          phrase: input.phrase,
          plan: ctx.user.plan ?? "free",
        });
        if (!result.success) throw new TRPCError({ code: "FORBIDDEN", message: result.error ?? "Nie można dodać frazy." });
        return result.phrase!;
      }),

    togglePhrase: protectedProcedure
      .input(z.object({ phraseId: z.number(), isActive: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const { togglePhrase } = await import("./monitoring/phrases");
        const ok = await togglePhrase(input.phraseId, ctx.user.id, input.isActive);
        if (!ok) throw new TRPCError({ code: "NOT_FOUND", message: "Fraza nie została znaleziona." });
        return { success: true };
      }),

    deletePhrase: protectedProcedure
      .input(z.object({ phraseId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { deleteCustomPhrase } = await import("./monitoring/phrases");
        const ok = await deleteCustomPhrase(input.phraseId, ctx.user.id);
        if (!ok) throw new TRPCError({ code: "FORBIDDEN", message: "Można usuwać tylko własne frazy." });
        return { success: true };
      }),

    // Returns last N citation history rows per phrase — powers sparkline trend chart
    getPhraseHistory: protectedProcedure
      .input(z.object({ monitoredPageId: z.number(), limit: z.number().min(1).max(30).default(7) }))
      .query(async ({ ctx, input }) => {
        const pages = await getMonitoredPagesByUser(ctx.user.id);
        const owned = pages.find((p) => p.id === input.monitoredPageId);
        if (!owned) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied." });

        const db = await getDb();
        if (!db) return [];

        const { phraseCitationHistory, monitoredPagePhrases } = await import("../drizzle/schema");
        const { desc, and: andOp, eq: eqOp, inArray } = await import("drizzle-orm");

        // Fetch all active phrases for this page
        const phrases = await db
          .select({ id: monitoredPagePhrases.id, phrase: monitoredPagePhrases.phrase })
          .from(monitoredPagePhrases)
          .where(andOp(
            eqOp(monitoredPagePhrases.monitoredPageId, input.monitoredPageId),
            eqOp(monitoredPagePhrases.isActive, true)
          ));

        if (phrases.length === 0) return [];

        // Fetch last N history rows per phrase
        const phraseIds = phrases.map((p) => p.id);
        const history = await db
          .select()
          .from(phraseCitationHistory)
          .where(inArray(phraseCitationHistory.phraseId, phraseIds))
          .orderBy(desc(phraseCitationHistory.recordedAt));

        // Group by phraseId, keep last N per phrase
        const grouped = new Map<number, typeof history>();
        for (const row of history) {
          const existing = grouped.get(row.phraseId) ?? [];
          if (existing.length < input.limit) {
            existing.push(row);
            grouped.set(row.phraseId, existing);
          }
        }

        // Return flat array with phrase text attached
        const phraseMap = new Map(phrases.map((p) => [p.id, p.phrase]));
        return Array.from(grouped.entries()).map(([phraseId, rows]) => ({
          phraseId,
          phrase: phraseMap.get(phraseId) ?? "",
          history: rows.reverse(), // chronological order for chart
        }));
      }),

    /**
     * Phrase coverage: how many active phrases were cited at least once
     * in the most recent citation run for this page.
     * Returns { total, cited } — used by MonitoredPageCard coverage pill.
     */
    getPhraseCoverage: protectedProcedure
      .input(z.object({ monitoredPageId: z.number() }))
      .query(async ({ ctx, input }) => {
        const pages = await getMonitoredPagesByUser(ctx.user.id);
        const owned = pages.find((p) => p.id === input.monitoredPageId);
        if (!owned) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied." });
        const db = await getDb();
        if (!db) return { total: 0, cited: 0 };
        const { phraseCitationHistory, monitoredPagePhrases } = await import("../drizzle/schema");
        const { desc: descOp, and: andOp, eq: eqOp, inArray: inArrayOp } = await import("drizzle-orm");
        // Get all active phrases
        const phrases = await db
          .select({ id: monitoredPagePhrases.id })
          .from(monitoredPagePhrases)
          .where(andOp(
            eqOp(monitoredPagePhrases.monitoredPageId, input.monitoredPageId),
            eqOp(monitoredPagePhrases.isActive, true)
          ));
        if (phrases.length === 0) return { total: 0, cited: 0 };
        const phraseIds = phrases.map((p) => p.id);
        // Fetch latest history row per phrase (most recent run)
        const latestRows = await db
          .select()
          .from(phraseCitationHistory)
          .where(inArrayOp(phraseCitationHistory.phraseId, phraseIds))
          .orderBy(descOp(phraseCitationHistory.recordedAt));
        // Keep only the most recent row per phrase
        const seen = new Set<number>();
        const latestPerPhrase: typeof latestRows = [];
        for (const row of latestRows) {
          if (!seen.has(row.phraseId)) {
            seen.add(row.phraseId);
            latestPerPhrase.push(row);
          }
        }
        const cited = latestPerPhrase.filter((r) => r.citedEnginesCount > 0).length;
        return { total: phrases.length, cited };
      }),

    // ── Visibility Score history — powers the KPI trend chart in monitoring section
    getVisibilityHistory: protectedProcedure
      .input(z.object({ monitoredPageId: z.number(), limit: z.number().min(1).max(90).default(30) }))
      .query(async ({ ctx, input }) => {
        const pages = await getMonitoredPagesByUser(ctx.user.id);
        const owned = pages.find((p) => p.id === input.monitoredPageId);
        if (!owned) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied." });
        const db = await getDb();
        if (!db) return [];
        const { visibilitySnapshots } = await import("../drizzle/schema");
        const { desc: descVis, eq: eqVis } = await import("drizzle-orm");
        const rows = await db
          .select({
            id: visibilitySnapshots.id,
            citedEnginesCount: visibilitySnapshots.citedEnginesCount,
            totalEnginesChecked: visibilitySnapshots.totalEnginesChecked,
            visibilityRate: visibilitySnapshots.visibilityRate,
            visibilityScore: visibilitySnapshots.visibilityScore,
            sentimentScore: visibilitySnapshots.sentimentScore,
            sentimentLabel: visibilitySnapshots.sentimentLabel,
            shareOfVoice: visibilitySnapshots.shareOfVoice,
            prominenceRate: visibilitySnapshots.prominenceRate,
            recordedAt: visibilitySnapshots.recordedAt,
          })
          .from(visibilitySnapshots)
          .where(eqVis(visibilitySnapshots.monitoredPageId, input.monitoredPageId))
          .orderBy(descVis(visibilitySnapshots.recordedAt))
          .limit(input.limit);
        return rows.reverse();
      }),

    // ── Sentiment Dashboard data — latest snapshot with full sentiment breakdown
    getSentimentDashboard: protectedProcedure
      .input(z.object({ monitoredPageId: z.number() }))
      .query(async ({ ctx, input }) => {
        const pages = await getMonitoredPagesByUser(ctx.user.id);
        const owned = pages.find((p) => p.id === input.monitoredPageId);
        if (!owned) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied." });
        const db = await getDb();
        if (!db) return null;
        const { visibilitySnapshots } = await import("../drizzle/schema");
        const { desc: descSent, eq: eqSent } = await import("drizzle-orm");
        const rows = await db
          .select()
          .from(visibilitySnapshots)
          .where(eqSent(visibilitySnapshots.monitoredPageId, input.monitoredPageId))
          .orderBy(descSent(visibilitySnapshots.recordedAt))
          .limit(5);
        if (rows.length === 0) return null;
        const latest = rows[0]!;
        const sentimentTrend = [...rows].reverse().map((r) => ({
          recordedAt: r.recordedAt,
          sentimentScore: r.sentimentScore,
          sentimentLabel: r.sentimentLabel,
          visibilityScore: r.visibilityScore,
        }));
        return {
          sentimentScore: latest.sentimentScore,
          sentimentLabel: latest.sentimentLabel,
          themes: (latest.sentimentThemes as string[]) ?? [],
          engineBreakdown: latest.engineBreakdown as Record<string, { cited: boolean; sentimentScore?: number; snippet?: string }> | null,
          sampleResponses: (latest.sampleResponses as Array<{ engine: string; query: string; responseText: string; sentimentScore: number | null; themes: string[] }>) ?? [],
          prominenceRate: latest.prominenceRate,
          avgMentionPosition: latest.avgMentionPosition,
          visibilityScore: latest.visibilityScore,
          sentimentTrend,
          recordedAt: latest.recordedAt,
        };
      }),

    // ── Competitive Benchmarking — reuses visibility_snapshots SoV + competitor data
    getCompetitorBenchmark: protectedProcedure
      .input(z.object({ monitoredPageId: z.number() }))
      .query(async ({ ctx, input }) => {
        const pages = await getMonitoredPagesByUser(ctx.user.id);
        const owned = pages.find((p) => p.id === input.monitoredPageId);
        if (!owned) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied." });
        const db = await getDb();
        if (!db) return null;
        const { visibilitySnapshots, citationChecks, citationJobs, audits } = await import("../drizzle/schema");
        const { desc: descComp, eq: eqComp, and: andComp, inArray: inArrayComp } = await import("drizzle-orm");

        // ── Primary path: visibility_snapshots (populated by monitoring worker) ──
        const [latestSnap] = await db
          .select()
          .from(visibilitySnapshots)
          .where(eqComp(visibilitySnapshots.monitoredPageId, input.monitoredPageId))
          .orderBy(descComp(visibilitySnapshots.recordedAt))
          .limit(1);

        const sovTrend = await db
          .select({
            recordedAt: visibilitySnapshots.recordedAt,
            shareOfVoice: visibilitySnapshots.shareOfVoice,
            visibilityScore: visibilitySnapshots.visibilityScore,
            competitorCitationCount: visibilitySnapshots.competitorCitationCount,
          })
          .from(visibilitySnapshots)
          .where(eqComp(visibilitySnapshots.monitoredPageId, input.monitoredPageId))
          .orderBy(descComp(visibilitySnapshots.recordedAt))
          .limit(10);

        // ── Fallback path: aggregate competitorDomains directly from citation_checks ──
        // Used when visibility_snapshots is empty (no monitoring cycle yet) but
        // the user has run Citation Intelligence from the audit results page.
        // Also enriches the primary path with fresh citation data.
        let liveCompetitorDomains: Array<{ domain: string; count: number }> = [];
        let liveEngineBreakdown: Record<string, { cited: boolean; citedCount: number; totalQueries: number }> = {};
        let liveCitedCount = 0;
        let liveTotalEngines = 0;
        try {
          // Get all audits for this URL (owned by this user)
          const userAudits = await db
            .select({ id: audits.id })
            .from(audits)
            .where(andComp(eqComp(audits.url, owned.url), eqComp(audits.userId, ctx.user.id)))
            .orderBy(descComp(audits.createdAt))
            .limit(5);

          if (userAudits.length > 0) {
            // Get citation jobs for these audits
            const auditIds = userAudits.map((a) => a.id);
            const jobs = await db
              .select()
              .from(citationJobs)
              .where(inArrayComp(citationJobs.auditId, auditIds))
              .orderBy(descComp(citationJobs.createdAt))
              .limit(3);

            if (jobs.length > 0) {
              const jobIds = jobs.map((j) => j.id);
              // Get all citation checks for these jobs
              const checks = await db
                .select({
                  engine: citationChecks.engine,
                  isCited: citationChecks.isCited,
                  competitorDomains: citationChecks.competitorDomains,
                })
                .from(citationChecks)
                .where(inArrayComp(citationChecks.jobId, jobIds));

              // Aggregate competitor domains with frequency count
              const domainFreq = new Map<string, number>();
              const engineStats: Record<string, { cited: number; total: number }> = {};

              for (const check of checks) {
                // Engine stats
                if (!engineStats[check.engine]) engineStats[check.engine] = { cited: 0, total: 0 };
                engineStats[check.engine].total++;
                if (check.isCited === "yes" || check.isCited === "domain") {
                  engineStats[check.engine].cited++;
                }
                // Competitor domains
                const domains = (check.competitorDomains as string[] | null) ?? [];
                for (const domain of domains) {
                  if (!domain || domain.length < 4) continue;
                  domainFreq.set(domain, (domainFreq.get(domain) ?? 0) + 1);
                }
              }

              // Sort by frequency, take top 10
              liveCompetitorDomains = Array.from(domainFreq.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([domain, count]) => ({ domain, count }));

              // Build engine breakdown
              for (const [engine, stats] of Object.entries(engineStats)) {
                liveEngineBreakdown[engine] = {
                  cited: stats.cited > 0,
                  citedCount: stats.cited,
                  totalQueries: stats.total,
                };
              }

              const citedEngineNames = Object.entries(engineStats).filter(([, s]) => s.cited > 0);
              liveCitedCount = citedEngineNames.length;
              liveTotalEngines = Object.keys(engineStats).length || 4;
            }
          }
        } catch (err) {
          console.warn("[getCompetitorBenchmark] live aggregation failed (non-fatal):", err);
        }

        // ── Merge: prefer snapshot data, enrich with live citation data ──
        if (!latestSnap && liveCompetitorDomains.length === 0) return null;

        // If snapshot exists, use it as base; enrich competitors with live data if snapshot has none
        const topCompetitorDomains = latestSnap?.topCompetitorDomains && (latestSnap.topCompetitorDomains as unknown[]).length > 0
          ? (latestSnap.topCompetitorDomains as Array<{ domain: string; count: number; sentimentScore?: number }>)
          : liveCompetitorDomains;

        const engineBreakdown = latestSnap?.engineBreakdown && Object.keys(latestSnap.engineBreakdown as object).length > 0
          ? (latestSnap.engineBreakdown as Record<string, { cited: boolean; sentimentScore?: number }>)
          : Object.fromEntries(
              Object.entries(liveEngineBreakdown).map(([engine, data]) => [
                engine,
                { cited: data.cited, citedCount: data.citedCount, totalQueries: data.totalQueries },
              ])
            );

        return {
          shareOfVoice: latestSnap?.shareOfVoice ?? (
            liveTotalEngines > 0 ? liveCitedCount / liveTotalEngines : null
          ),
          competitorCitationCount: latestSnap?.competitorCitationCount ?? liveCompetitorDomains.reduce((s, c) => s + c.count, 0),
          topCompetitorDomains,
          engineBreakdown,
          sovTrend: [...sovTrend].reverse(),
          recordedAt: latestSnap?.recordedAt ?? null,
          // Flag indicating data source — frontend can show appropriate label
          dataSource: latestSnap ? "monitoring" : "citation_checks",
          liveCompetitorCount: liveCompetitorDomains.length,
        };
      }),

    // ── Competitor Benchmark by Audit ID ─────────────────────────────────────
    // Works without Pulse Monitor — reads citation_checks from one-off Citation
    // Intelligence runs. Used in Results Tab 2 to show competitor data immediately.
    getCompetitorBenchmarkByAudit: protectedProcedure
      .input(z.object({ auditId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return null;
        const { citationChecks, citationJobs, audits } = await import("../drizzle/schema");
        const { desc: d2, eq: e2, and: a2, inArray: ia2 } = await import("drizzle-orm");
        // Verify audit belongs to this user
        const [audit] = await db.select({ id: audits.id, userId: audits.userId, url: audits.url })
          .from(audits).where(e2(audits.id, input.auditId)).limit(1);
        if (!audit || audit.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        // Get citation jobs for this audit
        const jobs = await db.select().from(citationJobs)
          .where(e2(citationJobs.auditId, input.auditId))
          .orderBy(d2(citationJobs.createdAt)).limit(3);
        if (jobs.length === 0) return null;
        const jobIds = jobs.map((j) => j.id);
        const checks = await db.select({
          engine: citationChecks.engine,
          isCited: citationChecks.isCited,
          competitorDomains: citationChecks.competitorDomains,
        }).from(citationChecks).where(ia2(citationChecks.jobId, jobIds));
        if (checks.length === 0) return null;
        // Aggregate competitor domains
        const domainFreq = new Map<string, number>();
        const engineStats: Record<string, { cited: number; total: number }> = {};
        for (const check of checks) {
          if (!engineStats[check.engine]) engineStats[check.engine] = { cited: 0, total: 0 };
          engineStats[check.engine].total++;
          if (check.isCited === "yes" || check.isCited === "domain") engineStats[check.engine].cited++;
          for (const domain of ((check.competitorDomains as string[] | null) ?? [])) {
            if (domain && domain.length >= 4) domainFreq.set(domain, (domainFreq.get(domain) ?? 0) + 1);
          }
        }
        const topCompetitorDomains = Array.from(domainFreq.entries())
          .sort((a, b) => b[1] - a[1]).slice(0, 10)
          .map(([domain, count]) => ({ domain, count }));
        const engineBreakdown = Object.fromEntries(
          Object.entries(engineStats).map(([engine, s]) => [engine, { cited: s.cited > 0, citedCount: s.cited, totalQueries: s.total }])
        );
        const citedCount = Object.values(engineStats).filter((s) => s.cited > 0).length;
        const totalEngines = Object.keys(engineStats).length || 4;
        return {
          shareOfVoice: citedCount / totalEngines,
          competitorCitationCount: topCompetitorDomains.reduce((s, c) => s + c.count, 0),
          topCompetitorDomains,
          engineBreakdown,
          sovTrend: [],
          recordedAt: jobs[0]?.createdAt ?? null,
          dataSource: "citation_checks" as const,
          liveCompetitorCount: topCompetitorDomains.length,
          url: audit.url,
        };
      }),

    // ── Run Citation Intelligence directly from Pulse Monitor ──────────────────
    // Starts a citation job for the last audit of a monitored page.
    // Returns { jobId, auditId } immediately — poll citation.getStatus for progress.
    runCitationCheck: protectedProcedure
      .input(z.object({ monitoredPageId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const pages = await getMonitoredPagesByUser(ctx.user.id);
        const owned = pages.find((p) => p.id === input.monitoredPageId);
        if (!owned) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied." });
        if (!owned.lastAuditId) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Brak audytu dla tej strony. Uruchom najpierw audyt." });
        }
        // Delegate to citation.startCheck — it handles deduplication, phrase seeding, and bridge logic
        const { runCitationJob } = await import("./citation/worker");
        const { createCitationJob, getCitationJobByAuditId } = await import("./citation/db");
        const audit = await getAuditById(owned.lastAuditId);
        if (!audit) throw new TRPCError({ code: "NOT_FOUND", message: "Audit not found" });
        // Check for already-running job (deduplication)
        const existingJob = await getCitationJobByAuditId(owned.lastAuditId);
        if (existingJob && (existingJob.status === "pending" || existingJob.status === "running")) {
          return { jobId: existingJob.id, auditId: owned.lastAuditId, alreadyRunning: true };
        }
        // Seed phrases from monitoring (same canonical phrase set as citation.startCheck)
        let seedPhrases: string[] = [];
        try {
          const { getActivePhrasesForPage } = await import("./monitoring/phrases");
          const phrases = await getActivePhrasesForPage(input.monitoredPageId);
          seedPhrases = phrases.map((p) => p.phrase).filter(Boolean);
        } catch {
          // Non-fatal — worker will generate phrases via LLM
        }
        const jobId = await createCitationJob({
          auditId: owned.lastAuditId,
          userId: ctx.user.id,
          url: audit.url,
          prompts: seedPhrases,  // empty = LLM-generated; non-empty = monitoring seed
          language: "auto",
        });
        if (!jobId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create citation job" });
        // Fire-and-forget — same pattern as citation.startCheck
        const capturedMonitoredPageId = input.monitoredPageId;
        const capturedAuditId = owned.lastAuditId;
        runCitationJob(jobId).then(async (result) => {
          if (!result) return;
          const summary = result.summary;
          const citedEngines = [
            summary.chatgpt.cited + summary.chatgpt.domainCited > 0 ? 1 : 0,
            summary.google.cited + summary.google.domainCited > 0 ? 1 : 0,
            summary.perplexity.cited + summary.perplexity.domainCited > 0 ? 1 : 0,
            summary.gemini.cited + summary.gemini.domainCited > 0 ? 1 : 0,
          ].reduce((a, b) => a + b, 0);
          const totalEngines = Object.values(summary).filter((e) => e.total > 0).length || 4;
          await updateMonitoredPageCitationStatus(capturedMonitoredPageId, citedEngines, totalEngines).catch(() => {});
          await updateScoreSnapshotCitation(capturedAuditId, capturedMonitoredPageId, citedEngines, totalEngines, jobId).catch(() => {});
        }).catch((err) => console.error("[monitoring.runCitationCheck] job failed:", err));
        return { jobId, auditId: owned.lastAuditId, alreadyRunning: false };
      }),

    // ── Get active citation job status for a monitored page ───────────────────
    // Used by the spinner in the monitored page bar.
    getActiveCitationJob: protectedProcedure
      .input(z.object({ monitoredPageId: z.number() }))
      .query(async ({ ctx, input }) => {
        const pages = await getMonitoredPagesByUser(ctx.user.id);
        const owned = pages.find((p) => p.id === input.monitoredPageId);
        if (!owned || !owned.lastAuditId) return null;
        const { getCitationJobByAuditId } = await import("./citation/db");
        const job = await getCitationJobByAuditId(owned.lastAuditId);
        if (!job) return null;
        return {
          jobId: job.id,
          status: job.status, // "pending" | "running" | "completed" | "failed"
          createdAt: job.createdAt,
          completedAt: job.completedAt,
        };
      }),
   }),
  entity: router({
    portfolio: protectedProcedure.query(async ({ ctx }) => {
      return getEntityPortfolioData(ctx.user.id);
    }),

    createWorkspace: protectedProcedure
      .input(
        z.object({
          name: z.string().min(2).max(120),
          primaryDomain: z.string().min(3).max(255),
          market: z.string().max(120).optional(),
          language: z.string().min(2).max(10).default("pl"),
          description: z.string().max(1000).optional(),
          primaryUrl: z.string().url().optional(),
          prompts: z.array(z.string().min(3).max(300)).max(30).default([]),
          competitors: z.array(z.string().min(3).max(255)).max(20).default([]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const created = await createEntityWorkspace({
          userId: ctx.user.id,
          name: input.name,
          domain: input.primaryDomain,
          market: input.market,
          language: input.language,
          description: input.description,
          promptSeeds: input.prompts,
          competitorSeeds: input.competitors,
        });
        return created;
      }),

    workspace: protectedProcedure
      .input(z.object({ domain: z.string().min(3).max(255) }))
      .query(async ({ ctx, input }) => {
        const workspace = await getEntityDetailData(ctx.user.id, input.domain);
        if (!workspace) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Entity workspace not found." });
        }
        return { workspace };
      }),

    addPrompt: protectedProcedure
      .input(
        z.object({
          entityId: z.number().int().positive(),
          phrase: z.string().min(3).max(300),
          intentType: z.enum([
            "informational",
            "navigational",
            "commercial",
            "transactional",
            "comparative",
            "how_to",
            "problem_solving",
          ]).default("commercial"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const promptId = await addEntityWorkspacePrompt({
          workspaceId: input.entityId,
          userId: ctx.user.id,
          prompt: input.phrase,
          intentType: input.intentType,
        });
        await syncEntityWorkspacePromptsToMonitoring({ workspaceId: input.entityId, userId: ctx.user.id });
        return { id: promptId };
      }),

    togglePrompt: protectedProcedure
      .input(
        z.object({
          promptId: z.number().int().positive(),
          isActive: z.boolean(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await toggleEntityWorkspacePrompt({
          promptId: input.promptId,
          userId: ctx.user.id,
          isActive: input.isActive,
        });
        return { success: true };
      }),

    deletePrompt: protectedProcedure
      .input(z.object({ promptId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        await deleteEntityWorkspacePrompt(input.promptId, ctx.user.id);
        return { success: true };
      }),

    addCompetitor: protectedProcedure
      .input(
        z.object({
          entityId: z.number().int().positive(),
          domain: z.string().min(3).max(255),
          label: z.string().max(120).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const competitorId = await addEntityWorkspaceCompetitor({
          workspaceId: input.entityId,
          userId: ctx.user.id,
          domain: input.domain,
          label: input.label,
        });
        return { id: competitorId };
      }),

    removeCompetitor: protectedProcedure
      .input(z.object({ competitorId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        await deleteEntityWorkspaceCompetitor(input.competitorId, ctx.user.id);
        return { success: true };
      }),
  }),
  leads: router({
    captureEmail: publicProcedure
      .input(z.object({ email: z.string().email(), auditId: z.number().optional(), source: z.string().optional() }))
      .mutation(async ({ input }) => {
        const result = await captureEmailLead(input.email, input.auditId, input.source);
        return { success: !!result };
      }),
  }),
  citation: router({
    /**
     * Start a citation check for an audit.
     * Available to all users (Free = limited view, Pro/admin = full competitor data).
     * Runs asynchronously — returns jobId immediately, results appear after ~2-5 min.
     */
    startCheck: publicProcedure
      .input(z.object({
        auditId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Fetch audit from DB to get the URL
        const audit = await getAuditById(input.auditId);
        if (!audit) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Audit not found" });
        }

        // Use user id if logged in, otherwise use 0 (anonymous)
        const userId = ctx.user?.id ?? 0;

        // ── Seed phrases from monitoring (unified phrase source) ─────────────────
        // If the user is authenticated and this URL is monitored, use the canonical
        // phrase set from monitoring as the seed for round 1 queries.
        // This ensures the same phrases shown in the UI are actually checked.
        // Fix 3: URL normalization handles trailing slash and protocol differences.
        let seedPhrases: string[] = [];
        let matchedMonitoredPageId: number | null = null;

        const normalizeUrl = (u: string) => {
          try {
            const parsed = new URL(u);
            // Normalize: remove trailing slash, lowercase hostname
            return parsed.protocol + "//" + parsed.hostname.toLowerCase() + parsed.pathname.replace(/\/$/, "") + parsed.search;
          } catch { return u.replace(/\/$/, "").toLowerCase(); }
        };

        if (ctx.user) {
          try {
            const monitoredPages = await getMonitoredPagesByUser(ctx.user.id);
            const normalizedAuditUrl = normalizeUrl(audit.url);
            const matchedPage = monitoredPages.find((p) => normalizeUrl(p.url) === normalizedAuditUrl);
            if (matchedPage) {
              matchedMonitoredPageId = matchedPage.id;
              const { getActivePhrasesForPage } = await import("./monitoring/phrases");
              const phrases = await getActivePhrasesForPage(matchedPage.id);
              seedPhrases = phrases.map((p) => p.phrase).filter(Boolean);
              if (seedPhrases.length > 0) {
                console.log(`[Citation] startCheck: seeding ${seedPhrases.length} monitoring phrases for ${audit.url} (monitoredPageId=${matchedPage.id})`);
              }
            }
          } catch (err) {
            // Non-fatal — fall back to LLM-generated queries
            console.warn("[Citation] startCheck: phrase seed lookup failed (non-fatal):", err);
          }
        }

        // Create job — if seedPhrases available, worker uses them as round 1 queries;
        // otherwise worker generates queries via LLM from live page content.
        const jobId = await createCitationJob({
          auditId: input.auditId,
          userId,
          url: audit.url,
          prompts: seedPhrases,  // empty = LLM-generated; non-empty = monitoring seed
          language: "auto",       // worker auto-detects from page HTML
        });

        if (!jobId) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create citation job" });
        }

        // ── Fix 1+2: Bridge audit citation results → monitored page bar ───────────
        // After job completes, if this URL is monitored by the user:
        //   Fix 1: update monitored_pages.lastCitedEngines / lastTotalEngines (bar display)
        //   Fix 2: backfill score_snapshot.citedEnginesCount for this auditId (history sparkline)
        // This runs fire-and-forget — user gets jobId immediately.
        const capturedMonitoredPageId = matchedMonitoredPageId;
        const capturedAuditId = input.auditId;
        runCitationJob(jobId).then(async (result) => {
          if (!result || !capturedMonitoredPageId) return;

          // Count total cited engines from summary
          const summary = result.summary;
          const citedEngines = [
            summary.chatgpt.cited + summary.chatgpt.domainCited > 0 ? 1 : 0,
            summary.google.cited + summary.google.domainCited > 0 ? 1 : 0,
            summary.perplexity.cited + summary.perplexity.domainCited > 0 ? 1 : 0,
            summary.gemini.cited + summary.gemini.domainCited > 0 ? 1 : 0,
          ].reduce((a, b) => a + b, 0);
          const totalEngines = Object.values(summary).filter((e) => e.total > 0).length || 4;

          // Fix 1: update monitored page bar
          await updateMonitoredPageCitationStatus(capturedMonitoredPageId, citedEngines, totalEngines).catch((err) => {
            console.warn("[Citation] Fix1: updateMonitoredPageCitationStatus failed (non-fatal):", err);
          });

          // Fix 2: backfill score_snapshot for this auditId
          await updateScoreSnapshotCitation(capturedAuditId, capturedMonitoredPageId, citedEngines, totalEngines, jobId).catch((err) => {
            console.warn("[Citation] Fix2: updateScoreSnapshotCitation failed (non-fatal):", err);
          });

          console.log(`[Citation] Fix1+2: monitoredPage ${capturedMonitoredPageId} updated — cited ${citedEngines}/${totalEngines} engines`);
        }).catch((err) => {
          console.error(`[Citation] Job ${jobId} failed:`, err);
        });

        return { jobId };
      }),

    /**
     * Get citation results for an audit.
     * Poll this after startCheck until job.status === 'completed'.
     */
    getResults: publicProcedure
      .input(z.object({ auditId: z.number() }))
      .query(async ({ input }) => {
        return getCitationResultsForAudit(input.auditId);
      }),

    /**
     * Get citation status for multiple audits at once (for Dashboard).
     * Returns a map of auditId -> {status, citedCount, totalEngines}.
     * Efficient: one query per batch, no N+1.
     */
    /**
     * Quick Signal — Instant First Signal (Layer 4)
     *
     * Fires a single Google AI Overview check against the most salient query
     * derived from the page title/H1. Returns in 2–4 seconds.
     *
     * Designed to be called concurrently with citation.startCheck so the user
     * sees the first emotional pain point before the full job has results.
     * Never throws — always returns a QuickSignalResult.
     */
    quickSignal: publicProcedure
      .input(z.object({ auditId: z.number() }))
      .mutation(async ({ input }) => {
        const audit = await getAuditById(input.auditId);
        if (!audit) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Audit not found" });
        }
        // getQuickSignal never throws — safe to await directly
        return getQuickSignal(audit.url);
      }),

    getStatusBatch: publicProcedure
      .input(z.object({ auditIds: z.array(z.number()).max(50) }))
      .query(async ({ input }) => {
        const results: Record<number, { status: string; citedCount: number; totalEngines: number }> = {};
        await Promise.all(
          input.auditIds.map(async (auditId) => {
            const { job, checks } = await getCitationResultsForAudit(auditId);
            if (!job) return;
            const engines = new Set(checks.map((c) => c.engine)).size;
            const citedEngines = new Set(
              checks.filter((c) => c.isCited === "yes" || c.isCited === "domain").map((c) => c.engine)
            ).size;
            results[auditId] = {
              status: job.status,
              citedCount: citedEngines,
              totalEngines: Math.max(engines, 3),
            };
          })
        );
        return results;
      }),

    /**
     * Admin: Get last Google AI Overview selector health report.
     * Returns the cached result from the last cron run.
     * Admin can also trigger a manual re-check.
     */
    selectorHealth: protectedProcedure
      .input(z.object({
        forceRun: z.boolean().optional(), // if true, runs a fresh check immediately
      }).optional())
      .query(async ({ ctx, input }) => {
        // Only owner/admin can access this
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
        }
        if (input?.forceRun) {
          // Run a fresh check synchronously (takes ~30-60s)
          const report = await runAndCacheHealthCheck();
          return report;
        }
        return getLastHealthReport();
      }),

    /**
     * Citation Opportunity Finder — Level 1 (structural) + Level 2 (LLM semantic)
     * Level 1: always available (free + pro)
     * Level 2: Pro/Business only (includeSemanticInsights=true)
     */
    /**
     * Per-phrase citation matrix — for each monitored phrase, shows which engines
     * cited the page and which competitor domains appeared in those queries.
     * Used by PhraseCitationComparisonTable in Tab 2.
     */
    getPhraseCitationMatrix: publicProcedure
      .input(z.object({ auditId: z.number() }))
      .query(async ({ input }) => {
        const { getCitationResultsForAudit } = await import("./citation/db");
        const { job, checks } = await getCitationResultsForAudit(input.auditId);
        if (!job || checks.length === 0) return null;

        // Group checks by query (phrase), then by engine
        const phraseMap = new Map<string, {
          phrase: string;
          engines: Record<string, { isCited: string; competitorDomains: string[] }>;
          competitorDomains: string[]; // union across all engines
        }>();

        for (const check of checks) {
          const phrase = check.query;
          if (!phraseMap.has(phrase)) {
            phraseMap.set(phrase, { phrase, engines: {}, competitorDomains: [] });
          }
          const entry = phraseMap.get(phrase)!;
          const domains = (check.competitorDomains as string[] | null) ?? [];
          entry.engines[check.engine] = {
            isCited: check.isCited,
            competitorDomains: domains,
          };
          // Union competitor domains across all engines
          for (const d of domains) {
            if (!entry.competitorDomains.includes(d)) entry.competitorDomains.push(d);
          }
        }

        // Convert to array, sort: not-cited first (opportunity), then domain, then yes
        const PRIORITY: Record<string, number> = { no: 0, domain: 1, yes: 2 };
        const rows = Array.from(phraseMap.values()).map((entry) => {
          // Overall citation status = best result across all engines
          const statuses = Object.values(entry.engines).map((e) => e.isCited);
          const best = statuses.includes("yes") ? "yes" : statuses.includes("domain") ? "domain" : "no";
          return { ...entry, overallStatus: best };
        });
        rows.sort((a, b) => (PRIORITY[a.overallStatus] ?? 0) - (PRIORITY[b.overallStatus] ?? 0));

        return {
          rows: rows.slice(0, 30), // cap at 30 phrases
          engines: ["chatgpt", "google", "perplexity", "gemini"] as const,
        };
      }),

    /**
     * Generate a one-paragraph LLM-based citation narrative.
     * Connects citation results with top gaps to produce an actionable diagnosis.
     * Cached in-memory for 10 minutes per auditId.
     */
    getNarrative: publicProcedure
      .input(z.object({
        auditId: z.number(),
        url: z.string(),
        citedEngineCount: z.number().min(0).max(4),
        totalEngines: z.number().min(1).max(4),
        citingEngines: z.array(z.string()),
        missingEngines: z.array(z.string()),
        totalChecks: z.number().min(0),
        language: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const { getCompetitorAuditsForAudit } = await import("./competitor/db");
        const { computeGapAnalysis } = await import("./competitor/gapAnalysis");
        const { generateCitationNarrative } = await import("./citation/narrativeGenerator");

        // Fetch top 3 gaps for context
        let topGaps: import("./competitor/gapAnalysis").GapItem[] = [];
        try {
          const audit = await getAuditById(input.auditId);
          if (audit?.findings) {
            const competitors = await getCompetitorAuditsForAudit(input.auditId);
            if (competitors.length > 0) {
              const gapResult = computeGapAnalysis(
                audit.findings as import("./audit/types").AuditFindings,
                competitors
              );
              topGaps = gapResult.gaps.slice(0, 3);
            }
          }
        } catch (_e) {
          // Gap data unavailable — narrative will use template fallback
        }

        return generateCitationNarrative({
          auditId: input.auditId,
          url: input.url,
          citedEngineCount: input.citedEngineCount,
          totalEngines: input.totalEngines,
          citingEngines: input.citingEngines,
          missingEngines: input.missingEngines,
          totalChecks: input.totalChecks,
          topGaps,
          language: input.language ?? "pl",
        });
      }),

    getOpportunities: publicProcedure
      .input(z.object({
        auditId: z.number(),
        includeSemanticInsights: z.boolean().optional().default(false),
      }))
      .query(async ({ ctx, input }) => {
        // Semantic insights are Pro/Business only
        let canUseSemantic = false;
        if (input.includeSemanticInsights) {
          const user = (ctx as any).user;
          if (user) {
            const db = await getDb();
            if (db) {
              const userRows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
              const plan = userRows[0]?.plan ?? "free";
              canUseSemantic = plan === "pro" || plan === "business" || user.role === "admin";
            }
          }
        }
        const result = await computeOpportunities(input.auditId, {
          includeSemanticInsights: canUseSemantic,
        });
        return result;
      }),
  }),

  sandbox: router({
    // AI Content Co-Pilot — rewrites content using LLM with 5 optimization modes
    // Full Rewrite is a paid-only feature (Starter, Pro, Business)
    rewrite: protectedProcedure
      .input(z.object({
        content: z.string().max(20000),
        mode: z.enum(["full_rewrite", "answer_first", "add_faq", "add_statistics", "improve_structure"]),
        issues: z.array(z.string()).optional(),
        url: z.string().optional(),
        pageType: z.string().optional(),
        targetQueries: z.array(z.string()).optional(),
        // Page metadata for research pipeline (full_rewrite mode)
        pageTitle: z.string().optional(),
        h1: z.string().optional(),
        metaDescription: z.string().optional(),
        language: z.string().optional(),
        // Competitor cited URLs from AI Citations (for full_rewrite mode)
        citedCompetitorUrls: z.array(z.string()).optional(),
        citationOpportunities: z.array(z.object({
          keyword: z.string(),
          contentBrief: z.string(),
          isQuickWin: z.boolean().optional(),
        })).optional(),
        // Step B: SSE streaming job ID — client subscribes to /api/rewrite/stream/:streamJobId
        // Optional: if omitted, procedure runs silently (backward-compatible)
        streamJobId: z.number().int().positive().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Gate: Full Rewrite is only available on paid plans
        const db = await getDb();
        if (db) {
          const userRows = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
          const userPlan = userRows[0]?.plan ?? "free";
          if (userPlan === "free") {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "UPGRADE_REQUIRED",
            });
          }
        }

        // ── Step B: SSE registry — emit real-time pipeline progress if streamJobId provided ──
        // Lazy import keeps this module out of the critical path for non-streaming callers.
        const { rewriteSSERegistry } = await import("./rewrite/rewriteSSERegistry");
        const sseJobId = input.streamJobId ?? null;
        if (sseJobId) rewriteSSERegistry.ensureEntry(sseJobId);

        /** Emit a pipeline step change. No-op if no streamJobId. */
        function emitStep(step: 1 | 2 | 3 | 4, label: string): void {
          if (sseJobId) rewriteSSERegistry.emitStep(sseJobId!, { step, label });
        }
        /** Emit a section-generated event. No-op if no streamJobId. */
        function emitSection(current: number, total: number, sectionTitle?: string): void {
          if (sseJobId) rewriteSSERegistry.emitSection(sseJobId!, { current, total, sectionTitle });
        }

        const { invokeLLM } = await import("./_core/llm");
        const { crawlCompetitors, formatCompetitorContext } = await import("./rewrite/competitorCrawler");
        const { verifyAndRevise } = await import("./rewrite/eeatVerifier");

        const issuesList = (input.issues ?? []).slice(0, 10).join("\n");
        const pageType = input.pageType ?? "generic";

        // ─── Pre-Rewrite Research Pipeline (AI Page Creator architecture) ──────
        // Only for full_rewrite mode — adds query fan-out, grounding, synthesis
        let researchContext = "";
        let researchQueries: string[] = input.targetQueries ?? [];
        let researchKeyEntities: string[] = [];
        let researchAiReadinessTips: string[] = [];
        let researchAnswerFirstDraft = "";
        let researchSources: Array<{ url: string; title: string; snippet: string }> = [];

        if (input.mode === "full_rewrite" && input.url) {
          try {
            emitStep(1, "Głęboka analiza Twojej strony");
            console.log("[Rewrite] Starting pre-rewrite research pipeline...");
            const researchResult = await runRewriteResearch({
              url: input.url,
              title: input.pageTitle || input.url,
              h1: input.h1,
              metaDescription: input.metaDescription,
              pageType: input.pageType,
              language: input.language ?? "pl",
              cleanContent: input.content.slice(0, 3000),
            });
            researchQueries = researchResult.queries.length > 0 ? researchResult.queries : researchQueries;
            researchKeyEntities = researchResult.keyEntities;
            researchAiReadinessTips = researchResult.aiReadinessTips;
            researchAnswerFirstDraft = researchResult.answerFirstDraft;
            researchSources = researchResult.sources;

            if (researchResult.researchBrief) {
              researchContext =
                `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `🔬 KONTEKST BADAWCZY (zebrane z internetu przed przepisaniem):\n` +
                `${researchResult.researchBrief}\n\n` +
                `🏷️ KLUCZOWE ENCJE DO WPLECENIA W TREŚĆ:\n${researchKeyEntities.join(", ")}\n\n` +
                (researchAnswerFirstDraft ? `💡 SUGEROWANY ANSWER-FIRST OPENING:\n${researchAnswerFirstDraft}\n` : "") +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
            }
            emitStep(2, "Analiza wzorzców AI Search");
            console.log(`[Rewrite] Research done: ${researchResult.queries.length} queries, ${researchResult.sources.length} sources`);
          } catch (e) {
            console.warn("[Rewrite] Research pipeline failed (non-fatal):", (e as Error).message);
          }
        }

        const queriesStr = researchQueries.join(", ") || "ogólne zapytania w wyszukiwarkach AI";

        // Page-type-specific context for the AI
        const pageTypeContext: Record<string, string> = {
          product: `Ta strona to STRONA PRODUKTOWA (e-commerce). Zoptymalizuj ją pod kątem:
- Jasnego opisu produktu z odpowiedzią na pytanie "Co to jest i komu służy?" w pierwszym akapicie
- Specyfikacji technicznych w formie listy punktowanej
- Sekcji "Dla kogo jest ten produkt?" (profil idealnego klienta)
- FAQ z pytaniami zakupowymi (cena, dostawa, zwroty, gwarancja)
- Porównania z alternatywami (jeśli dotyczy)
- Konkretnych korzyści (nie cech) — co zyska klient?`,

          "product-listing": `Ta strona to STRONA KATEGORII / LISTINGU PRODUKTÓW. Zoptymalizuj ją pod kątem:
- Wprowadzenia kategorii z definicją i kontekstem (czym są te produkty, do czego służą)
- Przewodnika wyboru ("Jak wybrać najlepszy X?") w formie listy kryteriów
- Sekcji "Najpopularniejsze X" lub "Najlepsze X w [rok]"
- FAQ z pytaniami nawigacyjnymi i zakupowymi
- Informacji o zakresie cenowym i segmentach produktów`,

          article: `Ta strona to ARTYKUŁ / PORADNIK. Zoptymalizuj ją pod kątem:
- Struktury "answer-first": bezpośrednia odpowiedź na główne pytanie w pierwszych 2-3 zdaniach
- Jasnych nagłówków H2/H3 w formie pytań ("Jak...", "Co to jest...", "Dlaczego...")
- Konkretnych danych, liczb i statystyk (z datami i źródłami)
- Sekcji FAQ z 5-8 pytaniami, które użytkownicy wpisują w wyszukiwarki
- Podsumowania TL;DR na początku lub końcu
- Linków do powiązanych zasobów`,

          service: `Ta strona to STRONA USŁUGOWA (B2B/SaaS/agencja). Zoptymalizuj ją pod kątem:
- Jasnej definicji usługi i problemu, który rozwiązuje (pierwsze zdanie)
- Sekcji "Dla kogo jest ta usługa?" z profilami klientów
- Konkretnych wyników i efektów (liczby, case studies, procenty)
- Procesu realizacji (krok po kroku)
- FAQ z pytaniami o cenę, czas realizacji, gwarancje
- Elementów budujących zaufanie (certyfikaty, doświadczenie, liczba klientów)`,

          homepage: `Ta strona to STRONA GŁÓWNA. Zoptymalizuj ją pod kątem:
- Jasnego, jednozdaniowego opisu firmy/produktu (co robisz i dla kogo)
- Głównej propozycji wartości (USP) w pierwszym akapicie
- Sekcji z kluczowymi usługami/produktami z krótkimi opisami
- Elementów budujących zaufanie (liczby, klienci, certyfikaty)
- FAQ z najczęstszymi pytaniami o firmę`,

          generic: `Ta strona to ogólna strona internetowa. Zoptymalizuj ją pod kątem:
- Jasnej odpowiedzi na główne pytanie użytkownika w pierwszym akapicie
- Logicznej struktury nagłówków H2/H3
- Konkretnych informacji zamiast ogólników
- Sekcji FAQ z pytaniami powiązanymi z tematem strony`,
        };

        const pageTypeInstruction = pageTypeContext[pageType] ?? pageTypeContext.generic;

        const systemPrompt = `Jesteś ekspertem GEO (Generative Engine Optimization) — specjalistą od optymalizacji treści pod kątem widoczności w wyszukiwarkach AI: ChatGPT Search, Google AI Overviews i Perplexity.

Twoim zadaniem jest przepisanie treści strony internetowej tak, aby maksymalizować jej szansę na cytowanie w odpowiedziach AI.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 ZAKAZ HALUCYNACJI (BEZWZGLĘDNY — NAJWAŻNIEJSZA REGUŁA):
NIGDY nie wymylaj, nie fałszuj ani nie dodawaj następujących elementów, których NIE MA w oryginalnej treści:
- Cytatów ekspertów, lekarzy, naukowców, specjalistów (np. "Dr Jan Kowalski powiedział...")
- Opinii przypisanych konkretnym osobom (prawdziwym lub fikcyjnym)
- Statystyk, liczb, procentów, dat, wyników badań, których NIE MA w oryginalnej treści
- Nazw instytucji, organizacji, certyfikatów, których NIE MA w oryginalnej treści
- Jakichkolwiek twierdzeń faktycznych, których nie można zweryfikować na podstawie dostarczonego tekstu
Możesz TYLKO: reorganizować istniejącą treść, poprawiać jej strukturę, styl i czytelność dla AI.
Jeśli oryginał nie zawiera danych liczbowych — NIE dodawaj fikcyjnych. Jeśli nie ma cytatów — NIE tworzysz nowych.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌍 REGUŁA JĘZYKA (BEZWZGLĘDNA):
Wykryj język treści dostarczonej przez użytkownika i pisz CAŁĄ odpowiedź w TYM SAMYM języku.
- Treść po polsku → odpowiedź po polsku
- Treść po angielsku → odpowiedź po angielsku
- Treść po niemiecku → odpowiedź po niemiecku
- NIE ZMIENIAJ języka pod żadnym pozorem
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 KONTEKST STRONY (typ: ${pageType}):
${pageTypeInstruction}

🎯 Zapytania docelowe (dla których strona ma być widoczna w AI):
${queriesStr}

🔧 Problemy wykryte w audycie do naprawienia:
${issuesList || "Brak konkretnych problemów — zoptymalizuj ogólnie pod kątem AI readiness"}
${researchContext}
${(input.citationOpportunities && input.citationOpportunities.length > 0) ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 CITATION OPPORTUNITIES — KONKRETNE LUKI DO WYPEŁNIENIA:
Poniższe zapytania są aktywnie wyszukiwane w AI Search, ale Twoja strona NIE jest cytowana. Dla każdego z nich masz gotą instrukcję, co dodać do treści:
${input.citationOpportunities.map((opp, i) => `${i + 1}. ZAPYTANIE: "${opp.keyword}"
   INSTRUKCJA: ${opp.contentBrief}${opp.isQuickWin ? " [QUICK WIN — priorytet]" : ""}`).join("\n")}
Zaimplementuj te wskazówki w przepisanej treści — każda z nich zwiększa szansę na cytowanie przez AI Search.` : ""}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✍️ ZASADY FORMATOWANIA WYJŚCIOWEGO (BEZWZGLĘDNE):
1. Pisz WYŁĄCZNIE gotowy tekst do wklejenia na stronę — bez komentarzy, wyjaśnień, meta-komentarzy
2. NIE używaj znaków # do nagłówków — pisz nagłówki jako zwykły tekst z nową linią
3. NIE używaj znaków ** do pogrubień — jeśli chcesz wyróżnić, użyj normalnego zdania
4. NIE używaj znaków Markdown takich jak #, **, *, _, >, ---
5. Listy punktowane pisz ze zwykłym myślnikiem i spacją: "- element"
6. Nagłówki sekcji pisz jako osobne linie, bez żadnych znaków specjalnych
   🇵🇱 JĘZYK POLSKI — BEZWZGLĘDNA ZASADA NAGŁÓWKÓW (sentence case):
   - Tylko PIERWSZE słowo nagłówka zaczyna się wielką literą
   - Nazwy własne (imiona, nazwiska, marki, miejsca) zachowują wielką literę
   - Skróty (AI, SEO, FAQ, HTML, GEO, ChatGPT) zachowują wielkie litery
   - ŻADNE inne słowo nie zaczyna się wielką literą
   - ✅ Poprawnie: "Jak wybrać najlepszą kurtkę zimową"
   - ❌ Błędnie: "Jak Wybrać Najlepszą Kurtkę Zimową"
   - ✅ Poprawnie: "Optymalizacja pod AI Search i ChatGPT"
   - ❌ Błędnie: "Optymalizacja Pod AI Search I ChatGPT"
   🇬🇧 JĘZYK ANGIELSKI — title case jest poprawny (każde słowo z dużej litery)
7. Zachowaj naturalny, płynny styl języka — bez sztucznego brzmienia, bez KAPITALIKÓW w środku zdań
8. Treść musi być poprawna językowo, stylistycznie i ortograficznie
9. Długość: dostosuj do typu strony — produkt: 400-800 słów, artykuł: 800-1500 słów
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

        // ─── Clean the input content: remove JSON-LD, HTML tags, technical noise ───
        const cleanInputContent = (raw: string): string => {
          // Remove JSON-LD blocks — use non-greedy match limited to 2000 chars to avoid eating real content
          // Only remove blocks that contain @type (JSON-LD indicator)
          let cleaned = raw.replace(/\{[^{}]{0,2000}"@type"[^{}]{0,2000}\}/g, "");
          // Also remove standalone JSON-LD script blocks
          cleaned = cleaned.replace(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, "");
          // Remove HTML tags if any leaked through
          cleaned = cleaned.replace(/<[^>]{0,200}>/g, " ");
          // Remove lines that look like JSON keys/values (technical noise)
          cleaned = cleaned.split("\n").filter(line => {
            const t = line.trim();
            if (!t) return false;
            // Skip lines that are pure JSON-like (key: value or {, })
            if (/^[{\[\]},]$/.test(t)) return false;
            if (/^"[\w@]+"\s*:/.test(t)) return false; // JSON key
            if (/^\s*"@/.test(t)) return false; // JSON-LD @type, @context
            // Skip lines shorter than 10 chars (likely noise)
            if (t.length < 10) return false;
            // Skip lines that are just URLs without context
            if (/^https?:\/\/\S+$/.test(t)) return false;
            return true;
          }).join("\n");
          // Collapse multiple blank lines
          cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
          return cleaned;
        };

        const cleanedContent = cleanInputContent(input.content);

        // ─── For full_rewrite: crawl competitor URLs from AI Citations ───────────
        let competitorContext = "";
        let crawledDomains: string[] = [];
        let crawlResult: Awaited<ReturnType<typeof crawlCompetitors>> | null = null;
        if (input.mode === "full_rewrite" && input.citedCompetitorUrls && input.citedCompetitorUrls.length > 0) {
          try {
            const targetDomain = input.url ? new URL(input.url).hostname.replace("www.", "") : "";
            crawlResult = await crawlCompetitors(input.citedCompetitorUrls, targetDomain, 6, cleanedContent);
            competitorContext = formatCompetitorContext(crawlResult);
            crawledDomains = crawlResult.crawledDomains;
            console.log(`[Rewrite] Crawled ${crawledDomains.length} competitor domains, ${crawlResult.allTriples.length} triples`);
          } catch (e) {
            console.warn("[Rewrite] Competitor crawl failed (non-fatal):", (e as Error).message);
          }
        }

        const modeInstructions: Record<string, string> = {
          full_rewrite: `Przepisz całą poniższą treść od nowa. Stworzony tekst musi być LEPSZY od oryginału pod każdym względem:

1. PRIORYTET 1 — Helpful Content: Odpowiedz na główne pytanie użytkownika w pierwszych 2-3 zdaniach (answer-first). Treść musi być konkretna, praktyczna i wartościowa.

2. PRIORYTET 2 — Naprawa problemów z audytu: Zastosuj wszystkie wskazane poprawki techniczne i contentowe.

3. PRIORYTET 3 — Struktura AI-ready:
   - Nagłówki sekcji w formie pytań ("Jak...", "Co to jest...", "Dlaczego...")
   - Sekcja FAQ z 5-7 pytaniami i konkretnymi odpowiedziami (2-4 zdania każda)
   - Listy punktowane dla cech, kroków, porównań
   - Konkretne liczby, daty, dane TYLKO też, które występują w oryginalnej treści lub w analizie konkurencji poniżej

4. PRIORYTET 4 — Encje i fakty z konkurencji: Jeśli poniżej podano analizę konkurencji, sparafrazuj kluczowe fakty i encje, które wzbogacą tekst. NIE kopiuj dosłownie — twórz oryginalną treść. NIE dodawaj faktów spoza tej analizy.

Tekst musi być idealny językowo, stylistycznie i gramatycznie. Pisz naturalnie, jak ekspert dla użytkownika — nie jak robot SEO.`,

          answer_first: `Przeorganizuj poniższą treść według wzorca "answer-first": zacznij od bezpośredniej, wyczerpującej odpowiedzi na główne pytanie strony (2-3 zdania), następnie podaj szczegóły. Przenieś najważniejsze informacje na górę. Zachowaj całą istniejącą treść, ale zmień kolejność i strukturę.`,

          add_faq: `Zachowaj istniejącą treść i DODAJ na końcu sekcję FAQ. Wygeneruj 6-8 pytań, które użytkownicy wpisują w Google i wyszukiwarkach AI w związku z tematem tej strony. Każda odpowiedź: 2-4 zdania, konkretna i bezpośrednia. Sekcja FAQ powinna zaczynać się od nagłówka "Najczęściej zadawane pytania".`,

          add_statistics: `Zachowaj strukturę istniejącej treści. Jeśli w oryginalnej treści lub w analizie konkurencji poniżej występują konkretne dane (liczby, procenty, statystyki, daty) — wyeksponuj je i umieść blisko początku w sekcji "Kluczowe liczby" lub "Fakty i dane". UWAGA: NIE dodawaj żadnych danych, których NIE MA w oryginalnej treści ani w analizie konkurencji. Jeśli oryginalna treść nie zawiera danych liczbowych — napisz to wprost użytkownikowi jako komentarz na końcu: "[Uwaga: oryginalna treść nie zawierała danych liczbowych — dodaj je ręcznie]".`,

          improve_structure: `Zachowaj całą istniejącą treść, ale popraw jej strukturę: podziel na sekcje z jasnymi nagłówkami (w formie pytań tam gdzie możliwe), zamień długie akapity na listy punktowane, dodaj wyraźne wprowadzenie i podsumowanie. Dodaj skrócone streszczenie (TL;DR lub "W skrócie") na początku lub końcu.`,
        };

        const userPrompt = `${modeInstructions[input.mode]}

${competitorContext}

--- TREŚĆ DO OPTYMALIZACJI ---
${cleanedContent.slice(0, 20000)}
--- KONIEC TREŚCI ---`;

        // ─── Helper: split content into sections by H2/H3 headings ─────────────
        // IMPORTANT: Only detect EXPLICIT heading markers (##, ###, [H]) — never heuristic
        // short-line detection, which causes false positives and FAQ duplication.
        const splitIntoSections = (text: string): Array<{ heading: string; body: string }> => {
          const lines = text.split("\n");
          const sections: Array<{ heading: string; body: string }> = [];
          let currentHeading = "";
          let currentBody: string[] = [];

          for (const line of lines) {
            const trimmed = line.trim();
            // Detect headings ONLY by explicit markers: ## / ### / [H] prefix
            // Do NOT use heuristic (short line + capital letter) — causes false splits
            const isHeading =
              /^#{1,4}\s/.test(trimmed) ||
              /^\[H\]\s/.test(trimmed);

            if (isHeading && currentBody.join(" ").trim().length > 0) {
              sections.push({ heading: currentHeading, body: currentBody.join("\n").trim() });
              currentHeading = trimmed.replace(/^#+\s*/, "").replace(/^\[H\]\s*/, "");
              currentBody = [];
            } else if (isHeading) {
              currentHeading = trimmed.replace(/^#+\s*/, "").replace(/^\[H\]\s*/, "");
            } else {
              currentBody.push(line);
            }
          }
          if (currentBody.join(" ").trim().length > 0) {
            sections.push({ heading: currentHeading, body: currentBody.join("\n").trim() });
          }
          return sections.filter(s => s.body.length > 30);
        };

        // ─── Helper: deduplicate FAQ and repeated sections from joined output ────
        const deduplicateContent = (text: string): string => {
          // Split into paragraphs/blocks
          const blocks = text.split(/\n{2,}/);
          const seen = new Set<string>();
          const deduped: string[] = [];

          for (const block of blocks) {
            // Normalize for comparison: lowercase, collapse whitespace
            const key = block.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120);
            if (!key || key.length < 20) {
              deduped.push(block);
              continue;
            }
            if (!seen.has(key)) {
              seen.add(key);
              deduped.push(block);
            }
            // else: skip duplicate block
          }

          // Also deduplicate FAQ sections: keep only the LAST occurrence of FAQ heading
          const joined = deduped.join("\n\n");
          const faqRegex = /\n{0,2}(Najczęściej zadawane pytania|Często zadawane pytania|FAQ|Pytania i odpowiedzi)[\s\S]*?(?=\n{2,}[A-ZŁŚŻŹĆŃÓĄĘ]|$)/gi;
          const faqMatches: string[] = [];
          let faqMatch: RegExpExecArray | null;
          while ((faqMatch = faqRegex.exec(joined)) !== null) {
            faqMatches.push(faqMatch[0]);
          }
          if (faqMatches.length > 1) {
            // Remove all but the last FAQ block
            let result = joined;
            for (let i = 0; i < faqMatches.length - 1; i++) {
              result = result.replace(faqMatches[i], "");
            }
            return result.replace(/\n{3,}/g, "\n\n").trim();
          }

          return deduped.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
        };

        try {
          let rewritten: string;

          if (input.mode === "full_rewrite") {
            // ── Krok 4: Iterative section-by-section generation ──────────────────
            const sections = splitIntoSections(cleanedContent);
            const MAX_SECTIONS = 8;
            const sectionsToProcess = sections.slice(0, MAX_SECTIONS);

            emitStep(3, "Tworzenie treści przez zespół AI Agentów");
            console.log(`[Rewrite] Iterative mode: ${sectionsToProcess.length} sections detected`);

            if (sectionsToProcess.length <= 1) {
              // Single block — use standard single-shot (no sections to iterate)
              const response = await invokeLLM({
                model: "gpt-5.4",  // draft generation — high verbosity
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: userPrompt },
                ],
                max_tokens: 16000,
              } as any);
              rewritten = String(response.choices?.[0]?.message?.content ?? "");
            } else {
              // Multi-section iterative generation
              const generatedSections: string[] = [];

              for (let i = 0; i < sectionsToProcess.length; i++) {
                const section = sectionsToProcess[i];
                const isFirst = i === 0;
                const isLast = i === sectionsToProcess.length - 1;

                // Find BM25-relevant triples for this section
                const sectionTriples = crawlResult?.allTriples
                  ? crawlResult.allTriples
                      .filter(t => {
                        const sectionLower = (section.heading + " " + section.body).toLowerCase();
                        return (
                          sectionLower.includes(t.subject.toLowerCase()) ||
                          sectionLower.includes(t.object.toLowerCase())
                        );
                      })
                      .slice(0, 4)
                  : [];

                const sectionTriplesStr = sectionTriples.length > 0
                  ? `\nKnowledge Graph dla tej sekcji:\n${sectionTriples.map(t => `  [${t.subject}] → ${t.predicate} → [${t.object}]`).join("\n")}`
                  : "";

                const sectionPrompt =
                  `${modeInstructions["full_rewrite"]}\n\n` +
                  `${isFirst ? competitorContext + "\n\n" : ""}` +
                  `INSTRUKCJA DLA TEJ SEKCJI:\n` +
                  `- Sekcja ${i + 1} z ${sectionsToProcess.length}: "${section.heading || "Wprowadzenie"}".\n` +
                  (isFirst ? `- To jest PIERWSZA sekcja — zacznij od bezpośredniej odpowiedzi na główne pytanie strony (answer-first).\n` : "") +
                  (isLast ? `- To jest OSTATNIA sekcja — zakończ podsumowaniem i sekcją FAQ z dokładnie 6 pytaniami i pełnymi odpowiedziami (min. 2-3 zdania każda).\n` +
                            `- KRYTYCZNE: każde pytanie FAQ musi mieć kompletną, zakończoną odpowiedź. NIE urywaj tekstu w połowie zdania.\n` +
                            `- Sekcja FAQ musi być kompletna — wszystkie 6 pytań z odpowiedziami, ostatnie zdanie musi być zakończone kropką.\n` : "") +
                  `- Rozbuduj tę sekcję do wyczerpującego formatu, zachowując wysoką szczegółowość. NIE streszczaj.\n` +
                  `- Pisz min. ${isLast ? "400-600" : "200-350"} słów dla tej sekcji.\n` +
                  `- BEZWZGLĘDNIE zakończ każde zdanie i akapit — nigdy nie urywaj w połowie.\n` +
                  `${sectionTriplesStr}\n\n` +
                  `--- TREŚĆ SEKCJI DO PRZEPISANIA ---\n` +
                  (section.heading ? `${section.heading}\n` : "") +
                  `${section.body}\n` +
                  `--- KONIEC SEKCJI ---`;

                // Last section (FAQ + summary) needs more tokens to complete fully
                const sectionMaxTokens = isLast ? 8000 : 5000;

                const sectionResponse = await invokeLLM({
                  model: "gpt-5.4",  // draft generation per section — high verbosity
                  messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: sectionPrompt },
                  ],
                  max_tokens: sectionMaxTokens,
                } as any);

                const sectionContent = String(sectionResponse.choices?.[0]?.message?.content ?? "");
                if (sectionContent.trim()) {
                  generatedSections.push(sectionContent.trim());
                }

                emitSection(i + 1, sectionsToProcess.length, section.heading || undefined);
                console.log(`[Rewrite] Section ${i + 1}/${sectionsToProcess.length} done (${sectionContent.length} chars)`);
              }

              // Join sections and deduplicate repeated blocks (e.g. FAQ generated multiple times)
              const rawJoined = generatedSections.join("\n\n");
              rewritten = deduplicateContent(rawJoined);
            }
          } else {
            // Non-full_rewrite modes: standard single-shot (gpt-5.4 default)
            const response = await invokeLLM({
              model: "gpt-5.4",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
            });
            rewritten = String(response.choices?.[0]?.message?.content ?? "");
          }

          if (!rewritten || rewritten.trim().length < 100) throw new Error("Empty response from AI");

          // ―― Krok 3: E-E-A-T Verification + auto-revision ─────────────────────
          let finalContent = rewritten;
          let eeatScore = null;
          let wasRevised = false;
          if (input.mode === "full_rewrite") {
            emitStep(4, "Weryfikacja jakości — E-E-A-T & Helpful Content");
            try {
              const verifyResult = await verifyAndRevise(
                rewritten,
                queriesStr,
                systemPrompt,
                "Polish"
              );
              finalContent = verifyResult.content;
              eeatScore = {
                overall: verifyResult.score.overall,
                verifiableFacts: verifyResult.score.verifiableFacts,
                expertVoice: verifyResult.score.expertVoice,
                intentMatch: verifyResult.score.intentMatch,
                languageQuality: verifyResult.score.languageQuality,
              };
              wasRevised = verifyResult.wasRevised;
              if (wasRevised) {
                console.log(`[Rewrite] E-E-A-T revision applied (score was ${verifyResult.score.overall}/10)`);
              }
            } catch (e) {
              console.warn("[Rewrite] E-E-A-T verification failed (non-fatal):", (e as Error).message);
            }
          }

          // ―― Krok 4: Hallucination Guard ──────────────────────────────────────────────
          // Always run guard — removes fake quotes, statistics, expert attributions
          try {
            const guardResult = await guardAgainstHallucinations(
              finalContent,
              cleanedContent,  // original page content as source of truth
              true             // use LLM verification
            );
            if (guardResult.wasModified) {
              console.log(`[Rewrite] HallucinationGuard removed ${guardResult.issues.length} issue(s)`);
              finalContent = guardResult.content;
            }
          } catch (e) {
            console.warn("[Rewrite] HallucinationGuard failed (non-fatal):", (e as Error).message);
          }

          // ―― Krok 5: Polish Capitalization Normalization ──────────────────────────────
          // NIEZMIENIALNĄ ZASADA: Po znakach : - – — / | • słowa zaczynają się od małej litery (PL)
          // Reguła NIE obowiązuje dla języka angielskiego.
          {
            const detectedLang = (input.language === "en" || input.language === "english")
              ? "en" as const
              : (input.language === "pl" || input.language === "polish" || isPolishText(finalContent))
                ? "pl" as const
                : undefined;
            if (detectedLang !== "en") {
              // normalizePolishContent applies BOTH:
              //   1. Heading sentence-case normalisation (plain-text + Markdown headings)
              //   2. Punctuation capitalisation normalisation (after : - - / | bullet)
              finalContent = normalizePolishContent(finalContent, detectedLang);
              console.log(`[Rewrite] Polish content normalization applied (headings+punctuation, lang=${detectedLang ?? "auto-detected"})`);
            }
          }

          // Step B: SSE — emit done event with content metadata
          if (sseJobId) {
            rewriteSSERegistry.emitDone(sseJobId, {
              contentLength: finalContent.length,
              wasRevised,
              eeatScore: typeof eeatScore === "object" && eeatScore !== null
                ? (eeatScore as { overall?: number }).overall ?? null
                : null,
            });
          }

          return {
            rewrittenContent: finalContent,
            competitorInsights: crawledDomains.length > 0 ? {
              crawledDomains,
              count: crawledDomains.length,
            } : null,
            eeatScore,
            wasRevised,
            // Research pipeline results (AI Page Creator architecture)
            researchData: (researchKeyEntities.length > 0 || researchAiReadinessTips.length > 0) ? {
              queries: researchQueries,
              keyEntities: researchKeyEntities,
              aiReadinessTips: researchAiReadinessTips,
              answerFirstDraft: researchAnswerFirstDraft,
              sources: researchSources,
            } : null,
          };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "AI rewrite failed";
          // Step B: SSE — emit error event so client doesn't hang on a failed rewrite
          if (sseJobId) rewriteSSERegistry.emitError(sseJobId, { message: msg });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
        }
      }),

    // ─── contentRescore: fast LLM-based re-scoring of rewritten content ────────
    // Scores rewritten content on 7 GEO dimensions and returns estimated score delta.
    // Uses structured JSON output for determinism. Runs in ~3–5s (single LLM call).
    contentRescore: protectedProcedure
      .input(z.object({
        originalContent: z.string().max(20000),
        rewrittenContent: z.string().max(20000),
        auditId: z.number().optional(),
        baselineScores: z.object({
          technical: z.number().optional(),
          structuredData: z.number().optional(),
          contentStructure: z.number().optional(),
          eeat: z.number().optional(),
          aiCrawlers: z.number().optional(),
          metaTags: z.number().optional(),
          brandAuthority: z.number().optional(),
          overall: z.number().optional(),
        }).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Gate: only paid plans
        const db = await getDb();
        if (db) {
          const userRows = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
          const userPlan = userRows[0]?.plan ?? "free";
          if (userPlan === "free") {
            throw new TRPCError({ code: "FORBIDDEN", message: "Re-scoring requires a paid plan." });
          }
        }

        // Fetch baseline from DB if auditId provided and baselineScores not given
        let baseline = input.baselineScores ?? {};
        if (input.auditId && !(input.baselineScores?.overall) && db) {
          const auditRow = await db.select().from(audits).where(eq(audits.id, input.auditId)).limit(1);
          if (auditRow[0]) {
            const a = auditRow[0];
            baseline = {
              technical: a.technicalScore ?? undefined,
              structuredData: a.structuredDataScore ?? undefined,
              contentStructure: a.contentStructureScore ?? undefined,
              eeat: a.eeatScore ?? undefined,
              aiCrawlers: a.aiCrawlerScore ?? undefined,
              metaTags: a.metaTagsScore ?? undefined,
              overall: a.overallScore ?? undefined,
            };
          }
        }

        const { invokeLLM } = await import("./_core/llm");

        const systemPrompt = `You are a GEO (Generative Engine Optimization) scoring expert.\nYou evaluate web page content for AI Search visibility across 7 dimensions.\nEach dimension is scored 0-100. Be precise and consistent.\n\nDimensions:\n- contentStructure (0-100): FAQ sections, TL;DR, clear headings, answer-first format, semantic chunking\n- eeat (0-100): Author credentials, first-person experience signals, citations, expertise markers\n- structuredData (0-100): JSON-LD schema presence, FAQPage, Article, Product, BreadcrumbList\n- metaTags (0-100): Title tag quality, meta description, Open Graph, canonical\n- aiCrawlers (0-100): No crawler blocks, sitemap directive, robots.txt friendly\n- technical (0-100): HTTPS signals, page speed signals, mobile-friendly signals in content\n- brandAuthority (0-100): Brand mentions, social proof, trust signals, external references\n\nReturn ONLY valid JSON matching the schema. No markdown, no explanation.`;

        const userPrompt = `Score the REWRITTEN content below on all 7 GEO dimensions.\n\nREWRITTEN CONTENT (to score):\n${input.rewrittenContent.slice(0, 8000)}\n\nFor context, the ORIGINAL content was:\n${input.originalContent.slice(0, 3000)}\n\nReturn JSON with this exact structure:\n{\n  "scores": {\n    "contentStructure": <0-100>,\n    "eeat": <0-100>,\n    "structuredData": <0-100>,\n    "metaTags": <0-100>,\n    "aiCrawlers": <0-100>,\n    "technical": <0-100>,\n    "brandAuthority": <0-100>\n  },\n  "topImprovements": ["<dimension>: <one-line reason>"],\n  "confidence": "high"\n}`;

        const llmResponse = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "geo_rescore",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  scores: {
                    type: "object",
                    properties: {
                      contentStructure: { type: "number" },
                      eeat: { type: "number" },
                      structuredData: { type: "number" },
                      metaTags: { type: "number" },
                      aiCrawlers: { type: "number" },
                      technical: { type: "number" },
                      brandAuthority: { type: "number" },
                    },
                    required: ["contentStructure", "eeat", "structuredData", "metaTags", "aiCrawlers", "technical", "brandAuthority"],
                    additionalProperties: false,
                  },
                  topImprovements: { type: "array", items: { type: "string" } },
                  confidence: { type: "string" },
                },
                required: ["scores", "topImprovements", "confidence"],
                additionalProperties: false,
              },
            },
          },
        });

        const rawContent = llmResponse.choices[0]?.message?.content ?? "{}";
        const raw = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
        let parsed: { scores: Record<string, number>; topImprovements: string[]; confidence: string };
        try {
          parsed = JSON.parse(raw);
        } catch {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Re-scoring LLM returned invalid JSON" });
        }

        // Compute weighted overall score using same weights as scorer.ts (no CI)
        const WEIGHTS: Record<string, number> = {
          technical: 11, structuredData: 20, contentStructure: 24,
          eeat: 14, aiCrawlers: 8, metaTags: 5, brandAuthority: 10,
        };
        const s = parsed.scores;
        let total = 0; let totalW = 0;
        for (const [key, w] of Object.entries(WEIGHTS)) {
          if (s[key] != null) { total += (s[key] / 100) * w; totalW += w; }
        }
        const estimatedOverall = Math.round(totalW > 0 ? (total / totalW) * 100 : 0);
        const baselineOverall = (baseline as Record<string, number | undefined>).overall ?? 0;
        const delta = estimatedOverall - baselineOverall;

        const LABELS: Record<string, string> = {
          contentStructure: "Struktura treści", eeat: "E-E-A-T",
          structuredData: "Dane strukturalne", metaTags: "Meta tagi",
          aiCrawlers: "Dostęp crawlerów AI", technical: "Techniczny",
          brandAuthority: "Autorytet marki",
        };
        const dimensionDeltas: Record<string, { before: number; after: number; delta: number; label: string }> = {};
        for (const key of Object.keys(WEIGHTS)) {
          const before = (baseline as Record<string, number | undefined>)[key] ?? 50;
          const after = Math.round(s[key] ?? before);
          dimensionDeltas[key] = { before, after, delta: after - before, label: LABELS[key] ?? key };
        }

        return { estimatedOverall, baselineOverall, delta, dimensionDeltas, topImprovements: parsed.topImprovements ?? [], confidence: parsed.confidence ?? "medium" };
      }),
    // Fetch raw HTML + robots.txt for a given URL so the client-side simulation engine can run
    // Requires login — prevents anonymous abuse of the proxy
    fetchPage: protectedProcedure
      .input(z.object({ url: z.string().url() }))
      .mutation(async ({ ctx: _ctx, input }) => {
        const { default: axios } = await import("axios");
        const cheerio = await import("cheerio");
        try {
          const pageResponse = await axios.get(input.url, {
            headers: { "User-Agent": "GEO-Auditor/1.0 (+https://geoauditor.com/bot)" },
            timeout: 12000,
            maxContentLength: 2 * 1024 * 1024, // 2MB max
          });
          const urlObj = new URL(input.url);
          const robotsUrl = `${urlObj.protocol}//${urlObj.hostname}/robots.txt`;
          let robotsTxt = "";
          try {
            const robotsResponse = await axios.get(robotsUrl, { timeout: 5000 });
            robotsTxt = typeof robotsResponse.data === "string" ? robotsResponse.data : "";
          } catch {
            robotsTxt = ""; // no robots.txt = allow all
          }

          const rawHtml = typeof pageResponse.data === "string" ? pageResponse.data.slice(0, 500_000) : String(pageResponse.data).slice(0, 500_000);

          // Extract clean text for AI Co-Pilot (no HTML tags, no scripts, no nav/footer noise)
          const $ = cheerio.load(rawHtml);
          $("script, style, nav, footer, header, aside, [role='navigation'], [role='banner'], [role='complementary'], .cookie-banner, .popup, .modal, noscript").remove();
          const pageTitle = $("title").text().trim() || $("h1").first().text().trim() || "";
          const h1 = $("h1").first().text().trim();
          const metaDesc = $("meta[name='description']").attr("content") ?? "";

          // Extract headings and body text in reading order
          const contentParts: string[] = [];
          if (pageTitle) contentParts.push(`Tytuł strony: ${pageTitle}`);
          if (metaDesc) contentParts.push(`Meta description: ${metaDesc}`);
          contentParts.push("");

          const mainContent = $("main, article, [role='main'], .content, .post-content, .entry-content, #content, #main").first();
          const contentRoot = mainContent.length > 0 ? mainContent : $("body");

          contentRoot.find("h1, h2, h3, h4, p, li, td, th, blockquote, figcaption").each((_, el) => {
            const tag = (el as any).tagName?.toLowerCase() ?? "";
            const text = $(el).text().replace(/\s+/g, " ").trim();
            if (!text || text.length < 3) return;
            if (tag === "h1") contentParts.push(`\n## ${text}`);
            else if (tag === "h2") contentParts.push(`\n### ${text}`);
            else if (tag === "h3" || tag === "h4") contentParts.push(`\n#### ${text}`);
            else if (tag === "li") contentParts.push(`- ${text}`);
            else contentParts.push(text);
          });

          const cleanText = contentParts.join("\n").trim().slice(0, 12000);

          // Detect page type from URL + schema signals
          const urlPath = urlObj.pathname.toLowerCase();
          let pageType = "generic";
          const jsonldTypes: string[] = [];
          $("script[type='application/ld+json']").each((_, el) => {
            try { const d = JSON.parse($(el).html() ?? "{}"); if (d["@type"]) jsonldTypes.push(d["@type"]); } catch {}
          });
          if (jsonldTypes.some(t => ["Product", "ProductGroup"].includes(t))) pageType = "product";
          else if (jsonldTypes.some(t => ["Article", "BlogPosting", "NewsArticle", "TechArticle"].includes(t))) pageType = "article";
          else if (jsonldTypes.some(t => ["ItemList", "CollectionPage"].includes(t))) pageType = "product-listing";
          else if (urlPath === "/" || urlPath === "") pageType = "homepage";
          else if (/\/blog\/|\/news\/|\/article\/|\/post\/|\/guide\/|\/how-to\//.test(urlPath)) pageType = "article";
          else if (/\/product\/|\/p\/|\/item\/|\/sklep\/|\/produkt\//.test(urlPath)) pageType = "product";
          else if (/\/category\/|\/cat\/|\/kategoria\/|\/shop\/|\/store\//.test(urlPath)) pageType = "product-listing";
          else if (/\/service\/|\/uslugi\/|\/oferta\/|\/solutions?\//.test(urlPath)) pageType = "service";

          return {
            html: rawHtml,
            robotsTxt,
            cleanText,
            pageType,
            pageTitle,
            // Page metadata for research pipeline
            metadata: {
              title: pageTitle,
              h1,
              metaDescription: metaDesc,
            },
          };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          throw new TRPCError({ code: "BAD_REQUEST", message: `Failed to fetch URL: ${msg}` });
        }
      }),
  }),
  // ─── Stripe / Payments ────────────────────────────────────────────────────────
  payments: router({
    // Get available plans
    getPlans: publicProcedure.query(() => {
      return Object.values(PLANS).map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        priceDisplay: p.priceDisplay,
        description: p.description,
        features: p.features,
        limits: p.limits,
      }));
    }),

    // Get current user's plan
    getMyPlan: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const userRows = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const user = userRows[0];
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      return {
        plan: user.plan ?? "free",
        limits: getPlanLimits(user.plan ?? "free"),
        hasStripeCustomer: !!user.stripeCustomerId,
        hasActiveSubscription: !!user.stripeSubscriptionId,
      };
    }),

    // Create Stripe Checkout Session
    createCheckout: protectedProcedure
      .input(z.object({
        planId: z.enum(["starter", "pro", "business"]),
        origin: z.string().url(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const userRows = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
        const user = userRows[0];
        if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

        try {
          const { url } = await createCheckoutSession(
            ctx.user.id,
            user.email ?? ctx.user.email ?? "",
            user.name ?? ctx.user.name ?? "",
            input.planId,
            input.origin
          );
          return { url };
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Checkout failed";
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
        }
      }),

    // Create Billing Portal Session (manage subscription)
    createBillingPortal: protectedProcedure
      .input(z.object({ origin: z.string().url() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const { url } = await createBillingPortalSession(ctx.user.id, input.origin);
          return { url };
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Billing portal failed";
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
        }
      }),
  }),

  // ─── AI Page Creator ─────────────────────────────────────────────────────────────────────────────────────
  pageCreator: router({

    // Create a new page creation job (paid plans only)
    create: protectedProcedure
      .input(z.object({
        pageType: z.enum(["article", "listing", "landing", "product", "faq", "category", "comparison", "local"]),
        topic: z.string().min(10).max(2000),
        targetKeywords: z.array(z.string()).optional(),
        toneOfVoice: z.enum(["professional", "friendly", "expert", "conversational"]).optional(),
        targetAudience: z.string().max(500).optional(),
        additionalContext: z.string().max(3000).optional(),
        language: z.enum(["pl", "en"]).default("pl"),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

        // Check plan — paid only
        const userRows = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
        const user = userRows[0];
        if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        if (!user.plan || user.plan === "free") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "AI Page Creator jest dostępny tylko dla planów płatnych (Starter, Pro, Business).",
          });
        }

        // Create record in DB
        const [inserted] = await db.insert(pageCreations).values({
          userId: ctx.user.id,
          pageType: input.pageType,
          topic: input.topic,
          targetKeywords: input.targetKeywords ?? [],
          toneOfVoice: input.toneOfVoice ?? "professional",
          targetAudience: input.targetAudience ?? "",
          additionalContext: input.additionalContext ?? "",
          language: input.language,
          status: "pending",
        });

        const creationId = (inserted as any).insertId as number;
        console.log(`[PageCreator] Job created: id=${creationId} user=${ctx.user.id} type=${input.pageType}`);

        // Run pipeline asynchronously — update DB as stages complete
        (async () => {
          try {
            await db.update(pageCreations)
              .set({ status: "researching" })
              .where(eq(pageCreations.id, creationId));

            const result = await runPageCreatorPipeline(
              {
                pageType: input.pageType,
                topic: input.topic,
                targetKeywords: input.targetKeywords,
                toneOfVoice: input.toneOfVoice,
                targetAudience: input.targetAudience,
                additionalContext: input.additionalContext,
                language: input.language,
              },
              async (progress) => {
                const statusMap: Record<string, "pending" | "researching" | "generating" | "completed" | "failed"> = {
                  fan_out: "researching",
                  researching: "researching",
                  synthesizing: "researching",
                  generating: "generating",
                  technical: "generating",
                  done: "completed",
                };
                const newStatus = statusMap[progress.stage] ?? "generating";
                await db.update(pageCreations)
                  .set({ status: newStatus })
                  .where(eq(pageCreations.id, creationId));
              }
            );

            await db.update(pageCreations).set({
              status: "completed",
              result: result as any,
              queryFanOut: result.queryFanOut,
              groundingUrls: result.groundingSources.map(s => s.url),
              groundingSummary: result.researchSummary,
              completedAt: new Date(),
            }).where(eq(pageCreations.id, creationId));

            console.log(`[PageCreator] Job ${creationId} completed`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Pipeline failed";
            console.error(`[PageCreator] Job ${creationId} failed:`, msg);
            await db.update(pageCreations)
              .set({ status: "failed", errorMessage: msg })
              .where(eq(pageCreations.id, creationId));
          }
        })();

        return { id: creationId, status: "pending" };
      }),

    // Poll status of a page creation job
    getStatus: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const rows = await db.select().from(pageCreations)
          .where(eq(pageCreations.id, input.id))
          .limit(1);
        const row = rows[0];
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Not found" });
        if (row.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        return {
          id: row.id,
          status: row.status,
          errorMessage: row.errorMessage,
          result: row.result,
          pageType: row.pageType,
          topic: row.topic,
          createdAt: row.createdAt,
          completedAt: row.completedAt,
        };
      }),

    // Create a rewrite job from an existing audit — auto-fills brief from ContentIntelligence
    createRewrite: protectedProcedure
      .input(z.object({
        auditId: z.number().int().positive(),
        toneOfVoice: z.enum(["professional", "friendly", "expert", "conversational"]).optional(),
        additionalInstructions: z.string().max(1000).optional(),
        language: z.enum(["pl", "en"]).default("pl"),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const userRows = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
        const user = userRows[0];
        if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        if (!user.plan || user.plan === "free") {
          throw new TRPCError({ code: "FORBIDDEN", message: "AI Content Creator jest dostępny tylko dla planów płatnych." });
        }
        const audit = await getAuditById(input.auditId);
        if (!audit) throw new TRPCError({ code: "NOT_FOUND", message: "Audyt nie znaleziony" });
        const ci = audit.contentIntelligence as any;
        const findings = audit.findings as any;
        // Extract page title from meta tags check or fallback to URL
        const metaChecks: any[] = findings?.metaTags?.checks ?? [];
        const titleCheck = metaChecks.find((c: any) => c.id === "meta_title");
        const pageTitle = audit.pageTitle ?? titleCheck?.description ?? audit.url;
        const pageTopics: string[] = ci?.pageTopics ?? [];
        const semanticGaps: string[] = ci?.semanticGaps ?? [];
        const topOpportunity: string = ci?.topOpportunity ?? "";
        const ciSummary: string = ci?.summary ?? "";
        const topQuestions: string[] = ci?.topQuestions ?? [];
        const pageTypeMap: Record<string, string> = {
          product: "product", "product-listing": "listing", category: "category",
          article: "article", homepage: "landing", landing: "landing",
          service: "landing", faq: "faq", generic: "article",
        };
        const mappedPageType = pageTypeMap[audit.pageType ?? "generic"] ?? "article";
        const contextParts: string[] = [];
        if (ciSummary) contextParts.push(`Ocena AI: ${ciSummary}`);
        if (semanticGaps.length > 0) contextParts.push(`Brakujące tematy: ${semanticGaps.join(", ")}`);
        if (topOpportunity) contextParts.push(`Główna szansa: ${topOpportunity}`);
        if (topQuestions.length > 0) contextParts.push(`Pytania użytkowników: ${topQuestions.slice(0, 5).join(" | ")}`);
        if (input.additionalInstructions) contextParts.push(`Wskazówki: ${input.additionalInstructions}`);
        // Enrich with competitor citation data from the latest citation job for this audit
        try {
          const citationJobRows = await db.select()
            .from(citationJobs)
            .where(eq(citationJobs.auditId, input.auditId))
            .orderBy(desc(citationJobs.createdAt))
            .limit(1);
          if (citationJobRows.length > 0) {
            const jobId = citationJobRows[0].id;
            const checks = await db.select({
              query: citationChecks.query,
              isCited: citationChecks.isCited,
              allCitedUrls: citationChecks.allCitedUrls,
              competitorDomains: citationChecks.competitorDomains,
            }).from(citationChecks)
              .where(eq(citationChecks.jobId, jobId))
              .limit(30);
            const citedCompetitors = Array.from(new Set(
              checks
                .filter(c => !c.isCited && c.competitorDomains)
                .flatMap(c => {
                  try { return JSON.parse(c.competitorDomains as string) as string[]; } catch { return []; }
                })
                .filter(Boolean)
            )).slice(0, 5);
            const missedPhrases = checks.filter(c => !c.isCited).map(c => c.query).slice(0, 5);
            if (citedCompetitors.length > 0) {
              contextParts.push(`Cytowani konkurenci w AI Search (na frazach, gdzie ta strona nie jest cytowana): ${citedCompetitors.join(", ")}`);
            }
            if (missedPhrases.length > 0) {
              contextParts.push(`Frazy, na które strona nie jest cytowana (do wzmocnienia): ${missedPhrases.join(" | ")}`);
            }
          }
        } catch { /* non-critical — citation data is optional enrichment */ }
        const topic = `Aktualizacja treści strony: ${pageTitle}\nURL: ${audit.url}`;
        const [inserted] = await db.insert(pageCreations).values({
          userId: ctx.user.id,
          pageType: mappedPageType,
          topic,
          targetKeywords: pageTopics,
          toneOfVoice: input.toneOfVoice ?? "professional",
          targetAudience: "",
          additionalContext: contextParts.join("\n"),
          language: input.language,
          status: "pending",
        });
        const creationId = (inserted as any).insertId as number;
        console.log(`[PageCreator/Rewrite] Job created: id=${creationId} auditId=${input.auditId}`);
        (async () => {
          try {
            await db.update(pageCreations).set({ status: "researching" }).where(eq(pageCreations.id, creationId));
            const result = await runPageCreatorPipeline(
              { pageType: mappedPageType, topic, targetKeywords: pageTopics,
                toneOfVoice: input.toneOfVoice ?? "professional", targetAudience: "",
                additionalContext: contextParts.join("\n"), language: input.language },
              async (progress) => {
                const statusMap: Record<string, "pending" | "researching" | "generating" | "completed" | "failed"> = {
                  fan_out: "researching", researching: "researching", synthesizing: "researching",
                  generating: "generating", technical: "generating", done: "completed",
                };
                await db.update(pageCreations).set({ status: statusMap[progress.stage] ?? "generating" }).where(eq(pageCreations.id, creationId));
              }
            );
            await db.update(pageCreations).set({
              status: "completed", result: result as any,
              queryFanOut: result.queryFanOut,
              groundingUrls: result.groundingSources.map(s => s.url),
              groundingSummary: result.researchSummary,
              completedAt: new Date(),
            }).where(eq(pageCreations.id, creationId));
            console.log(`[PageCreator/Rewrite] Job ${creationId} completed`);
            notifyOwner({
              title: `✨ Rewrite AI użyty: ${pageTitle}`,
              content: `Użytkownik ${ctx.user.name ?? ctx.user.email} uruchomił Aktualizację treści AI dla: ${audit.url}`,
            }).catch(() => {/* non-critical */});
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Pipeline failed";
            await db.update(pageCreations).set({ status: "failed", errorMessage: msg }).where(eq(pageCreations.id, creationId));
          }
        })();
        return { id: creationId, status: "pending" };
      }),

    // List user's page creations
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select({
        id: pageCreations.id,
        pageType: pageCreations.pageType,
        topic: pageCreations.topic,
        status: pageCreations.status,
        aiReadinessScore: pageCreations.result,
        createdAt: pageCreations.createdAt,
        completedAt: pageCreations.completedAt,
      }).from(pageCreations)
        .where(eq(pageCreations.userId, ctx.user.id))
        .orderBy(pageCreations.createdAt);
      return rows;
    }),
  }),
  aiExposure: router({
    /**
     * Get AI Search Exposure Score for a domain.
     * Cached per domain for 24 hours.
     * Available to all authenticated users (free plan gets basic data, paid gets full breakdown).
     */
    getScore: publicProcedure
      .input((val: unknown) => {
        const v = val as { url: string };
        if (!v?.url || typeof v.url !== "string") throw new TRPCError({ code: "BAD_REQUEST", message: "URL is required" });
        return v;
      })
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        const now = Date.now();

        // Extract domain for cache lookup
        let domain: string;
        try {
          domain = new URL(input.url).hostname.replace(/^www\./, "");
        } catch {
          domain = input.url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
        }

        // Check cache (TTL: 24h)
        const cached = await db
          .select()
          .from(aiExposureCache)
          .where(eq(aiExposureCache.domain, domain))
          .limit(1);

        if (cached.length > 0 && cached[0].expiresAt > now) {
          const cachedResult = cached[0].result as AiExposureResult;
          // Invalidate stale cache entries where API key was not available (totalKeywordsAnalyzed === 0)
          // but now the key IS available — force a fresh fetch
          const apiKeyAvailable = !!ENV.ahrefsApiKey;
          const isStaleZeroData = apiKeyAvailable && cachedResult.totalKeywordsAnalyzed === 0;
          if (!isStaleZeroData) {
            console.log(`[AiExposure] Cache hit for domain: ${domain}`);
            return { result: cachedResult, fromCache: true };
          }
          console.log(`[AiExposure] Cache stale (0 keywords, API key now available) for domain: ${domain} — refreshing`);
        }

        // Compute fresh score
        console.log(`[AiExposure] Computing fresh score for domain: ${domain}`);
        const result = await computeAiExposureScore(input.url);

        // Upsert cache
        const TTL_24H = 24 * 60 * 60 * 1000;
        if (cached.length > 0) {
          await db
            .update(aiExposureCache)
            .set({ result, expiresAt: now + TTL_24H })
            .where(eq(aiExposureCache.domain, domain));
        } else {
          await db
            .insert(aiExposureCache)
            .values({ domain, result, expiresAt: now + TTL_24H });
        }

        return { result, fromCache: false };
      }),
  }),

  // ─── Competitor Intelligence ──────────────────────────────────────────────────

  competitor: router({
    /**
     * Get competitor audits for a given audit ID.
     * Returns top-5 competitor pages ranked by citation frequency.
     * Available to all authenticated users; data is populated async after citation check.
     */
    getForAudit: protectedProcedure
      .input(z.object({ auditId: z.number() }))
      .query(async ({ ctx, input }) => {
        // Verify the audit belongs to this user
        const audit = await getAuditById(input.auditId);
        if (!audit) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Audit not found." });
        }
        // Allow owner OR public audits (share links)
        if (audit.userId !== null && audit.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied." });
        }

        const { getCompetitorAuditsForAudit } = await import("./competitor/db");
        const rows = await getCompetitorAuditsForAudit(input.auditId);
        return rows;
      }),

    /**
     * Get gap analysis for a given audit ID.
     * Computes check-by-check differences between the target page and competitors.
     * Returns prioritised list of gaps where competitors outperform the target.
     */
    getGapAnalysis: protectedProcedure
      .input(z.object({ auditId: z.number() }))
      .query(async ({ ctx, input }) => {
        const audit = await getAuditById(input.auditId);
        if (!audit) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Audit not found." });
        }
        if (audit.userId !== null && audit.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied." });
        }
        const findings = audit.findings as import("./audit/types").AuditFindings | null;
        if (!findings) return null;

        const { getCompetitorAuditsForAudit } = await import("./competitor/db");
        const competitors = await getCompetitorAuditsForAudit(input.auditId);
        if (competitors.length === 0) return null;

        const { computeGapAnalysis } = await import("./competitor/gapAnalysis");
        return computeGapAnalysis(findings, competitors);
      }),
  }),
});
export type AppRouter = typeof appRouter;
