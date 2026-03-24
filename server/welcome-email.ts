/**
 * Welcome email sent to new users on first sign-in.
 * Uses Resend API (same pattern as monitoring/email.ts).
 * Non-fatal: errors are logged but never throw.
 */

const FROM = process.env.RESEND_FROM ?? process.env.SMTP_FROM ?? "GEO-Auditor <noreply@geo-auditor.app>";

function buildWelcomeHtml(name: string): string {
  const displayName = name ? name.split(" ")[0] : "there";
  return `<!DOCTYPE html>
<html lang="pl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:Inter,Arial,sans-serif;color:#e2e8f0">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:12px;overflow:hidden;max-width:600px">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 40px;text-align:center">
          <h1 style="margin:0;font-size:24px;font-weight:700;color:#fff;letter-spacing:-0.5px">
            🤖 GEO-Auditor
          </h1>
          <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.8)">AI Search Visibility Auditor</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:40px">
          <h2 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#f1f5f9">
            Witaj, ${displayName}! 👋
          </h2>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#94a3b8">
            Cieszę się, że dołączyłeś do GEO-Auditor — narzędzia, które pomaga Twojej stronie
            być lepiej widoczną w odpowiedziach ChatGPT, Perplexity i Google AI Overviews.
          </p>
          <!-- What you can do -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:8px;padding:20px;margin-bottom:24px">
            <tr><td>
              <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#6366f1;text-transform:uppercase;letter-spacing:0.5px">Co możesz zrobić teraz</p>
              <table cellpadding="0" cellspacing="0">
                <tr><td style="padding:4px 0;font-size:14px;color:#cbd5e1">✅ &nbsp;Uruchom audyt dowolnej podstrony (URL)</td></tr>
                <tr><td style="padding:4px 0;font-size:14px;color:#cbd5e1">📊 &nbsp;Sprawdź AI Visibility Score (0–100)</td></tr>
                <tr><td style="padding:4px 0;font-size:14px;color:#cbd5e1">🔍 &nbsp;Dodaj stronę do monitoringu (1 slot free)</td></tr>
                <tr><td style="padding:4px 0;font-size:14px;color:#cbd5e1">📤 &nbsp;Udostępnij raport klientom lub teamowi</td></tr>
              </table>
            </td></tr>
          </table>
          <!-- CTA -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px">
            <tr><td align="center">
              <a href="https://geoauditor-2tppvwaq.manus.space" 
                 style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600">
                Uruchom pierwszy audyt →
              </a>
            </td></tr>
          </table>
          <!-- Tip -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border-left:3px solid #6366f1;padding-left:16px;margin-bottom:24px">
            <tr><td>
              <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#6366f1">💡 Pro tip</p>
              <p style="margin:0;font-size:14px;color:#94a3b8;line-height:1.5">
                Zacznij od strony produktowej lub artykułu, który chcesz pozycjonować w AI Search.
                Wynik poniżej 60/100 oznacza duże pole do poprawy.
              </p>
            </td></tr>
          </table>
          <p style="margin:0;font-size:13px;color:#475569;line-height:1.5">
            Masz pytania? Odpowiedz na tego maila — czytam każdą wiadomość.<br>
            <strong style="color:#94a3b8">Mikołaj, GEO-Auditor</strong>
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 40px;border-top:1px solid #334155;text-align:center">
          <p style="margin:0;font-size:12px;color:#475569">
            GEO-Auditor · AI Search Visibility · 
            <a href="https://geoauditor-2tppvwaq.manus.space" style="color:#6366f1;text-decoration:none">geoauditor.app</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendWelcomeEmail(email: string, name: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !email) {
    console.log(`[WelcomeEmail] No Resend key or email — skipping welcome email for ${email}`);
    return;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [email],
        subject: "Witaj w GEO-Auditor 🤖 — zacznij optymalizować widoczność w AI Search",
        html: buildWelcomeHtml(name),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[WelcomeEmail] Resend error ${res.status}: ${detail}`);
      return;
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    console.log(`[WelcomeEmail] Sent to ${email} — id=${data.id}`);
  } catch (err) {
    // Non-fatal — never block the OAuth callback
    console.error("[WelcomeEmail] Exception:", err instanceof Error ? err.message : err);
  }
}
