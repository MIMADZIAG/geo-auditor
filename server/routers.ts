import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { runAudit } from "./audit/index";
import {
  createAudit,
  updateAudit,
  getAuditById,
  getAuditsByUser,
  checkRateLimit,
  incrementRateLimit,
  getMonitoredPagesByUser,
  addMonitoredPage,
  removeMonitoredPage,
  updateMonitoredPageAfterAudit,
  addScoreSnapshot,
  getScoreSnapshots,
  MAX_MONITORING_SLOTS_FREE,
} from "./db";

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
            contentIntelligence: result.contentIntelligence as unknown as Record<string, unknown> ?? null,
            contentIntelligenceScore: result.contentIntelligence?.overallScore ?? null,
            citeabilityScore: result.contentIntelligence?.citeabilityScore ?? null,
            pageTitle: result.pageTitle,
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
      .input(z.object({ limit: z.number().min(1).max(50).default(20) }))
      .query(async ({ ctx, input }) => {
        return getAuditsByUser(ctx.user.id, input.limit);
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

        // Free plan: max 1 monitored page
        if (existing.length >= MAX_MONITORING_SLOTS_FREE) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Free plan allows monitoring ${MAX_MONITORING_SLOTS_FREE} page. Upgrade to monitor more.`,
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
  }),
});

export type AppRouter = typeof appRouter;
