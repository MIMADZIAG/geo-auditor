/**
 * Weekly Digest Email — Retention Engine
 *
 * Sends every Monday at 09:00 to users who have at least one monitored page.
 * Shows dual-metric trend: AI-Readiness Score delta + AI Visibility delta vs 7 days ago.
 *
 * Architecture:
 *   1. getWeeklyDigestData(userId) — computes deltas from score_snapshots + monitored_pages
 *   2. buildWeeklyDigestHtml(data) — pure HTML template (no external deps)
 *   3. sendWeeklyDigest(userId, toEmail, toName) — orchestrates 1+2 + Resend send
 *   4. runWeeklyDigestCron() — called by cron, iterates all eligible users
 */
import nodemailer from "nodemailer";
import { getDb } from "../db";
import {
  users, monitoredPages, scoreSnapshots, weeklyDigestLog,
} from "../../drizzle/schema";
import { eq, and, gte, desc } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WeeklyDigestData {
  userId: number;
  toEmail: string;
  toName: string | null;
  appUrl: string;
  weekStart: Date;
  // Score metrics
  avgScoreThisWeek: number | null;
  avgScorePrevWeek: number | null;
  scoreDelta: number | null;
  // Citation metrics
  citedEnginesThisWeek: number | null;
  citedEnginesPrevWeek: number | null;
  citationDelta: number | null;
  citationTotal: number;
  // Monitored pages context
  monitoredPagesCount: number;
  topPageUrl: string | null;
  topPageLabel: string | null;
  topPageScore: number | null;
  topPageCited: number | null;
}

// ─── Data computation ─────────────────────────────────────────────────────────

export async function getWeeklyDigestData(
  userId: number,
  appUrl: string
): Promise<WeeklyDigestData | null> {
  const db = await getDb();
  if (!db) return null;

  // Get user
  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = userRows[0];
  if (!user?.email) return null;

  // Get active monitored pages
  const pages = await db
    .select()
    .from(monitoredPages)
    .where(and(eq(monitoredPages.userId, userId), eq(monitoredPages.isActive, "yes")));
  if (pages.length === 0) return null;

  // Week boundaries
  const now = new Date();
  const weekStart = getMonday(now);
  const prevWeekStart = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
  const prevWeekEnd = weekStart;
  const twoWeeksAgo = new Date(weekStart.getTime() - 14 * 24 * 60 * 60 * 1000);

  // Collect snapshots for all monitored pages
  const pageIds = pages.map((p) => p.id);
  let allSnapshots: Array<{ overallScore: number | null; citedEnginesCount: number | null; totalEnginesChecked: number | null; recordedAt: Date; monitoredPageId: number }> = [];

  for (const pageId of pageIds) {
    const snaps = await db
      .select()
      .from(scoreSnapshots)
      .where(
        and(
          eq(scoreSnapshots.monitoredPageId, pageId),
          gte(scoreSnapshots.recordedAt, twoWeeksAgo)
        )
      )
      .orderBy(desc(scoreSnapshots.recordedAt))
      .limit(20);
    allSnapshots = allSnapshots.concat(snaps);
  }

  // Split into this week vs prev week
  const thisWeekSnaps = allSnapshots.filter((s) => s.recordedAt >= weekStart);
  const prevWeekSnaps = allSnapshots.filter(
    (s) => s.recordedAt >= prevWeekStart && s.recordedAt < prevWeekEnd
  );

  // Compute averages
  const avgScore = (snaps: typeof allSnapshots) => {
    const valid = snaps.filter((s) => s.overallScore != null);
    return valid.length > 0
      ? Math.round(valid.reduce((sum, s) => sum + (s.overallScore ?? 0), 0) / valid.length)
      : null;
  };
  const avgCited = (snaps: typeof allSnapshots) => {
    const valid = snaps.filter((s) => s.citedEnginesCount != null);
    return valid.length > 0
      ? Math.round((valid.reduce((sum, s) => sum + (s.citedEnginesCount ?? 0), 0) / valid.length) * 10) / 10
      : null;
  };

  // Use current monitored_pages data as "this week" fallback if no snapshots this week
  const avgScoreThisWeek =
    thisWeekSnaps.length > 0
      ? avgScore(thisWeekSnaps)
      : (() => {
          const withScore = pages.filter((p) => p.lastScore != null);
          return withScore.length > 0
            ? Math.round(withScore.reduce((sum, p) => sum + (p.lastScore ?? 0), 0) / withScore.length)
            : null;
        })();
  const avgScorePrevWeek = avgScore(prevWeekSnaps);
  const scoreDelta =
    avgScoreThisWeek != null && avgScorePrevWeek != null
      ? parseFloat((avgScoreThisWeek - avgScorePrevWeek).toFixed(1))
      : null;

  const citedEnginesThisWeek =
    thisWeekSnaps.length > 0
      ? avgCited(thisWeekSnaps)
      : (() => {
          const withCitation = pages.filter((p) => p.lastCitedEngines != null);
          return withCitation.length > 0
            ? Math.round((withCitation.reduce((sum, p) => sum + (p.lastCitedEngines ?? 0), 0) / withCitation.length) * 10) / 10
            : null;
        })();
  const citedEnginesPrevWeek = avgCited(prevWeekSnaps);
  const citationDelta =
    citedEnginesThisWeek != null && citedEnginesPrevWeek != null
      ? parseFloat((citedEnginesThisWeek - citedEnginesPrevWeek).toFixed(1))
      : null;

  const citationTotal = pages.find((p) => p.lastTotalEngines != null)?.lastTotalEngines ?? 4;

  // Top page: highest score with citation data
  const sortedPages = [...pages].sort((a, b) => (b.lastScore ?? 0) - (a.lastScore ?? 0));
  const topPage = sortedPages[0];

  return {
    userId,
    toEmail: user.email,
    toName: user.name,
    appUrl,
    weekStart,
    avgScoreThisWeek,
    avgScorePrevWeek,
    scoreDelta,
    citedEnginesThisWeek,
    citedEnginesPrevWeek,
    citationDelta,
    citationTotal,
    monitoredPagesCount: pages.length,
    topPageUrl: topPage?.url ?? null,
    topPageLabel: topPage?.label ?? null,
    topPageScore: topPage?.lastScore ?? null,
    topPageCited: topPage?.lastCitedEngines ?? null,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon
  const diff = (day === 0 ? -6 : 1 - day);
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function alreadySentThisWeek(userId: number, weekStart: Date): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db
    .select()
    .from(weeklyDigestLog)
    .where(
      and(
        eq(weeklyDigestLog.userId, userId),
        gte(weeklyDigestLog.weekStart, weekStart)
      )
    )
    .limit(1);
  return rows.length > 0;
}

async function logDigestSent(data: WeeklyDigestData): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(weeklyDigestLog).values({
    userId: data.userId,
    weekStart: data.weekStart,
    avgScoreThisWeek: data.avgScoreThisWeek ?? undefined,
    avgScorePrevWeek: data.avgScorePrevWeek ?? undefined,
    citedEnginesThisWeek: data.citedEnginesThisWeek ?? undefined,
    citedEnginesPrevWeek: data.citedEnginesPrevWeek ?? undefined,
    monitoredPagesCount: data.monitoredPagesCount,
  });
}

