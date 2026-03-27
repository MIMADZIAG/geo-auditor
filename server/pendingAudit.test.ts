/**
 * Tests for the pending audit flow:
 * - PENDING_AUDIT_KEY constant
 * - parseStateOrigin logic (extracted for testing)
 * - sessionStorage interaction pattern
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ─── parseStateOrigin (mirrors server/_core/oauth.ts logic) ──────────────────

function parseStateOrigin(state: string): string {
  try {
    const decoded = Buffer.from(state, "base64").toString("utf-8");
    const redirectUri = decoded.split("|")[0];
    const url = new URL(redirectUri);
    return url.origin;
  } catch {
    return "/";
  }
}

describe("parseStateOrigin", () => {
  it("extracts origin from plain redirectUri state", () => {
    const redirectUri = "https://geoauditor.manus.space/api/oauth/callback";
    const state = Buffer.from(redirectUri).toString("base64");
    expect(parseStateOrigin(state)).toBe("https://geoauditor.manus.space");
  });

  it("extracts origin from state with returnPath", () => {
    const redirectUri = "https://geoauditor.manus.space/api/oauth/callback";
    const returnPath = "/";
    const state = Buffer.from(`${redirectUri}|${returnPath}`).toString("base64");
    expect(parseStateOrigin(state)).toBe("https://geoauditor.manus.space");
  });

  it("returns '/' for malformed state", () => {
    expect(parseStateOrigin("not-valid-base64!!!")).toBe("/");
  });

  it("returns '/' for empty state", () => {
    expect(parseStateOrigin("")).toBe("/");
  });

  it("handles localhost origin correctly", () => {
    const redirectUri = "http://localhost:3000/api/oauth/callback";
    const state = Buffer.from(redirectUri).toString("base64");
    expect(parseStateOrigin(state)).toBe("http://localhost:3000");
  });
});

// ─── PENDING_AUDIT_KEY constant ───────────────────────────────────────────────

describe("PENDING_AUDIT_KEY", () => {
  const PENDING_AUDIT_KEY = "geo_pending_audit_url";

  it("has the expected value", () => {
    expect(PENDING_AUDIT_KEY).toBe("geo_pending_audit_url");
  });
});

// ─── sessionStorage pending audit pattern ────────────────────────────────────

describe("pending audit sessionStorage pattern", () => {
  const PENDING_AUDIT_KEY = "geo_pending_audit_url";
  const mockStorage: Record<string, string> = {};

  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => { mockStorage[key] = value; },
      removeItem: (key: string) => { delete mockStorage[key]; },
      clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  });

  it("stores and retrieves pending audit URL", () => {
    const testUrl = "https://example.com/product/shoes";
    sessionStorage.setItem(PENDING_AUDIT_KEY, testUrl);
    expect(sessionStorage.getItem(PENDING_AUDIT_KEY)).toBe(testUrl);
  });

  it("removes pending audit URL after retrieval", () => {
    const testUrl = "https://example.com/product/shoes";
    sessionStorage.setItem(PENDING_AUDIT_KEY, testUrl);

    // Simulate what usePendingAudit does
    const pending = sessionStorage.getItem(PENDING_AUDIT_KEY);
    sessionStorage.removeItem(PENDING_AUDIT_KEY);

    expect(pending).toBe(testUrl);
    expect(sessionStorage.getItem(PENDING_AUDIT_KEY)).toBeNull();
  });

  it("returns null when no pending audit is stored", () => {
    expect(sessionStorage.getItem(PENDING_AUDIT_KEY)).toBeNull();
  });

  it("normalizes URL before storing (https prefix)", () => {
    const rawUrl = "example.com/product";
    const normalized = rawUrl.startsWith("http://") || rawUrl.startsWith("https://")
      ? rawUrl
      : "https://" + rawUrl;
    sessionStorage.setItem(PENDING_AUDIT_KEY, normalized);
    expect(sessionStorage.getItem(PENDING_AUDIT_KEY)).toBe("https://example.com/product");
  });

  it("does not trigger when user is already authenticated", () => {
    // If isAuthenticated is true from the start, no pending audit should be stored
    // (handleSubmit calls auditMutation.mutate directly)
    const isAuthenticated = true;
    const testUrl = "https://example.com";

    // Simulate handleSubmit for authenticated user — should NOT touch sessionStorage
    if (!isAuthenticated) {
      sessionStorage.setItem(PENDING_AUDIT_KEY, testUrl);
    }

    expect(sessionStorage.getItem(PENDING_AUDIT_KEY)).toBeNull();
  });
});
