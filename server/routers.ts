import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { runAudit } from "./audit/index";
import { createCitationJob, getCitationResultsForAudit } from "./citation/db";
import { runCitationJob } from "./citation/worker";
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
  captureEmailLead,
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
     * Start a citation check for an audit (Pro feature).
     * Runs asynchronously — returns jobId immediately, results appear after ~2-5 min.
     */
    startCheck: protectedProcedure
      .input(z.object({
        auditId: z.number(),
        // v2: backend fetches URL from DB and generates queries via fan-out
        // frontend only needs to pass auditId
      }))
      .mutation(async ({ ctx, input }) => {
        // Fetch audit from DB to get the URL
        const audit = await getAuditById(input.auditId);
        if (!audit) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Audit not found" });
        }

        // Create job with empty prompts — worker generates queries via fanOutQueries()
        const jobId = await createCitationJob({
          auditId: input.auditId,
          userId: ctx.user.id,
          url: audit.url,
          prompts: [],   // worker generates via fanOutQueries() from live page content
          language: "auto", // worker auto-detects from page HTML
        });

        if (!jobId) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create citation job" });
        }

        // Run asynchronously — return jobId immediately, results appear after ~2-5 min
        runCitationJob(jobId).catch((err) => {
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
  }),

  sandbox: router({
    // AI Content Co-Pilot — rewrites content using LLM with 5 optimization modes
    rewrite: publicProcedure
      .input(z.object({
        content: z.string().max(20000),
        mode: z.enum(["full_rewrite", "answer_first", "add_faq", "add_statistics", "improve_structure"]),
        issues: z.array(z.string()).optional(),
        url: z.string().optional(),
        targetQueries: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import("./_core/llm");

        const issuesList = (input.issues ?? []).slice(0, 10).join("\n");
        const queriesStr = (input.targetQueries ?? []).join(", ") || "general AI search queries";

        const systemPrompt = `You are an expert GEO (Generative Engine Optimization) content specialist.
Your task is to rewrite web page content to maximize its visibility and citation probability in AI search engines like ChatGPT, Perplexity, and Google AI Overviews.

Key principles for AI-optimized content:
- Answer questions directly and concisely at the start (answer-first structure)
- Use clear headings with question-format (H2/H3 as questions)
- Include FAQ sections with direct Q&A pairs
- Add specific statistics, numbers, and data points
- Use structured lists and tables where appropriate
- Include authoritative citations and sources
- Ensure content is comprehensive but scannable
- Use natural language that matches how people ask questions

Target queries: ${queriesStr}

Audit issues to fix:
${issuesList || "No specific issues provided — optimize for general AI readiness"}

IMPORTANT: Return ONLY the rewritten content in markdown format. Do not add explanations or meta-commentary.`;

        const modeInstructions: Record<string, string> = {
          full_rewrite: `Completely rewrite the content below to be fully optimized for AI search citation. Fix all audit issues. Preserve the core topic and key facts but restructure everything for maximum AI readability. Add answer-first structure, FAQ section, and improve all headings.`,
          answer_first: `Restructure the content below using the "answer-first" pattern: start with a direct, comprehensive answer to the main question in 2-3 sentences, then provide supporting details. Move the most important information to the top. Keep all existing content but reorganize it.`,
          add_faq: `Keep the existing content and ADD a comprehensive FAQ section at the end. Generate 5-8 relevant FAQ questions based on the content topic and target queries, with direct, concise answers (2-4 sentences each). Format as ## Frequently Asked Questions with ### Q: format.`,
          add_statistics: `Keep the existing content structure but enhance it by adding specific statistics, numbers, percentages, and data points throughout. Where statistics are mentioned vaguely, make them specific. Add a "Key Statistics" section near the top. If exact numbers aren't in the original, use realistic industry-standard estimates and note them as approximate.`,
          improve_structure: `Keep all the existing content but improve its structure: convert prose into scannable sections with clear H2/H3 headings (as questions where possible), add bullet points and numbered lists, create a clear introduction paragraph, and ensure logical flow. Add a TL;DR summary at the top.`,
        };

        const userPrompt = `${modeInstructions[input.mode]}

--- CONTENT TO OPTIMIZE ---
${input.content.slice(0, 15000)}
--- END CONTENT ---`;

        try {
          const response = await invokeLLM({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
          });
          const rewritten = response.choices?.[0]?.message?.content ?? "";
          if (!rewritten) throw new Error("Empty response from AI");
          return { rewrittenContent: rewritten };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "AI rewrite failed";
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
        }
      }),

    // Fetch raw HTML + robots.txt for a given URL so the client-side simulation engine can run
    fetchPage: publicProcedure
      .input(z.object({ url: z.string().url() }))
      .mutation(async ({ input }) => {
        const { default: axios } = await import("axios");
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
          return {
            html: typeof pageResponse.data === "string" ? pageResponse.data.slice(0, 500_000) : String(pageResponse.data).slice(0, 500_000),
            robotsTxt,
          };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          throw new TRPCError({ code: "BAD_REQUEST", message: `Failed to fetch URL: ${msg}` });
        }
      }),
  }),
});
export type AppRouter = typeof appRouter;