// ─── HTML Email Template ──────────────────────────────────────────────────────

function deltaArrow(delta: number | null): string {
  if (delta === null) return "";
  if (delta > 0) return "↑";
  if (delta < 0) return "↓";
  return "→";
}

function deltaColor(delta: number | null): string {
  if (delta === null || delta === 0) return "#64748b";
  return delta > 0 ? "#22c55e" : "#ef4444";
}

function scoreColor(score: number | null): string {
  if (score == null) return "#64748b";
  if (score >= 70) return "#22c55e";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

function citationColor(cited: number | null, total: number): string {
  if (cited == null) return "#64748b";
  if (cited === 0) return "#ef4444";
  if (cited >= total) return "#22c55e";
  return "#f59e0b";
}

function citationLabel(cited: number | null, total: number): string {
  if (cited == null) return "Brak danych";
  if (cited === 0) return "Niewidoczna";
  if (cited >= total) return "Pełna widoczność";
  return "Częściowa";
}

export function buildWeeklyDigestHtml(d: WeeklyDigestData): string {
  const name = d.toName?.split(" ")[0] ?? "Użytkowniku";
  const dashboardUrl = `${d.appUrl}/dashboard`;
  const weekLabel = d.weekStart.toLocaleDateString("pl-PL", { day: "numeric", month: "long", timeZone: "UTC" });

  const scoreClr = scoreColor(d.avgScoreThisWeek);
  const citClr = citationColor(d.citedEnginesThisWeek, d.citationTotal);
  const scoreDeltaClr = deltaColor(d.scoreDelta);
  const citDeltaClr = deltaColor(d.citationDelta);

  const scoreBlock = d.avgScoreThisWeek != null
    ? `<div style="font-size:40px;font-weight:800;color:${scoreClr};line-height:1;">${d.avgScoreThisWeek}</div>
       <div style="font-size:11px;color:#64748b;margin-top:4px;">/ 100 pkt</div>
       ${d.scoreDelta !== null ? `<div style="font-size:13px;font-weight:700;color:${scoreDeltaClr};margin-top:6px;">${deltaArrow(d.scoreDelta)} ${d.scoreDelta > 0 ? "+" : ""}${d.scoreDelta} pkt vs poprzedni tydz.</div>` : ""}`
    : `<div style="font-size:28px;font-weight:700;color:#475569;">—</div><div style="font-size:12px;color:#64748b;margin-top:4px;">Brak audytów w tym tygodniu</div>`;

  const citBlock = d.citedEnginesThisWeek != null
    ? `<div style="font-size:40px;font-weight:800;color:${citClr};line-height:1;">${d.citedEnginesThisWeek}/${d.citationTotal}</div>
       <div style="font-size:11px;color:#64748b;margin-top:4px;">${citationLabel(d.citedEnginesThisWeek, d.citationTotal)}</div>
       ${d.citationDelta !== null ? `<div style="font-size:13px;font-weight:700;color:${citDeltaClr};margin-top:6px;">${deltaArrow(d.citationDelta)} ${d.citationDelta > 0 ? "+" : ""}${d.citationDelta} silnik${Math.abs(d.citationDelta) === 1 ? "" : "i"} vs poprzedni tydz.</div>` : ""}`
    : `<div style="font-size:28px;font-weight:700;color:#475569;">—</div><div style="font-size:12px;color:#64748b;margin-top:4px;">Sprawdź widoczność AI</div>`;

  const topPageBlock = d.topPageUrl
    ? `<div style="background:#0f172a;border-radius:10px;padding:16px 20px;margin-bottom:20px;border:1px solid #1e3a5f;">
        <p style="margin:0 0 4px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Najlepsza strona</p>
        <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#e2e8f0;word-break:break-all;">${d.topPageLabel ?? d.topPageUrl}</p>
        <div style="display:flex;gap:16px;flex-wrap:wrap;">
          ${d.topPageScore != null ? `<span style="font-size:13px;color:${scoreColor(d.topPageScore)};font-weight:600;">AI Score: ${Math.round(d.topPageScore)}/100</span>` : ""}
          ${d.topPageCited != null ? `<span style="font-size:13px;color:${citationColor(d.topPageCited, d.citationTotal)};font-weight:600;">Widoczność AI: ${d.topPageCited}/${d.citationTotal}</span>` : ""}
        </div>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tygodniowy raport AI Search — GEO-Auditor</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;color:#e2e8f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="padding:0 0 24px 0;">
              <span style="font-size:20px;font-weight:700;color:#a78bfa;">GEO-Auditor</span>
              <span style="font-size:13px;color:#64748b;margin-left:8px;">Tygodniowy raport AI Search</span>
            </td>
          </tr>
          <!-- Main card -->
          <tr>
            <td style="background:#1e293b;border-radius:16px;padding:32px;border:1px solid #334155;">
              <!-- Greeting -->
              <p style="margin:0 0 4px;font-size:14px;color:#94a3b8;">${name},</p>
              <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#f1f5f9;">Twój raport tygodniowy</h1>
              <p style="margin:0 0 24px;font-size:13px;color:#64748b;">Tydzień od ${weekLabel} · ${d.monitoredPagesCount} monitorowan${d.monitoredPagesCount === 1 ? "a strona" : "e strony"}</p>

              <!-- Dual metric row -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td width="50%" style="padding-right:8px;">
                    <div style="background:#0f172a;border-radius:10px;padding:20px;text-align:center;border:1px solid #1e3a5f;">
                      <p style="margin:0 0 8px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">AI-Readiness Score</p>
                      ${scoreBlock}
                    </div>
                  </td>
                  <td width="50%" style="padding-left:8px;">
                    <div style="background:#0f172a;border-radius:10px;padding:20px;text-align:center;border:1px solid #1e3a5f;">
                      <p style="margin:0 0 8px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Widoczność AI Search</p>
                      ${citBlock}
                    </div>
                  </td>
                </tr>
              </table>

              ${topPageBlock}

              <!-- Insight / nudge -->
              <div style="background:#1a1040;border-radius:10px;padding:16px 20px;margin-bottom:24px;border:1px solid #3b1d8a;">
                <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#c4b5fd;">💡 Co możesz zrobić w tym tygodniu?</p>
                <p style="margin:0;font-size:13px;color:#a78bfa;line-height:1.6;">
                  ${d.citedEnginesThisWeek === 0
                    ? "Twoja strona nie jest jeszcze cytowana przez AI. Dodaj sekcję FAQ z odpowiedziami na pytania użytkowników — to najszybszy sposób na pojawienie się w AI Search."
                    : d.citedEnginesThisWeek != null && d.citedEnginesThisWeek < d.citationTotal
                    ? `Jesteś widoczny w ${d.citedEnginesThisWeek}/${d.citationTotal} silnikach AI. Sprawdź, które silniki Cię pomijają i zoptymalizuj strukturę treści pod ich wymagania.`
                    : d.avgScoreThisWeek != null && d.avgScoreThisWeek < 70
                    ? "Twój wynik AI-Readiness jest poniżej 70. Uruchom nowy audyt, aby zobaczyć aktualne rekomendacje i poprawić widoczność."
                    : "Świetna robota! Utrzymuj regularny monitoring i reaguj na zmiany algorytmów AI Search, aby zachować przewagę."
                  }
                </p>
              </div>

              <!-- CTA -->
              <div style="text-align:center;">
                <a href="${dashboardUrl}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:13px 28px;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.01em;">
                  Otwórz dashboard →
                </a>
              </div>

              <!-- Footer -->
              <p style="font-size:11px;color:#475569;margin:24px 0 0;text-align:center;line-height:1.6;">
                GEO-Auditor monitoruje Twoje strony automatycznie co tydzień.<br/>
                <a href="${dashboardUrl}" style="color:#7c3aed;text-decoration:none;">Zarządzaj monitoringiem</a>
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

// ─── Send single digest ───────────────────────────────────────────────────────

export async function sendWeeklyDigest(data: WeeklyDigestData): Promise<boolean> {
  const html = buildWeeklyDigestHtml(data);
  const subject = (() => {
    if (data.scoreDelta != null && data.scoreDelta > 0) {
      return `📈 Twój AI Score wzrósł o ${data.scoreDelta} pkt — raport tygodniowy`;
    }
    if (data.citedEnginesThisWeek != null && data.citedEnginesThisWeek > 0) {
      return `🔍 Widoczność AI: ${data.citedEnginesThisWeek}/${data.citationTotal} silników — raport tygodniowy`;
    }
    return `📊 Twój tygodniowy raport AI Search jest gotowy`;
  })();

  const resendApiKey = process.env.RESEND_API_KEY;

  if (resendApiKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendApiKey}` },
        body: JSON.stringify({
          from: "GEO-Auditor <noreply@geo-auditor.app>",
          to: [data.toEmail],
          subject,
          html,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        console.error(`[WeeklyDigest] Resend error ${res.status}: ${body}`);
        return false;
      }
      console.log(`[WeeklyDigest] Sent to ${data.toEmail} (userId=${data.userId})`);
      return true;
    } catch (err) {
      console.error("[WeeklyDigest] Resend fetch error:", err);
      return false;
    }
  }

  // SMTP fallback
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (smtpHost && smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(process.env.SMTP_PORT ?? "587"),
        secure: process.env.SMTP_SECURE === "true",
        auth: { user: smtpUser, pass: smtpPass },
      });
      await transporter.sendMail({ from: smtpUser, to: data.toEmail, subject, html });
      return true;
    } catch (err) {
      console.error("[WeeklyDigest] SMTP error:", err);
      return false;
    }
  }

  // Dev mode
  console.log(
    `[WeeklyDigest] No email provider configured. Would send to ${data.toEmail}: ` +
    `Score ${data.avgScoreThisWeek ?? "N/A"} (delta ${data.scoreDelta ?? "N/A"}), ` +
    `Citation ${data.citedEnginesThisWeek ?? "N/A"}/${data.citationTotal}`
  );
  return true;
}

