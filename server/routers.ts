import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { runAudit } from "./audit/index";
import { createCitationJob, getCitationResultsForAudit } from "./citation/db";
import { runCitationJob } from "./citation/worker";
import { getLastHealthReport, runAndCacheHealthCheck } from "./citation/selectorHealth";
import { createCheckoutSession, createBillingPortalSession } from "./stripe/handler";
import { PLANS, getPlanLimits } from "./stripe/products";
import { getDb } from "./db";
import { users, audits } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";
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
} from "./db";
import { guardAgainstHallucinations } from "./rewrite/hallucinationGuard";
import { runRewriteResearch } from "./rewrite/rewriteResearch";
import { normalizePolishCapitalization, isPolishText } from "./utils/textNormalization";
import { runPageCreatorPipeline } from "./pageCreator/index";
import { pageCreations, aiExposureCache } from "../drizzle/schema";
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
      .input(z.object({ limit: z.number().min(1).max(50).default(20) }))
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

        // Create job with empty prompts — worker generates queries via fanOutQueries()
        const jobId = await createCitationJob({
          auditId: input.auditId,
          userId,
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

    /**
     * Get citation status for multiple audits at once (for Dashboard).
     * Returns a map of auditId -> {status, citedCount, totalEngines}.
     * Efficient: one query per batch, no N+1.
     */
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

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✍️ ZASADY FORMATOWANIA WYJŚCIOWEGO (BEZWZGLĘDNE):
1. Pisz WYŁĄCZNIE gotowy tekst do wklejenia na stronę — bez komentarzy, wyjaśnień, meta-komentarzy
2. NIE używaj znaków # do nagłówków — pisz nagłówki jako zwykły tekst z nową linią
3. NIE używaj znaków ** do pogrubień — jeśli chcesz wyróżnić, użyj normalnego zdania
4. NIE używaj znaków Markdown takich jak #, **, *, _, >, ---
5. Listy punktowane pisz ze zwykłym myślnikiem i spacją: "- element"
6. Nagłówki sekcji pisz jako osobne linie z dużej litery, bez żadnych znaków specjalnych
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
              finalContent = normalizePolishCapitalization(finalContent, detectedLang);
              console.log(`[Rewrite] Polish capitalization normalization applied (lang=${detectedLang ?? "auto-detected"})`);
            }
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
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
        }
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
});
export type AppRouter = typeof appRouter;
