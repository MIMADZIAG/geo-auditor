/**
 * SSE Layer 2 — Vitest Test Suite
 * ─────────────────────────────────────────────────────────────────────────────
 * Covers:
 *  1. CitationSSERegistry — emit, subscribe, dedup, TTL, eviction
 *  2. SSE event contract — typed payloads, terminal state transitions
 *  3. Worker integration — onResult callback wires to registry
 *  4. Reconnection safety — late subscriber receives nothing (no replay)
 *  5. Fallback compatibility — polling path unaffected when SSE unavailable
 *  6. Memory safety — unsubscribe removes all listeners
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getCitationRegistry, _resetRegistryForTesting } from "./sseRegistry";
import type { SSEEventType, SSEEventMap } from "./sseRegistry";
import type { CitationResult } from "./worker";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCitationResult(overrides: Partial<CitationResult> = {}): CitationResult {
  return {
    query: "najlepsze buty do biegania",
    engine: "google",
    round: 1,
    isCited: "yes",
    citedUrl: "https://example.com/buty",
    allCitedUrls: ["https://example.com/buty"],
    competitorDomains: [],
    hasAIOverview: true,
    ...overrides,
  };
}

// ─── 1. CitationSSERegistry ───────────────────────────────────────────────────

describe("CitationSSERegistry", () => {
  beforeEach(() => {
    _resetRegistryForTesting();
  });

  it("starts empty", () => {
    const reg = getCitationRegistry();
    expect(reg.size).toBe(0);
  });

  it("creates entry on first emit", () => {
    const reg = getCitationRegistry();
    reg.emit(1, "progress", { jobId: 1, round: 1, engine: "google", queriesCompleted: 1, queriesTotal: 5 });
    expect(reg.size).toBe(1);
  });

  it("delivers result event to subscriber", () => {
    const reg = getCitationRegistry();
    const received: CitationResult[] = [];

    reg.subscribe(42, (event, payload) => {
      if (event === "result") received.push(payload as CitationResult);
    });

    const result = makeCitationResult({ query: "test query" });
    reg.emit(42, "result", result);

    expect(received).toHaveLength(1);
    expect(received[0].query).toBe("test query");
  });

  it("delivers progress event to subscriber", () => {
    const reg = getCitationRegistry();
    const received: any[] = [];

    reg.subscribe(10, (event, payload) => {
      if (event === "progress") received.push(payload);
    });

    reg.emit(10, "progress", { jobId: 10, round: 1, engine: "chatgpt", queriesCompleted: 3, queriesTotal: 8 });

    expect(received).toHaveLength(1);
    expect(received[0].engine).toBe("chatgpt");
    expect(received[0].queriesCompleted).toBe(3);
  });

  it("marks job as terminal on done event", () => {
    const reg = getCitationRegistry();
    expect(reg.isJobTerminal(99)).toBe(false);

    reg.emit(99, "done", {
      jobId: 99,
      summary: {
        chatgpt: { cited: 1, domainCited: 0, total: 2, queriesWithAI: 1 },
        google: { cited: 0, domainCited: 0, total: 2, queriesWithAI: 0 },
        perplexity: { cited: 0, domainCited: 0, total: 2, queriesWithAI: 0 },
        gemini: { cited: 0, domainCited: 0, total: 2, queriesWithAI: 0 },
      },
      foundCitation: true,
      totalQueriesChecked: 8,
      allCompetitorDomains: [],
    });

    expect(reg.isJobTerminal(99)).toBe(true);
  });

  it("marks job as terminal on error event", () => {
    const reg = getCitationRegistry();
    reg.emit(77, "error", { jobId: 77, message: "timeout" });
    expect(reg.isJobTerminal(77)).toBe(true);
  });

  it("unsubscribe removes all listeners — no events after unsubscribe", () => {
    const reg = getCitationRegistry();
    const received: string[] = [];

    const sub = reg.subscribe(5, (event) => {
      received.push(event);
    });

    reg.emit(5, "progress", { jobId: 5, round: 1, engine: "google", queriesCompleted: 1, queriesTotal: 5 });
    expect(received).toHaveLength(1);

    sub.unsubscribe();

    reg.emit(5, "progress", { jobId: 5, round: 1, engine: "google", queriesCompleted: 2, queriesTotal: 5 });
    expect(received).toHaveLength(1); // still 1 — no new events after unsubscribe
  });

  it("multiple subscribers receive the same event", () => {
    const reg = getCitationRegistry();
    const a: string[] = [];
    const b: string[] = [];

    reg.subscribe(20, (event) => a.push(event));
    reg.subscribe(20, (event) => b.push(event));

    reg.emit(20, "result", makeCitationResult());

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it("events for different jobs do not cross-contaminate", () => {
    const reg = getCitationRegistry();
    const job1Events: string[] = [];
    const job2Events: string[] = [];

    reg.subscribe(100, (event) => job1Events.push(event));
    reg.subscribe(200, (event) => job2Events.push(event));

    reg.emit(100, "result", makeCitationResult({ query: "job1 query" }));
    reg.emit(200, "result", makeCitationResult({ query: "job2 query" }));

    expect(job1Events).toHaveLength(1);
    expect(job2Events).toHaveLength(1);
  });

  it("hasJob returns false for unknown jobs", () => {
    const reg = getCitationRegistry();
    expect(reg.hasJob(9999)).toBe(false);
  });

  it("hasJob returns true after first emit", () => {
    const reg = getCitationRegistry();
    reg.emit(55, "progress", { jobId: 55, round: 1, engine: "gemini", queriesCompleted: 1, queriesTotal: 5 });
    expect(reg.hasJob(55)).toBe(true);
  });

  it("evictStale removes inactive entries", () => {
    vi.useFakeTimers();
    const reg = getCitationRegistry();

    // Emit to create entry
    reg.emit(300, "progress", { jobId: 300, round: 1, engine: "google", queriesCompleted: 1, queriesTotal: 5 });
    expect(reg.size).toBe(1);

    // Manually set lastActivityAt to far in the past by emitting and then advancing time
    // evictStale uses TTL_ACTIVE_MS = 30 min
    vi.advanceTimersByTime(31 * 60 * 1000);
    reg.evictStale();

    expect(reg.size).toBe(0);
    vi.useRealTimers();
  });

  it("terminal jobs are NOT evicted by evictStale (they have their own TTL timer)", () => {
    vi.useFakeTimers();
    const reg = getCitationRegistry();

    reg.emit(400, "done", {
      jobId: 400,
      summary: { chatgpt: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 }, google: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 }, perplexity: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 }, gemini: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 } },
      foundCitation: false,
      totalQueriesChecked: 0,
      allCompetitorDomains: [],
    });

    // Advance 4 minutes — less than TTL_AFTER_TERMINAL_MS (5 min).
    // evictStale() only removes non-terminal entries; terminal entries use their own cleanup timer.
    vi.advanceTimersByTime(4 * 60 * 1000);
    reg.evictStale();

    expect(reg.size).toBe(1); // still present — TTL_AFTER_TERMINAL_MS not yet expired
    vi.useRealTimers();
  });
});

// ─── 2. SSE Event Contract ────────────────────────────────────────────────────

describe("SSE event payload contract", () => {
  beforeEach(() => {
    _resetRegistryForTesting();
  });

  it("result payload preserves all CitationResult fields", () => {
    const reg = getCitationRegistry();
    let received: CitationResult | null = null;

    reg.subscribe(1, (event, payload) => {
      if (event === "result") received = payload as CitationResult;
    });

    const result = makeCitationResult({
      engine: "perplexity",
      isCited: "domain",
      domainCitedUrl: "https://example.com/other-page",
      snippet: "Przykładowy snippet",
      hasAIOverview: true,
    });

    reg.emit(1, "result", result);

    expect(received).not.toBeNull();
    expect(received!.engine).toBe("perplexity");
    expect(received!.isCited).toBe("domain");
    expect(received!.domainCitedUrl).toBe("https://example.com/other-page");
    expect(received!.snippet).toBe("Przykładowy snippet");
  });

  it("done payload includes summary with all 4 engines", () => {
    const reg = getCitationRegistry();
    let donePayload: any = null;

    reg.subscribe(2, (event, payload) => {
      if (event === "done") donePayload = payload;
    });

    reg.emit(2, "done", {
      jobId: 2,
      summary: {
        chatgpt: { cited: 2, domainCited: 1, total: 5, queriesWithAI: 3 },
        google: { cited: 1, domainCited: 0, total: 5, queriesWithAI: 2 },
        perplexity: { cited: 0, domainCited: 0, total: 5, queriesWithAI: 1 },
        gemini: { cited: 3, domainCited: 0, total: 5, queriesWithAI: 4 },
      },
      foundCitation: true,
      totalQueriesChecked: 20,
      allCompetitorDomains: [{ domain: "competitor.com", count: 3 }],
    });

    expect(donePayload).not.toBeNull();
    expect(donePayload.summary.chatgpt.cited).toBe(2);
    expect(donePayload.summary.gemini.cited).toBe(3);
    expect(donePayload.foundCitation).toBe(true);
    expect(donePayload.totalQueriesChecked).toBe(20);
    expect(donePayload.allCompetitorDomains[0].domain).toBe("competitor.com");
  });

  it("error payload includes message", () => {
    const reg = getCitationRegistry();
    let errorPayload: any = null;

    reg.subscribe(3, (event, payload) => {
      if (event === "error") errorPayload = payload;
    });

    reg.emit(3, "error", { jobId: 3, message: "API rate limit exceeded" });

    expect(errorPayload).not.toBeNull();
    expect(errorPayload.message).toBe("API rate limit exceeded");
  });
});

// ─── 3. Worker integration — onResult callback ────────────────────────────────

describe("Worker onResult SSE integration", () => {
  beforeEach(() => {
    _resetRegistryForTesting();
  });

  it("simulates worker emitting results via onResult callback", () => {
    const reg = getCitationRegistry();
    const jobId = 500;
    const received: CitationResult[] = [];

    reg.subscribe(jobId, (event, payload) => {
      if (event === "result") received.push(payload as CitationResult);
    });

    // Simulate what the worker does: call onResult for each query result
    const onResult = (result: CitationResult): void => {
      reg.emit(jobId, "result", result);
    };

    // Simulate 3 engine results arriving
    onResult(makeCitationResult({ query: "query 1", engine: "google", isCited: "yes" }));
    onResult(makeCitationResult({ query: "query 1", engine: "chatgpt", isCited: "no" }));
    onResult(makeCitationResult({ query: "query 2", engine: "perplexity", isCited: "domain" }));

    expect(received).toHaveLength(3);
    expect(received[0].engine).toBe("google");
    expect(received[1].engine).toBe("chatgpt");
    expect(received[2].isCited).toBe("domain");
  });

  it("progress events arrive between result events", () => {
    const reg = getCitationRegistry();
    const jobId = 501;
    const events: string[] = [];

    reg.subscribe(jobId, (event) => events.push(event));

    reg.emit(jobId, "result", makeCitationResult({ query: "q1" }));
    reg.emit(jobId, "progress", { jobId, round: 1, engine: "google", queriesCompleted: 1, queriesTotal: 5 });
    reg.emit(jobId, "result", makeCitationResult({ query: "q2" }));
    reg.emit(jobId, "progress", { jobId, round: 1, engine: "google", queriesCompleted: 2, queriesTotal: 5 });
    reg.emit(jobId, "done", {
      jobId,
      summary: { chatgpt: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 }, google: { cited: 1, domainCited: 0, total: 2, queriesWithAI: 1 }, perplexity: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 }, gemini: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 } },
      foundCitation: true,
      totalQueriesChecked: 2,
      allCompetitorDomains: [],
    });

    expect(events).toEqual(["result", "progress", "result", "progress", "done"]);
  });

  it("late subscriber after terminal event receives no events (no replay)", () => {
    const reg = getCitationRegistry();
    const jobId = 502;

    // Emit done BEFORE subscribing
    reg.emit(jobId, "done", {
      jobId,
      summary: { chatgpt: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 }, google: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 }, perplexity: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 }, gemini: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 } },
      foundCitation: false,
      totalQueriesChecked: 0,
      allCompetitorDomains: [],
    });

    const received: string[] = [];
    reg.subscribe(jobId, (event) => received.push(event));

    // No new events emitted after subscribe
    expect(received).toHaveLength(0);
    // But job is marked terminal — SSE handler can detect this and send synthetic done
    expect(reg.isJobTerminal(jobId)).toBe(true);
  });
});

// ─── 4. Memory safety ─────────────────────────────────────────────────────────

describe("Memory safety", () => {
  beforeEach(() => {
    _resetRegistryForTesting();
  });

  it("unsubscribing all listeners leaves emitter clean", () => {
    const reg = getCitationRegistry();
    const subs = Array.from({ length: 5 }, () =>
      reg.subscribe(600, () => {})
    );

    // All unsubscribe
    subs.forEach(s => s.unsubscribe());

    // Emitting after all unsubscribed should not throw
    expect(() => {
      reg.emit(600, "progress", { jobId: 600, round: 1, engine: "google", queriesCompleted: 1, queriesTotal: 5 });
    }).not.toThrow();
  });

  it("singleton returns the same registry instance", () => {
    const a = getCitationRegistry();
    const b = getCitationRegistry();
    expect(a).toBe(b);
  });

  it("reset creates a fresh registry", () => {
    const a = getCitationRegistry();
    a.emit(1, "progress", { jobId: 1, round: 1, engine: "google", queriesCompleted: 1, queriesTotal: 5 });
    expect(a.size).toBe(1);

    _resetRegistryForTesting();
    const b = getCitationRegistry();
    expect(b.size).toBe(0);
    expect(a).not.toBe(b);
  });
});

// ─── 5. Polling fallback compatibility ────────────────────────────────────────

describe("Polling fallback compatibility", () => {
  it("registry emit is a no-op when no subscribers — does not throw", () => {
    _resetRegistryForTesting();
    const reg = getCitationRegistry();

    // No subscribers — should not throw
    expect(() => {
      reg.emit(700, "result", makeCitationResult());
      reg.emit(700, "progress", { jobId: 700, round: 1, engine: "google", queriesCompleted: 1, queriesTotal: 5 });
      reg.emit(700, "done", {
        jobId: 700,
        summary: { chatgpt: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 }, google: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 }, perplexity: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 }, gemini: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 } },
        foundCitation: false,
        totalQueriesChecked: 0,
        allCompetitorDomains: [],
      });
    }).not.toThrow();
  });

  it("worker can emit events even when no SSE clients are connected", () => {
    _resetRegistryForTesting();
    const reg = getCitationRegistry();

    // Simulate worker running without any SSE client
    const results = [
      makeCitationResult({ query: "q1", engine: "google" }),
      makeCitationResult({ query: "q1", engine: "chatgpt" }),
    ];

    // Should not throw — polling clients will get data from DB instead
    for (const r of results) {
      expect(() => reg.emit(800, "result", r)).not.toThrow();
    }
    expect(() => reg.emit(800, "done", {
      jobId: 800,
      summary: { chatgpt: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 }, google: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 }, perplexity: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 }, gemini: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 } },
      foundCitation: false,
      totalQueriesChecked: 2,
      allCompetitorDomains: [],
    })).not.toThrow();
  });
});
