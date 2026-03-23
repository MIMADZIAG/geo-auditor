import { describe, it, expect } from "vitest";

/**
 * Resend API key validation test.
 *
 * The key re_XxHqoAA1_... is a restricted (send-only) key.
 * It returns 401 on GET endpoints (domains, emails list) but accepts POST /emails.
 * We validate by sending a test email to a Resend test address — any non-401 response
 * confirms the key is valid and accepted.
 */
describe("Resend API key", () => {
  it("RESEND_API_KEY is set and starts with re_", () => {
    const key = process.env.RESEND_API_KEY;
    expect(key, "RESEND_API_KEY must be set in environment").toBeTruthy();
    expect(key!.startsWith("re_"), "RESEND_API_KEY must start with re_").toBe(true);
    expect(key!.length, "RESEND_API_KEY must be at least 20 chars").toBeGreaterThan(20);
  });

  it("RESEND_API_KEY is accepted by Resend send endpoint (not 401)", async () => {
    const key = process.env.RESEND_API_KEY;
    if (!key) return;

    // POST /emails — restricted keys can send but not list.
    // Any response other than 401 means the key is valid.
    // Expected: 422 (validation error — domain not verified in test) or 200/201.
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "onboarding@resend.dev", // Resend's built-in test sender
        to: ["delivered@resend.dev"],  // Resend's built-in test recipient
        subject: "GEO-Auditor key validation test",
        html: "<p>Key validation test — ignore this email.</p>",
      }),
    });

    const body = await res.json() as Record<string, unknown>;
    console.log(`[ResendTest] status=${res.status}, id=${body.id ?? "N/A"}, name=${body.name ?? "N/A"}`);

    // 401 = key invalid/revoked, anything else = key accepted
    expect(res.status, `Resend rejected the key with 401: ${JSON.stringify(body)}`).not.toBe(401);
  });
});
