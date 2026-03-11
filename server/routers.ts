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
    rewrite: publicProcedure
      .input(z.object({
        content: z.string().max(20000),
        mode: z.enum(["full_rewrite", "answer_first", "add_faq", "add_statistics", "improve_structure"]),
        issues: z.array(z.string()).optional(),
        url: z.string().optional(),
        pageType: z.string().optional(),
        targetQueries: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import("./_core/llm");

        const issuesList = (input.issues ?? []).slice(0, 10).join("\n");
        const queriesStr = (input.targetQueries ?? []).join(", ") || "ogólne zapytania w wyszukiwarkach AI";
        const pageType = input.pageType ?? "generic";

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

        const modeInstructions: Record<string, string> = {
          full_rewrite: `Przepisz całą poniższą treść od nowa, zachowując temat i kluczowe fakty, ale tworząc zupełnie nową, lepszą strukturę zoptymalizowaną pod AI Search. Napraw wszystkie wykryte problemy z audytu. Dodaj strukturę answer-first, sekcję FAQ i popraw wszystkie nagłówki. Wynik ma być gotowy do wklejenia na stronę.`,

          answer_first: `Przeorganizuj poniższą treść według wzorca "answer-first": zacznij od bezpośredniej, wyczerpującej odpowiedzi na główne pytanie strony (2-3 zdania), następnie podaj szczegóły. Przenieś najważniejsze informacje na górę. Zachowaj całą istniejącą treść, ale zmień kolejność i strukturę.`,

          add_faq: `Zachowaj istniejącą treść i DODAJ na końcu sekcję FAQ. Wygeneruj 6-8 pytań, które użytkownicy wpisują w Google i wyszukiwarkach AI w związku z tematem tej strony. Każda odpowiedź: 2-4 zdania, konkretna i bezpośrednia. Sekcja FAQ powinna zaczynać się od nagłówka "Najczęściej zadawane pytania" lub "Często zadawane pytania".`,

          add_statistics: `Zachowaj strukturę istniejącej treści, ale wzbogać ją o konkretne dane: liczby, procenty, statystyki, daty. Tam gdzie treść jest ogólna, dodaj konkretne wartości. Dodaj sekcję "Kluczowe liczby" lub "Fakty i dane" blisko początku. Jeśli oryginał nie zawiera danych, użyj realistycznych szacunków branżowych i zaznacz je jako przybliżone.`,

          improve_structure: `Zachowaj całą istniejącą treść, ale popraw jej strukturę: podziel na sekcje z jasnymi nagłówkami (w formie pytań tam gdzie możliwe), zamień długie akapity na listy punktowane, dodaj wyraźne wprowadzenie i podsumowanie. Dodaj skrócone streszczenie (TL;DR lub "W skrócie") na początku lub końcu.`,
        };

        const userPrompt = `${modeInstructions[input.mode]}

--- TREŚĆ DO OPTYMALIZACJI ---
${input.content.slice(0, 15000)}
--- KONIEC TREŚCI ---`;

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
          };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          throw new TRPCError({ code: "BAD_REQUEST", message: `Failed to fetch URL: ${msg}` });
        }
      }),
  }),
});
export type AppRouter = typeof appRouter;
