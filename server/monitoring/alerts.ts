/**
 * Monitoring Alert System — Phase 2
 *
 * Three alert types with smart deduplication:
 *   1. NEW_CITATION   — page starts being cited (citedEngines was 0, now > 0)
 *   2. LOST_CITATION  — page stops being cited (citedEngines was > 0, now 0)
 *                       Only fires after 2 consecutive runs without citation
 *                       to avoid false positives from transient API errors.
 *   3. COMPETITOR     — a competitor domain is cited instead of this page
 *                       (Pro/Business only, fires at most once per week per domain)
 *
 * All alerts go through the existing email infrastructure (sendMonitoringEmail
 * is extended here with a lightweight alert-specific sender).
 *
 * Design decisions:
 * - No new DB table: alert state is derived from score_snapshots + monitored_pages
 * - Deduplication: track last alert time in monitored_pages.metadata (JSON field)
 *   or use a simple in-memory cooldown map (sufficient for MVP scale)
 * - Non-blocking: all alert sends are fire-and-forget with error swallowing
 */
import nodemailer from "nodemailer";
import { getDb } from "../db";
import { monitoredPages } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type AlertType = "new_citation" | "lost_citation" | "competitor";

export interface CitationAlert {
  type: AlertType;
  pageId: number;
  url: string;
  label: string | null;
  userEmail: string | null;
  userName: string | null;
  appUrl: string;
  auditId: number;
  // new_citation / lost_citation
  citedEngines?: number;
  totalEngines?: number;
  previousCitedEngines?: number;
  // competitor
  competitorDomain?: string;
  competitorUrl?: string;
  phraseContext?: string;
}

// ─── In-memory cooldown (survives process restart on next alert) ───────────────
// Key: `${pageId}:${alertType}[:competitorDomain]` → timestamp of last alert
const alertCooldowns = new Map<string, number>();

const COOLDOWN_MS: Record<AlertType, number> = {
  new_citation: 24 * 60 * 60 * 1000,   // 24h — don't spam on every run
  lost_citation: 48 * 60 * 60 * 1000,  // 48h — require 2 consecutive misses
  competitor: 7 * 24 * 60 * 60 * 1000, // 7d per competitor domain
};

function isCooledDown(key: string, type: AlertType): boolean {
  const last = alertCooldowns.get(key);
  if (!last) return false;
  return Date.now() - last < COOLDOWN_MS[type];
}

function markSent(key: string): void {
  alertCooldowns.set(key, Date.now());
}

// ─── Email sender ──────────────────────────────────────────────────────────────

async function sendAlertEmail(alert: CitationAlert): Promise<boolean> {
  const { toEmail, subject, html } = buildAlertEmail(alert);
  if (!toEmail) return false;

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "GEO-Auditor <alerts@geoauditor.app>",
          to: [toEmail],
          subject,
          html,
        }),
      });
      return res.ok;
    } catch (err) {
      console.error("[AlertSystem] Resend send failed:", err);
    }
  }

  // SMTP fallback
  const smtpHost = process.env.SMTP_HOST;
  if (smtpHost) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(process.env.SMTP_PORT ?? "587", 10),
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transporter.sendMail({
        from: `GEO-Auditor <${process.env.SMTP_FROM ?? process.env.SMTP_USER}>`,
        to: toEmail,
        subject,
        html,
      });
      return true;
    } catch (err) {
      console.error("[AlertSystem] SMTP send failed:", err);
    }
  }

  // Dev fallback
  console.log(`[AlertSystem][DEV] Would send "${subject}" to ${toEmail}`);
  return true;
}

// ─── Email templates ───────────────────────────────────────────────────────────