// ─── Cron runner ─────────────────────────────────────────────────────────────

export async function runWeeklyDigestCron(appUrl: string): Promise<{ sent: number; skipped: number; errors: number }> {
  const db = await getDb();
  if (!db) return { sent: 0, skipped: 0, errors: 0 };

  console.log("[WeeklyDigest] Starting weekly digest cron...");

  // Get all users who have at least one active monitored page
  const eligibleUsers = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .innerJoin(monitoredPages, and(
      eq(monitoredPages.userId, users.id),
      eq(monitoredPages.isActive, "yes")
    ))
    .groupBy(users.id);

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const u of eligibleUsers) {
    if (!u.email) { skipped++; continue; }

    try {
      const weekStart = getMonday(new Date());
      const alreadySent = await alreadySentThisWeek(u.id, weekStart);
      if (alreadySent) { skipped++; continue; }

      const data = await getWeeklyDigestData(u.id, appUrl);
      if (!data) { skipped++; continue; }

      const ok = await sendWeeklyDigest(data);
      if (ok) {
        await logDigestSent(data);
        sent++;
      } else {
        errors++;
      }
    } catch (err) {
      console.error(`[WeeklyDigest] Error for userId=${u.id}:`, err);
      errors++;
    }
  }

  console.log(`[WeeklyDigest] Done: sent=${sent}, skipped=${skipped}, errors=${errors}`);
  return { sent, skipped, errors };
}
