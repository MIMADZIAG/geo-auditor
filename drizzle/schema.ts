import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, float } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
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
  contentIntelligence: json("contentIntelligence"),
  contentIntelligenceScore: float("contentIntelligenceScore"),
  citeabilityScore: float("citeabilityScore"),
  pageTitle: text("pageTitle"),
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
  isActive: mysqlEnum("isActive", ["yes", "no"]).default("yes").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MonitoredPage = typeof monitoredPages.$inferSelect;
export type InsertMonitoredPage = typeof monitoredPages.$inferInsert;

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
  engine: mysqlEnum("engine", ["chatgpt", "perplexity", "google"]).notNull(),
  isCited: mysqlEnum("isCited", ["yes", "no", "partial"]).default("no").notNull(),
  // URL that was found in citations (may differ from audited URL — e.g. different path)
  citedUrl: text("citedUrl"),
  // Snippet from the AI response where the domain/URL appears
  snippet: text("snippet"),
  // Full AI response (truncated to 2000 chars)
  responseText: text("responseText"),
  // Cache key: hash(query + engine) for 24h deduplication
  cacheKey: varchar("cacheKey", { length: 64 }),
  checkedAt: timestamp("checkedAt").defaultNow().notNull(),
});

export type CitationCheck = typeof citationChecks.$inferSelect;
export type InsertCitationCheck = typeof citationChecks.$inferInsert;
