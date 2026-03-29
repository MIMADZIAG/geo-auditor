import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, float, boolean, bigint } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  // Stripe integration
  stripeCustomerId: varchar("stripeCustomerId", { length: 64 }),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 64 }),
  // Plan: free | starter | pro | business (cached from Stripe for fast access)
  plan: mysqlEnum("plan", ["free", "starter", "pro", "business"]).default("free").notNull(),
  planExpiresAt: timestamp("planExpiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const audits = mysqlTable("audits", {
  id: int("id").autoincrement().primaryKey(),
  url: varchar("url", { length: 2048 }).notNull(),
  userId: int("userId"),
  ipAddress: varchar("ipAddress", { length: 64 }),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed"]).default("pending").notNull(),
  overallScore: float("overallScore"),
  technicalScore: float("technicalScore"),
  structuredDataScore: float("structuredDataScore"),
  contentStructureScore: float("contentStructureScore"),
  eeatScore: float("eeatScore"),
  aiCrawlerScore: float("aiCrawlerScore"),
  metaTagsScore: float("metaTagsScore"),
  findings: json("findings"),
  recommendations: json("recommendations"),
  llmRecommendations: json("llmRecommendations"),
  llmAiInsight: text("llmAiInsight"),
  llmTopPriority: text("llmTopPriority"),
  llmScoreGain: int("llmScoreGain"),
  llmDifficulty: text("llmDifficulty"),
  contentIntelligence: json("contentIntelligence"),
  contentIntelligenceScore: float("contentIntelligenceScore"),
  citeabilityScore: float("citeabilityScore"),
  pageTitle: text("pageTitle"),
  pageType: varchar("pageType", { length: 64 }),
  wafBlocked: boolean("wafBlocked").default(false),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type Audit = typeof audits.$inferSelect;
export type InsertAudit = typeof audits.$inferInsert;

export const auditRateLimits = mysqlTable("audit_rate_limits", {
  id: int("id").autoincrement().primaryKey(),
  ipAddress: varchar("ipAddress", { length: 64 }).notNull(),
  auditCount: int("auditCount").default(1).notNull(),
  windowStart: timestamp("windowStart").defaultNow().notNull(),
});

export type AuditRateLimit = typeof auditRateLimits.$inferSelect;

// Monitored pages — users subscribe a URL to periodic re-audits
export const monitoredPages = mysqlTable("monitored_pages", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  url: varchar("url", { length: 2048 }).notNull(),
  label: varchar("label", { length: 255 }),
  // plan context: free users get 1 slot, paid users get more
  lastAuditId: int("lastAuditId"),
  lastScore: float("lastScore"),
  lastAuditAt: timestamp("lastAuditAt"),
  nextAuditAt: timestamp("nextAuditAt"),
  // scheduleFrequency in days: 1, 2, 3, 7 (default weekly), 14, 30
  // Starter: locked to 7. Pro: 1/2/3/7/14/30. Business: any.
  scheduleFrequency: int("scheduleFrequency").default(7).notNull(),
  isActive: mysqlEnum("isActive", ["yes", "no"]).default("yes").notNull(),
  // AI Citation Visibility — updated after each citation job completes
  lastCitedEngines: int("lastCitedEngines"),     // how many engines cited this page last check
  lastTotalEngines: int("lastTotalEngines"),     // total engines checked last time (usually 4)
  lastCitationAt: timestamp("lastCitationAt"),  // when last citation check completed
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MonitoredPage = typeof monitoredPages.$inferSelect;
export type InsertMonitoredPage = typeof monitoredPages.$inferInsert;

// Monitor audit runs — one row per cron-triggered audit for a monitored page
export const monitorAuditRuns = mysqlTable("monitor_audit_runs", {
  id: int("id").autoincrement().primaryKey(),
  monitoredPageId: int("monitoredPageId").notNull(),
  auditId: int("auditId").notNull(),
  userId: int("userId").notNull(),
  overallScore: float("overallScore"),
  scoreDelta: float("scoreDelta"),           // diff vs previous run (positive = improved)
  status: mysqlEnum("status", ["completed", "failed"]).default("completed").notNull(),
  emailSent: boolean("emailSent").default(false).notNull(),
  triggeredBy: mysqlEnum("triggeredBy", ["cron", "manual"]).default("cron").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MonitorAuditRun = typeof monitorAuditRuns.$inferSelect;
export type InsertMonitorAuditRun = typeof monitorAuditRuns.$inferInsert;

// Score snapshots — one row per completed audit for a monitored page (for history chart)
export const scoreSnapshots = mysqlTable("score_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  monitoredPageId: int("monitoredPageId").notNull(),
  auditId: int("auditId").notNull(),
  overallScore: float("overallScore").notNull(),
  technicalScore: float("technicalScore"),
  structuredDataScore: float("structuredDataScore"),
  contentStructureScore: float("contentStructureScore"),
  eeatScore: float("eeatScore"),
  aiCrawlerScore: float("aiCrawlerScore"),
  metaTagsScore: float("metaTagsScore"),
  // AI Citation Visibility — snapshot of citation status at this point in time
  citedEnginesCount: int("citedEnginesCount"),    // engines that cited this page (0-4)
  totalEnginesChecked: int("totalEnginesChecked"), // engines checked (usually 4)
  citationJobId: int("citationJobId"),             // FK to citation_jobs.id
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
});

export type ScoreSnapshot = typeof scoreSnapshots.$inferSelect;
export type InsertScoreSnapshot = typeof scoreSnapshots.$inferInsert;

// Email leads — captured from diagnostic results page (pre-registration)
export const emailLeads = mysqlTable("email_leads", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  auditId: int("auditId"),
  source: varchar("source", { length: 100 }).default("results_page"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type EmailLead = typeof emailLeads.$inferSelect;
export type InsertEmailLead = typeof emailLeads.$inferInsert;

// Citation jobs — one job per audit (async, runs after audit completes)
export const citationJobs = mysqlTable("citation_jobs", {
  id: int("id").autoincrement().primaryKey(),
  auditId: int("auditId").notNull(),
  userId: int("userId"),
  url: varchar("url", { length: 2048 }).notNull(),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed"]).default("pending").notNull(),
  prompts: json("prompts"), // generated query list
  language: varchar("language", { length: 10 }).default("en"), // page language for query generation
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type CitationJob = typeof citationJobs.$inferSelect;
export type InsertCitationJob = typeof citationJobs.$inferInsert;

// Citation checks — one row per (query, engine) combination
export const citationChecks = mysqlTable("citation_checks", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  auditId: int("auditId").notNull(),
  query: text("query").notNull(),
  engine: mysqlEnum("engine", ["chatgpt", "google", "perplexity", "gemini"]).notNull(),
  isCited: mysqlEnum("isCited", ["yes", "no", "domain"]).default("no").notNull(),
  // Exact URL that was found in citations
  citedUrl: text("citedUrl"),
  // URL from same domain cited when isCited = "domain" (different page on same domain)
  domainCitedUrl: text("domainCitedUrl"),
  // Snippet from the AI response where the domain/URL appears
  snippet: text("snippet"),
  // Full AI response (truncated to 2000 chars)
  responseText: text("responseText"),
  // All URLs cited by AI for this query (competitor domains included)
  allCitedUrls: json("allCitedUrls"), // string[]
  // Whether AI Overview was present at all (Google only)
  hasAIOverview: boolean("hasAIOverview").default(false),
  // Cache key: hash(query + engine) for 24h deduplication
  cacheKey: varchar("cacheKey", { length: 64 }),
  // Round number in adaptive fan-out (1-5)
  round: int("round").default(1).notNull(),
  // Competitor domains extracted from allCitedUrls (hostname only, deduplicated)
  competitorDomains: json("competitorDomains"), // string[]
  checkedAt: timestamp("checkedAt").defaultNow().notNull(),
});

export type CitationCheck = typeof citationChecks.$inferSelect;
export type InsertCitationCheck = typeof citationChecks.$inferInsert;

// AI Page Creator — stores wizard sessions and generated page blueprints
export const pageCreations = mysqlTable("page_creations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),

  // Wizard inputs
  pageType: varchar("pageType", { length: 64 }).notNull(),          // article | listing | landing | product | faq | category | comparison | local
  topic: text("topic").notNull(),                                    // user-provided topic / brief
  targetKeywords: json("targetKeywords"),                           // string[] — extracted or user-provided
  toneOfVoice: varchar("toneOfVoice", { length: 64 }),              // professional | friendly | expert | conversational
  targetAudience: text("targetAudience"),
  additionalContext: text("additionalContext"),                      // extra info user provided
  language: varchar("language", { length: 10 }).default("pl").notNull(),

  // Processing
  status: mysqlEnum("status", ["pending", "researching", "generating", "completed", "failed"]).default("pending").notNull(),
  errorMessage: text("errorMessage"),

  // Research phase
  groundingUrls: json("groundingUrls"),                             // URLs scraped for grounding
  groundingSummary: text("groundingSummary"),                       // condensed research summary
  queryFanOut: json("queryFanOut"),                                  // string[] — generated search queries

  // Generated output — full blueprint
  result: json("result"),                                           // PageCreationResult (see shared/types)

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type PageCreation = typeof pageCreations.$inferSelect;
export type InsertPageCreation = typeof pageCreations.$inferInsert;

// AI Search Exposure Score cache — one row per domain, TTL 24h
export const aiExposureCache = mysqlTable("ai_exposure_cache", {
  id: int("id").autoincrement().primaryKey(),
  domain: varchar("domain", { length: 255 }).notNull(),
  result: json("result").notNull(),  // AiExposureResult
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: bigint("expiresAt", { mode: "number" }).notNull(), // Unix ms
});

export type AiExposureCache = typeof aiExposureCache.$inferSelect;
export type InsertAiExposureCache = typeof aiExposureCache.$inferInsert;

// Weekly Digest Log — prevents duplicate sends, tracks what was sent per user per week
export const weeklyDigestLog = mysqlTable("weekly_digest_log", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  weekStart: timestamp("weekStart").notNull(),   // Monday 00:00 UTC of the week covered
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  // Snapshot of metrics included in this digest (for analytics / debugging)
  avgScoreThisWeek: float("avgScoreThisWeek"),
  avgScorePrevWeek: float("avgScorePrevWeek"),
  citedEnginesThisWeek: float("citedEnginesThisWeek"),
  citedEnginesPrevWeek: float("citedEnginesPrevWeek"),
  monitoredPagesCount: int("monitoredPagesCount").default(0),
});
export type WeeklyDigestLog = typeof weeklyDigestLog.$inferSelect;
export type InsertWeeklyDigestLog = typeof weeklyDigestLog.$inferInsert;

// ─── Competitor Intelligence ──────────────────────────────────────────────────
// Stores lightweight (no-LLM) audits of top-5 competitor URLs discovered during
// citation checks. Designed for gap analysis: every column maps 1:1 to an
// AuditCheck.id so the comparison layer can diff them against the audited page
// without extra queries.
export const competitorAudits = mysqlTable("competitor_audits", {
  id: int("id").autoincrement().primaryKey(),
  // Source linkage
  auditId:       int("auditId").notNull(),   // original audit that triggered this
  jobId:         int("jobId").notNull(),     // citation job that discovered this competitor
  userId:        int("userId").notNull(),    // owner (for access control)
  // Competitor identity
  url:           text("url").notNull(),
  domain:        varchar("domain", { length: 255 }).notNull(),
  pageTitle:     text("pageTitle"),
  citationCount: int("citationCount").default(0).notNull(), // times cited across all engines/queries
  rank:          int("rank").default(1).notNull(),           // 1 = most cited, 5 = least
  // Processing state
  status:        mysqlEnum("status", ["pending", "running", "completed", "failed"]).default("pending").notNull(),
  errorMessage:  text("errorMessage"),
  // ── Category scores (0-100) ──────────────────────────────────────────────
  overallScore:          int("overallScore"),
  technicalScore:        int("technicalScore"),
  structuredDataScore:   int("structuredDataScore"),
  contentStructureScore: int("contentStructureScore"),
  eeatScore:             int("eeatScore"),
  aiCrawlersScore:       int("aiCrawlersScore"),
  metaTagsScore:         int("metaTagsScore"),
  brandAuthorityScore:   int("brandAuthorityScore"),
  // ── Technical checks (1=pass, 0=fail, null=unknown) ──────────────────────
  tech_https:           int("tech_https"),
  tech_noindex:         int("tech_noindex"),         // 1=noindex present (bad)
  tech_nosnippet:       int("tech_nosnippet"),       // 1=nosnippet present (bad)
  tech_canonical:       int("tech_canonical"),
  tech_viewport:        int("tech_viewport"),
  tech_robots_disallow: int("tech_robots_disallow"), // 1=disallowed (bad)
  tech_response_time_ms: int("tech_response_time_ms"),
  tech_page_size_kb:    int("tech_page_size_kb"),
  tech_sitemap:         int("tech_sitemap"),
  tech_hreflang:        int("tech_hreflang"),
  tech_max_snippet:     int("tech_max_snippet"),
  tech_noai_directive:  int("tech_noai_directive"),  // 1=AI blocked (bad)
  // ── Structured Data ───────────────────────────────────────────────────────
  sd_jsonld_present:      int("sd_jsonld_present"),
  sd_high_value_schema:   int("sd_high_value_schema"),
  sd_faq_schema:          int("sd_faq_schema"),
  sd_howto_schema:        int("sd_howto_schema"),
  sd_article_product:     int("sd_article_product"),
  sd_organization:        int("sd_organization"),
  sd_schema_completeness: int("sd_schema_completeness"),
  sd_author_schema:       int("sd_author_schema"),
  sd_date_signals:        int("sd_date_signals"),
  sd_breadcrumb:          int("sd_breadcrumb"),
  // ── Content Structure ─────────────────────────────────────────────────────
  cs_h1_present:           int("cs_h1_present"),
  cs_heading_hierarchy:    int("cs_heading_hierarchy"),
  cs_passage_optimization: int("cs_passage_optimization"),
  cs_tldr_summary:         int("cs_tldr_summary"),
  cs_faq_section:          int("cs_faq_section"),
  cs_semantic_chunking:    int("cs_semantic_chunking"),
  cs_entity_richness:      int("cs_entity_richness"),
  cs_readability:          int("cs_readability"),
  cs_semantic_triples:     int("cs_semantic_triples"),
  cs_lists_present:        int("cs_lists_present"),
  cs_content_length:       int("cs_content_length"),  // word count
  cs_information_gain:     int("cs_information_gain"),
  cs_answer_patterns:      int("cs_answer_patterns"),
  cs_external_citations:   int("cs_external_citations"),
  cs_data_points:          int("cs_data_points"),
  // ── E-E-A-T ───────────────────────────────────────────────────────────────
  eeat_author_byline:      int("eeat_author_byline"),
  eeat_about_page:         int("eeat_about_page"),
  eeat_contact_info:       int("eeat_contact_info"),
  eeat_legal_pages:        int("eeat_legal_pages"),
  eeat_review_signals:     int("eeat_review_signals"),
  eeat_trust_signals:      int("eeat_trust_signals"),
  eeat_publication_date:   int("eeat_publication_date"),
  eeat_experience_signals: int("eeat_experience_signals"),
  eeat_expertise_signals:  int("eeat_expertise_signals"),
  // ── AI Crawlers ───────────────────────────────────────────────────────────
  ai_url_access:       int("ai_url_access"),
  ai_full_block:       int("ai_full_block"),        // 1=blocked (bad)
  ai_training_bots:    int("ai_training_bots"),
  ai_sitemap_crawlers: int("ai_sitemap_crawlers"),
  ai_llms_txt:         int("ai_llms_txt"),
  // ── Meta Tags ─────────────────────────────────────────────────────────────
  mt_title_tag:        int("mt_title_tag"),
  mt_meta_description: int("mt_meta_description"),
  mt_og_title:         int("mt_og_title"),
  mt_og_description:   int("mt_og_description"),
  mt_og_image:         int("mt_og_image"),
  mt_twitter_card:     int("mt_twitter_card"),
  mt_lang_attribute:   int("mt_lang_attribute"),
  // ── Brand Authority ───────────────────────────────────────────────────────
  ba_brand_consistency:    int("ba_brand_consistency"),
  ba_knowledge_panel:      int("ba_knowledge_panel"),
  ba_media_presence:       int("ba_media_presence"),
  ba_industry_credentials: int("ba_industry_credentials"),
  ba_social_proof:         int("ba_social_proof"),
  ba_niche_authority:      int("ba_niche_authority"),
  // ── Timestamps ────────────────────────────────────────────────────────────
  createdAt:   timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type CompetitorAudit = typeof competitorAudits.$inferSelect;
export type InsertCompetitorAudit = typeof competitorAudits.$inferInsert;
