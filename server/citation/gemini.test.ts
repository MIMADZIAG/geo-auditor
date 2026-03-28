/**
 * Unit tests for Gemini citation module:
 * 1. extractGeminiCitedUrls — redirect URL resolution via chunk.web.title
 * 2. callGeminiModel fallback cascade — 429 triggers next model, other errors bail out
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Inline the pure helper for testing (no side effects) ────────────────────
function extractGeminiCitedUrls(
  groundingChunks: Array<{ web?: { uri?: string; title?: string } }>
): string[] {
  const allCitedUrls: string[] = [];
  for (const chunk of groundingChunks) {
    const uri = chunk.web?.uri ?? "";
    const title = chunk.web?.title ?? "";
    const isRedirect =
      uri.includes("grounding-api-redirect") || uri.includes("vertexaisearch");
    if (!isRedirect && uri.startsWith("http")) {
      const clean = uri.split("#")[0].replace(/\/$/, "");
      if (!allCitedUrls.includes(clean)) allCitedUrls.push(clean);
    } else if (title) {
      const rawHost = title
        .split(" ")[0]
        .replace(/[^a-zA-Z0-9.-]/g, "")
        .toLowerCase();
      if (rawHost && rawHost.includes(".")) {
        const canonical = `https://${rawHost}`;
        if (!allCitedUrls.includes(canonical)) allCitedUrls.push(canonical);
      }
    }
  }
  return allCitedUrls;
}

// ─── Gemini fallback cascade (pure logic, fetch mocked) ──────────────────────
async function callGeminiModelMockable(
  model: string,
  query: string,
  apiKey: string,
  fetchFn: typeof fetch
): Promise<{ ok: true; data: unknown } | { ok: false; status: number; body: string }> {
  const response = await fetchFn(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: query }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
      }),
    }
  );
  if (!response.ok) {
    const body = await response.text();
    return { ok: false, status: response.status, body };
  }
  return { ok: true, data: await response.json() };
}

async function checkGeminiWithFetch(
  query: string,
  targetUrl: string,
  round: number,
  fetchFn: typeof fetch
): Promise<{ isCited: string; allCitedUrls: string[] }> {
  const apiKey = "test-key";
  const GEMINI_MODELS = ["gemini-2.5-flash-lite", "gemini-flash-lite-latest"];
  let data: unknown = null;
  for (const model of GEMINI_MODELS) {
    const result = await callGeminiModelMockable(model, query, apiKey, fetchFn);
    if (result.ok) {
      data = result.data;
      break;
    }
    if (result.status === 429) continue;
    return { isCited: "no", allCitedUrls: [] };
  }
  if (!data) return { isCited: "no", allCitedUrls: [] };

  const candidate = (data as { candidates?: unknown[] })?.candidates?.[0] as
    | Record<string, unknown>
    | undefined;
  const groundingChunks: Array<{ web?: { uri?: string; title?: string } }> =
    (
      candidate?.groundingMetadata as {
        groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
      }
    )?.groundingChunks ?? [];
  const allCitedUrls = extractGeminiCitedUrls(groundingChunks);
  const targetDomain = new URL(targetUrl).hostname.replace("www.", "");
  const domainCitation = allCitedUrls.find((u) => {
    try {
      return new URL(u).hostname.replace("www.", "") === targetDomain;
    } catch {
      return false;
    }
  });
  if (domainCitation) return { isCited: "domain", allCitedUrls };
  return { isCited: "no", allCitedUrls };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("extractGeminiCitedUrls", () => {
  it("extracts real URLs when not redirect wrappers", () => {
    const chunks = [
      { web: { uri: "https://ocar.pl/ranking", title: "ocar.pl" } },
      { web: { uri: "https://rankomat.pl/oc", title: "rankomat.pl" } },
    ];
    const urls = extractGeminiCitedUrls(chunks);
    expect(urls).toContain("https://ocar.pl/ranking");
    expect(urls).toContain("https://rankomat.pl/oc");
  });

  it("falls back to title when URI is a vertexaisearch redirect", () => {
    const chunks = [
      {
        web: {
          uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQH1lkcPaqoUOQjs6==",
          title: "ocar.pl",
        },
      },
      {
        web: {
          uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHFPziLterCg9JII==",
          title: "rankomat.pl - OC porównanie",
        },
      },
    ];
    const urls = extractGeminiCitedUrls(chunks);
    expect(urls).toContain("https://ocar.pl");
    expect(urls).toContain("https://rankomat.pl");
    // Must NOT contain the redirect wrapper itself
    expect(urls.some((u) => u.includes("vertexaisearch"))).toBe(false);
  });

  it("deduplicates URLs", () => {
    const chunks = [
      { web: { uri: "https://ocar.pl/page1", title: "ocar.pl" } },
      { web: { uri: "https://ocar.pl/page1", title: "ocar.pl" } },
    ];
    const urls = extractGeminiCitedUrls(chunks);
    expect(urls.filter((u) => u === "https://ocar.pl/page1")).toHaveLength(1);
  });

  it("strips trailing slashes from real URLs", () => {
    const chunks = [{ web: { uri: "https://ocar.pl/", title: "ocar.pl" } }];
    const urls = extractGeminiCitedUrls(chunks);
    expect(urls).toContain("https://ocar.pl");
    expect(urls).not.toContain("https://ocar.pl/");
  });

  it("ignores chunks with no uri and no title", () => {
    const chunks = [{ web: {} }, { web: { uri: "", title: "" } }];
    const urls = extractGeminiCitedUrls(chunks);
    expect(urls).toHaveLength(0);
  });

  it("ignores titles that are not valid hostnames", () => {
    const chunks = [
      {
        web: {
          uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/X==",
          title: "Najlepsze ubezpieczenia OC w Polsce",
        },
      },
    ];
    // "Najlepsze" has no dot → should be ignored
    const urls = extractGeminiCitedUrls(chunks);
    expect(urls).toHaveLength(0);
  });
});

describe("Gemini model fallback cascade", () => {
  it("uses primary model when it returns 200", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            groundingMetadata: {
              groundingChunks: [
                {
                  web: {
                    uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/X==",
                    title: "punkta.pl",
                  },
                },
              ],
            },
            content: { parts: [{ text: "Punkta.pl is a great tool." }] },
          },
        ],
      }),
    } as unknown as Response);

    const result = await checkGeminiWithFetch(
      "najtańsze OC ranking",
      "https://punkta.pl/akademia/ranking/najtansze-oc/",
      1,
      mockFetch as unknown as typeof fetch
    );

    expect(result.isCited).toBe("domain");
    expect(result.allCitedUrls).toContain("https://punkta.pl");
    // Only called once (primary model succeeded)
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect((mockFetch.mock.calls[0][0] as string).includes("gemini-2.5-flash-lite")).toBe(true);
  });

  it("falls back to secondary model on 429 from primary", async () => {
    const mockFetch = vi
      .fn()
      // First call: primary model → 429
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: { code: 429, message: "quota exceeded" } }),
      } as unknown as Response)
      // Second call: fallback model → 200
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              groundingMetadata: {
                groundingChunks: [
                  {
                    web: {
                      uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/X==",
                      title: "punkta.pl",
                    },
                  },
                ],
              },
              content: { parts: [{ text: "Punkta.pl is cited." }] },
            },
          ],
        }),
      } as unknown as Response);

    const result = await checkGeminiWithFetch(
      "najtańsze OC ranking",
      "https://punkta.pl/akademia/ranking/najtansze-oc/",
      1,
      mockFetch as unknown as typeof fetch
    );

    expect(result.isCited).toBe("domain");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // Second call must use fallback model
    expect((mockFetch.mock.calls[1][0] as string).includes("gemini-flash-lite-latest")).toBe(true);
  });

  it("returns isCited=no when all models are quota exhausted (429)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => JSON.stringify({ error: { code: 429, message: "quota exceeded" } }),
    } as unknown as Response);

    const result = await checkGeminiWithFetch(
      "test query",
      "https://example.com/page",
      1,
      mockFetch as unknown as typeof fetch
    );

    expect(result.isCited).toBe("no");
    expect(result.allCitedUrls).toHaveLength(0);
    expect(mockFetch).toHaveBeenCalledTimes(2); // tried both models
  });

  it("bails out immediately on non-429 error (e.g. 403)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ error: { code: 403, message: "forbidden" } }),
    } as unknown as Response);

    const result = await checkGeminiWithFetch(
      "test query",
      "https://example.com/page",
      1,
      mockFetch as unknown as typeof fetch
    );

    expect(result.isCited).toBe("no");
    // Must NOT retry on non-429 errors
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