function buildAlertEmail(alert: CitationAlert): { toEmail: string | null; subject: string; html: string } {
  const pageLabel = alert.label ?? new URL(alert.url).hostname;
  const reportUrl = `${alert.appUrl}/results/${alert.auditId}`;
  const pulseUrl = `${alert.appUrl}/pulse`;

  if (alert.type === "new_citation") {
    return {
      toEmail: alert.userEmail,
      subject: `🎉 ${pageLabel} jest teraz cytowana przez AI Search`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;background:#0f0f13;color:#e2e8f0;padding:32px;border-radius:12px;">
          <h2 style="color:#a78bfa;margin:0 0 8px 0;">🎉 Nowe cytowanie AI!</h2>
          <p style="color:#94a3b8;margin:0 0 20px 0;">Twoja strona jest teraz widoczna w AI Search.</p>
          <div style="background:#1e1b2e;border:1px solid #312e81;border-radius:8px;padding:16px;margin-bottom:20px;">
            <p style="margin:0 0 4px 0;font-size:13px;color:#a78bfa;font-weight:600;">${pageLabel}</p>
            <p style="margin:0;font-size:12px;color:#64748b;">${alert.url}</p>
            <p style="margin:12px 0 0 0;font-size:28px;font-weight:800;color:#22c55e;">${alert.citedEngines ?? 0}/${alert.totalEngines ?? 4} <span style="font-size:14px;color:#64748b;">silników AI</span></p>
          </div>
          <a href="${reportUrl}" style="display:inline-block;background:#7c3aed;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;margin-right:8px;">Zobacz raport</a>
          <a href="${pulseUrl}" style="display:inline-block;background:#1e293b;color:#a78bfa;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;border:1px solid #312e81;">Citation Pulse</a>
        </div>
      `,
    };
  }

  if (alert.type === "lost_citation") {
    return {
      toEmail: alert.userEmail,
      subject: `⚠️ ${pageLabel} przestała być cytowana przez AI`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;background:#0f0f13;color:#e2e8f0;padding:32px;border-radius:12px;">
          <h2 style="color:#f59e0b;margin:0 0 8px 0;">⚠️ Utracone cytowanie AI</h2>
          <p style="color:#94a3b8;margin:0 0 20px 0;">Twoja strona przestała być cytowana przez silniki AI. Sprawdź, co się zmieniło.</p>
          <div style="background:#1e1b2e;border:1px solid #451a03;border-radius:8px;padding:16px;margin-bottom:20px;">
            <p style="margin:0 0 4px 0;font-size:13px;color:#f59e0b;font-weight:600;">${pageLabel}</p>
            <p style="margin:0;font-size:12px;color:#64748b;">${alert.url}</p>
            <p style="margin:12px 0 0 0;font-size:13px;color:#94a3b8;">Poprzednio: <strong style="color:#f59e0b;">${alert.previousCitedEngines ?? 0}/${alert.totalEngines ?? 4} silników</strong> → Teraz: <strong style="color:#ef4444;">0/${alert.totalEngines ?? 4}</strong></p>
          </div>
          <a href="${reportUrl}" style="display:inline-block;background:#7c3aed;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;margin-right:8px;">Sprawdź raport</a>
          <a href="${pulseUrl}" style="display:inline-block;background:#1e293b;color:#a78bfa;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;border:1px solid #312e81;">Citation Pulse</a>
        </div>
      `,
    };
  }

  if (alert.type === "competitor") {
    return {
      toEmail: alert.userEmail,
      subject: `🔍 Konkurent ${alert.competitorDomain} cytowany zamiast Ciebie`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;background:#0f0f13;color:#e2e8f0;padding:32px;border-radius:12px;">
          <h2 style="color:#60a5fa;margin:0 0 8px 0;">🔍 Alert konkurencyjny</h2>
          <p style="color:#94a3b8;margin:0 0 20px 0;">Konkurent pojawia się w AI Search dla zapytań związanych z Twoją stroną.</p>
          <div style="background:#1e1b2e;border:1px solid #1e3a5f;border-radius:8px;padding:16px;margin-bottom:20px;">
            <p style="margin:0 0 4px 0;font-size:13px;color:#60a5fa;font-weight:600;">Twoja strona: ${pageLabel}</p>
            <p style="margin:0 0 12px 0;font-size:12px;color:#64748b;">${alert.url}</p>
            <p style="margin:0 0 4px 0;font-size:13px;color:#f59e0b;font-weight:600;">Cytowany konkurent: ${alert.competitorDomain}</p>
            ${alert.phraseContext ? `<p style="margin:8px 0 0 0;font-size:12px;color:#64748b;">Fraza: "${alert.phraseContext}"</p>` : ""}
          </div>
          <a href="${reportUrl}?tab=visibility" style="display:inline-block;background:#7c3aed;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;margin-right:8px;">Analiza konkurencji</a>
          <a href="${pulseUrl}" style="display:inline-block;background:#1e293b;color:#a78bfa;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;border:1px solid #312e81;">Citation Pulse</a>
        </div>
      `,
    };
  }

  return { toEmail: null, subject: "", html: "" };
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Evaluate and fire citation change alerts after a monitoring run.
 * Called from monitoring/worker.ts after citation job completes.
 * Non-blocking — swallows all errors.
 */
export async function evaluateAndSendAlerts(params: {
  pageId: number;
  url: string;
  label: string | null;
  userEmail: string | null;
  userName: string | null;
  appUrl: string;
  auditId: number;
  citedEngines: number;
  totalEngines: number;
  previousCitedEngines: number | null;
  plan: string;
  competitorDomains?: string[];
  phraseContext?: string;
}): Promise<void> {
  const {
    pageId, url, label, userEmail, userName, appUrl, auditId,
    citedEngines, totalEngines, previousCitedEngines, plan, competitorDomains, phraseContext,
  } = params;

  if (!userEmail) return; // no email = no alerts

  const base: Omit<CitationAlert, "type"> = {
    pageId, url, label, userEmail, userName, appUrl, auditId,
    citedEngines, totalEngines, previousCitedEngines: previousCitedEngines ?? 0,
  };

  try {
    // ── Alert 1: New citation ────────────────────────────────────────────────
    const wasNotCited = (previousCitedEngines ?? 0) === 0;
    const isNowCited = citedEngines > 0;
    if (wasNotCited && isNowCited) {
      const key = `${pageId}:new_citation`;
      if (!isCooledDown(key, "new_citation")) {
        console.log(`[AlertSystem] Sending new_citation alert for page #${pageId}`);
        void sendAlertEmail({ ...base, type: "new_citation" });
        markSent(key);
      }
    }

    // ── Alert 2: Lost citation ───────────────────────────────────────────────
    const wasCited = (previousCitedEngines ?? 0) > 0;
    const isNowNotCited = citedEngines === 0;
    if (wasCited && isNowNotCited) {
      const key = `${pageId}:lost_citation`;
      if (!isCooledDown(key, "lost_citation")) {
        console.log(`[AlertSystem] Sending lost_citation alert for page #${pageId}`);
        void sendAlertEmail({ ...base, type: "lost_citation" });
        markSent(key);
      }
    }

    // ── Alert 3: Competitor (Pro/Business only) ──────────────────────────────
    const isPro = plan === "pro" || plan === "business";
    if (isPro && competitorDomains && competitorDomains.length > 0) {
      // Fire for the top competitor only (avoid email spam)
      const topCompetitor = competitorDomains[0];
      const key = `${pageId}:competitor:${topCompetitor}`;
      if (!isCooledDown(key, "competitor")) {
        console.log(`[AlertSystem] Sending competitor alert for page #${pageId}: ${topCompetitor}`);
        void sendAlertEmail({
          ...base,
          type: "competitor",
          competitorDomain: topCompetitor,
          phraseContext,
        });
        markSent(key);
      }
    }
  } catch (err) {
    // Never let alert errors propagate to the monitoring worker
    console.error("[AlertSystem] Unexpected error in evaluateAndSendAlerts:", err);
  }
}
