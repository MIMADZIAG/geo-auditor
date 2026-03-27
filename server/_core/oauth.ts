import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { sendWelcomeEmail } from "../welcome-email";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Parse the OAuth state payload.
 * Format (base64-encoded): "<redirectUri>" or "<redirectUri>|<returnPath>"
 * Returns the frontend origin for the post-login redirect.
 */
function parseStateOrigin(state: string): string {
  try {
    const decoded = Buffer.from(state, "base64").toString("utf-8");
    // The redirectUri is always the first segment (before optional "|")
    const redirectUri = decoded.split("|")[0];
    const url = new URL(redirectUri);
    return url.origin;
  } catch {
    return "/";
  }
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      const { isNew } = await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      // Send welcome email to brand-new users (non-blocking, best-effort)
      if (isNew && userInfo.email) {
        sendWelcomeEmail(userInfo.email, userInfo.name ?? "").catch(() => {});
      }

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // Redirect to the frontend origin (always "/") — the pending audit URL
      // is stored in sessionStorage client-side and handled by usePendingAudit hook.
      const origin = parseStateOrigin(state);
      res.redirect(302, `${origin}/`);
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
