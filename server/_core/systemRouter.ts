import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { runWeeklyDigestCron, getWeeklyDigestData, sendWeeklyDigest } from "../monitoring/weeklyDigest";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),

  /**
   * Admin-only: trigger weekly digest manually.
   * - Without userId: runs full cron (all eligible users, dedup applies).
   * - With userId: sends test digest to that user regardless of dedup.
   */
  triggerWeeklyDigest: adminProcedure
    .input(
      z.object({
        userId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const appUrl =
        (ctx.req.headers.origin as string | undefined) ??
        `https://${process.env.VITE_APP_ID ?? "geo-auditor"}.manus.space`;

      if (input.userId) {
        const data = await getWeeklyDigestData(input.userId, appUrl);
        if (!data) {
          return {
            success: false,
            message: "No data available (no monitored pages or no email address for this user)",
          };
        }
        const ok = await sendWeeklyDigest(data);
        return {
          success: ok,
          message: ok ? `Digest sent to ${data.toEmail}` : "Send failed — check server logs",
        };
      }

      // Full cron run (respects dedup)
      const result = await runWeeklyDigestCron(appUrl);
      return { success: true, ...result };
    }),
});
