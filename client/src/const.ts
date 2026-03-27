export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/** Key used in sessionStorage to persist a pending audit URL across OAuth redirect */
export const PENDING_AUDIT_KEY = "geo_pending_audit_url";

/**
 * Generate login URL at runtime so redirect URI reflects the current origin.
 * Optionally encode a returnPath in the OAuth state so the callback can
 * redirect back to the right page after authentication.
 *
 * The state payload is: base64(redirectUri + "|" + returnPath)
 * The server only uses the redirectUri portion; the returnPath is handled
 * client-side via sessionStorage (more reliable across OAuth providers).
 */
export const getLoginUrl = (returnPath?: string) => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;

  // Encode origin + optional returnPath so the server callback can redirect correctly
  const statePayload = returnPath
    ? btoa(`${redirectUri}|${returnPath}`)
    : btoa(redirectUri);

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", statePayload);
  url.searchParams.set("type", "signIn");

  return url.toString();
};
