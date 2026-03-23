/**
 * Monitoring Email Notifications
 *
 * Priority order for sending emails:
 * 1. Resend API (RESEND_API_KEY) — simplest, no SMTP config needed, 3000 free/month
 * 2. SMTP via Nodemailer (SMTP_HOST + SMTP_USER + SMTP_PASS) — any provider
 * 3. Dev mode fallback — logs to console when neither is configured
 *
 * Architecture decision: Resend is preferred because it requires only one env var
 * and works reliably in serverless/container environments without SMTP firewall issues.
 */

import nodemailer from "nodemailer";

export interface MonitoringEmailPayload {
  toEmail: string;
  toName: string | null;
  url: string;
  label: string | null;
  overallScore: number;
  scoreDelta: number | null;
  auditId: number;
  appUrl: string;
}

// ─── Score helpers ────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#f59e0b";
  return "#ef4444";
}

function scoreTier(score: number): string {
  if (score >= 80) return "Dobry";
  if (score >= 60) return "Wymaga poprawy";
  return "Krytyczny";
}

function deltaText(delta: number | null): string {
  if (delta === null) return "";
  if (delta > 0) return `+${delta.toFixed(1)} pkt wzrost`;
  if (delta < 0) return `${delta.toFixed(1)} pkt spadek`;
  return "Bez zmian";
}

function deltaColor(delta: number | null): string {
  if (delta === null || delta === 0) return "#6b7280";
  return delta > 0 ? "#22c55e" : "#ef4444";
}

// ─── HTML Template ────────────────────────────────────────────────────────────

function buildHtmlEmail(p: MonitoringEmailPayload): string {
  const scoreClr = scoreColor(p.overallScore);
  const tier = scoreTier(p.overallScore);
  const delta = deltaText(p.scoreDelta);
  const deltaClr = deltaColor(p.scoreDelta);
  const pageLabel = p.label ?? p.url;
  const reportUrl = `${p.appUrl}/report/${p.auditId}`;
  const dashboardUrl = `${p.appUrl}/dashboard`;
  const name = p.toName ?? "Czesc";

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Raport monitoringu - GEO-Auditor</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;color:#e2e8f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="padding:0 0 24px 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size:20px;font-weight:700;color:#a78bfa;">GEO-Auditor</span>
                    <span style="font-size:13px;color:#64748b;margin-left:8px;">Monitoring AI Search</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main card -->
          <tr>
            <td style="background:#1e293b;border-radius:16px;padding:32px;border:1px solid #334155;">

              <!-- Greeting -->
              <p style="margin:0 0 8px 0;font-size:14px;color:#94a3b8;">${name},</p>
              <h1 style="margin:0 0 4px 0;font-size:22px;font-weight:700;color:#f1f5f9;">
                Raport monitoringu gotowy
              </h1>
              <p style="margin:0 0 24px 0;font-size:14px;color:#64748b;">
                Automatyczny audyt AI Search dla Twojej strony zostal zakonczony.
              </p>

              <!-- Page info -->
              <div style="background:#0f172a;border-radius:10px;padding:16px 20px;margin-bottom:24px;border:1px solid #1e3a5f;">
                <p style="margin:0 0 4px 0;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Monitorowana strona</p>
                <p style="margin:0;font-size:15px;font-weight:600;color:#e2e8f0;word-break:break-all;">${pageLabel}</p>
                ${p.label ? `<p style="margin:4px 0 0 0;font-size:12px;color:#64748b;word-break:break-all;">${p.url}</p>` : ""}
              </div>

              <!-- Score row -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td width="50%" style="padding-right:8px;">
                    <div style="background:#0f172a;border-radius:10px;padding:20px;text-align:center;border:1px solid #1e3a5f;">
                      <p style="margin:0 0 4px 0;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Wynik AI-Readiness</p>
                      <p style="margin:0;font-size:40px;font-weight:800;color:${scoreClr};">${Math.round(p.overallScore)}</p>
                      <p style="margin:4px 0 0 0;font-size:12px;color:${scoreClr};">${tier}</p>
                    </div>
                  </td>
                  <td width="50%" style="padding-left:8px;">
                    <div style="background:#0f172a;border-radius:10px;padding:20px;text-align:center;border:1px solid #1e3a5f;">
                      <p style="margin:0 0 4px 0;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Zmiana vs poprzedni</p>
                      <p style="margin:0;font-size:28px;font-weight:800;color:${deltaClr};">
                        ${p.scoreDelta !== null ? (p.scoreDelta >= 0 ? "+" : "") + p.scoreDelta.toFixed(1) : ""}
                      </p>
                      <p style="margin:4px 0 0 0;font-size:12px;color:${deltaClr};">${delta || "Pierwszy audyt"}</p>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- CTA buttons -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="padding-right:8px;" width="50%">
                    <a href="${reportUrl}" style="display:block;background:#7c3aed;color:#fff;text-decoration:none;text-align:center;padding:14px 20px;border-radius:10px;font-size:14px;font-weight:600;">
                      Zobacz pelny raport
                    </a>
                  </td>
                  <td style="padding-left:8px;" width="50%">
                    <a href="${dashboardUrl}" style="display:block;background:#1e293b;color:#a78bfa;text-decoration:none;text-align:center;padding:14px 20px;border-radius:10px;font-size:14px;font-weight:600;border:1px solid #334155;">
                      Przejdz do panelu
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Info note -->
              <p style="margin:0;font-size:12px;color:#475569;text-align:center;line-height:1.6;">
                Ten raport zostal wygenerowany automatycznie przez GEO-Auditor.<br/>
                Mozesz zmienic czestotliwosc monitoringu w ustawieniach panelu.
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 0 0 0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#334155;">
                GEO-Auditor - AI Search Visibility Platform
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Resend API sender ────────────────────────────────────────────────────────

async function sendViaResend(
  payload: MonitoringEmailPayload,
  subject: string,
  html: string
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const from = process.env.RESEND_FROM ?? process.env.SMTP_FROM ?? "GEO-Auditor <noreply@geo-auditor.app>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [payload.toEmail],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[MonitoringEmail] Resend error ${res.status}: ${detail}`);
      return false;
    }

    const data = await res.json().catch(() => ({})) as { id?: string };
    console.log(`[MonitoringEmail] Resend OK — id=${data.id}, to=${payload.toEmail}, audit=#${payload.auditId}`);
    return true;
  } catch (err) {
    console.error("[MonitoringEmail] Resend exception:", err);
    return false;
  }
}

