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
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Get client IP for rate limiting
        const ip =
          (ctx.req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
          (ctx.req as unknown as { ip?: string }).ip ??
          "unknown";

        // Check rate limit (skip for authenticated users — they get more)
        if (!ctx.user) {
          const { allowed, remaining, resetAt } = await checkRateLimit(ip);
          if (!allowed) {
            throw new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message: `Free audit limit reached. You can run ${remaining} more audit${remaining !== 1 ? "s" : ""} after ${resetAt.toLocaleTimeString()}.`,
            });
          }
        }

        // Create audit record
        const insertResult = await createAudit({
          url: input.url,
          userId: ctx.user?.id ?? null,
          ipAddress: ip,
          status: "running",
        });

        const auditId = Number((insertResult as unknown as [{ insertId: number }, unknown])[0]?.insertId);

        try {
          // Run the full audit
          const result = await runAudit(input.url);

          // Persist results
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
            pageTitle: result.pageTitle,
            errorMessage: result.error ?? null,
            completedAt: new Date(),
          });

          // Increment rate limit counter for anonymous users
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
});

export type AppRouter = typeof appRouter;
