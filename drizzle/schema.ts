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