// ─── SMTP sender ──────────────────────────────────────────────────────────────

async function sendViaSmtp(
  payload: MonitoringEmailPayload,
  subject: string,
  html: string
): Promise<boolean> {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM ?? "GEO-Auditor <noreply@geo-auditor.app>";

  if (!smtpHost || !smtpUser || !smtpPass) return false;

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: smtpFrom,
      to: payload.toEmail,
      subject,
      html,
    });

    console.log(`[MonitoringEmail] SMTP OK — to=${payload.toEmail}, audit=#${payload.auditId}`);
    return true;
  } catch (err) {
    console.error("[MonitoringEmail] SMTP exception:", err);
    return false;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Send a monitoring audit result email to the user.
 * Tries Resend first, then SMTP, then falls back to console log.
 * Returns true on success, false on failure (non-throwing).
 */
export async function sendMonitoringEmail(payload: MonitoringEmailPayload): Promise<boolean> {
  const subject = `Raport monitoringu: ${payload.label ?? payload.url} - wynik ${Math.round(payload.overallScore)}/100`;
  const html = buildHtmlEmail(payload);

  // 1. Try Resend API
  if (process.env.RESEND_API_KEY) {
    return sendViaResend(payload, subject, html);
  }

  // 2. Try SMTP
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return sendViaSmtp(payload, subject, html);
  }

  // 3. Dev mode fallback
  console.log(
    `[MonitoringEmail] No email provider configured (set RESEND_API_KEY or SMTP_HOST+SMTP_USER+SMTP_PASS).`,
    `Would send to ${payload.toEmail}: Score ${payload.overallScore}, delta ${payload.scoreDelta ?? "N/A"}, audit #${payload.auditId}`
  );
  return true; // treat as success in dev
}
