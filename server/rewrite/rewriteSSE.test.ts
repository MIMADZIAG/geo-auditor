/**
 * Rewrite SSE — Vitest Test Suite
 * ─────────────────────────────────────────────────────────────────────────────
 * Covers:
 *  1. RewriteSSERegistry — emit, subscribe, terminal state, TTL, eviction
 *  2. Step C — Last-Event-ID replay buffer: bounded ring, replay on reconnect,
 *              deduplication, terminal replay, buffer eviction on overflow
 *  3. SSE event contract — typed payloads, step/section/done/error
 *  4. Memory safety — unsubscribe, max listeners, no cross-job contamination
 *  5. Step B integration — emitStep/emitSection/emitDone/emitError helpers
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rewriteSSERegistry } from "./rewriteSSERegistry";
import type {
  RewriteStepEvent,
  RewriteSectionEvent,
  RewriteDoneEvent,
  RewriteErrorEvent,
  RewriteSSEPayload,
} from "./rewriteSSERegistry";

// ─── Test isolation helper ────────────────────────────────────────────────────
// The registry is a singleton. We need to reset it between tests.
// Since the class is not exported directly, we use a workaround:
// we access the private `entries` map via a cast and clear it.

function resetRegistry(): void {
  // Access private entries map for test isolation
  const reg = rewriteSSERegistry as any;
  // Clear all entries and their timers
  if (reg.entries) {
    for (const [, entry] of Array.from(reg.entries.entries() as Iterable<[any, any]>)) {
      if (entry.gcTimer) clearTimeout(entry.gcTimer);
      entry.emitter?.removeAllListeners();
    }
    reg.entries.clear();
  }
}

// ─── 1. RewriteSSERegistry — core lifecycle ───────────────────────────────────

describe("RewriteSSERegistry — core lifecycle", () => {
  beforeEach(resetRegistry);
  afterEach(resetRegistry);

  it("starts empty", () => {
    expect(rewriteSSERegistry.size).toBe(0);
  });

  it("creates entry on ensureEntry", () => {
    rewriteSSERegistry.ensureEntry(1);
    expect(rewriteSSERegistry.size).toBe(1);
  });

  it("ensureEntry is idempotent", () => {
    rewriteSSERegistry.ensureEntry(1);
    rewriteSSERegistry.ensureEntry(1);
    expect(rewriteSSERegistry.size).toBe(1);
  });

  it("has() returns false for unknown job", () => {
    expect(rewriteSSERegistry.has(9999)).toBe(false);
  });

  it("has() returns true after ensureEntry", () => {
    rewriteSSERegistry.ensureEntry(42);
    expect(rewriteSSERegistry.has(42)).toBe(true);
  });

  it("isActive() returns true for non-terminal job", () => {
    rewriteSSERegistry.ensureEntry(10);
    expect(rewriteSSERegistry.isActive(10)).toBe(true);
  });

  it("isActive() returns false after done event", () => {
    rewriteSSERegistry.ensureEntry(11);
    rewriteSSERegistry.emitDone(11, { contentLength: 100, wasRevised: false });
    expect(rewriteSSERegistry.isActive(11)).toBe(false);
  });

  it("isTerminal() returns false for active job", () => {
    rewriteSSERegistry.ensureEntry(12);
    expect(rewriteSSERegistry.isTerminal(12)).toBe(false);
  });

  it("isTerminal() returns true after error event", () => {
    rewriteSSERegistry.ensureEntry(13);
    rewriteSSERegistry.emitError(13, { message: "timeout" });
    expect(rewriteSSERegistry.isTerminal(13)).toBe(true);
  });

  it("getStatus() returns correct states", () => {
    expect(rewriteSSERegistry.getStatus(9999)).toBe("unknown");
    rewriteSSERegistry.ensureEntry(20);
    expect(rewriteSSERegistry.getStatus(20)).toBe("active");
    rewriteSSERegistry.emitDone(20, { contentLength: 50, wasRevised: true });
    expect(rewriteSSERegistry.getStatus(20)).toBe("terminal");
  });
});

// ─── 2. Step C — Last-Event-ID replay buffer ─────────────────────────────────

describe("Step C — Last-Event-ID replay buffer", () => {
  beforeEach(resetRegistry);
  afterEach(resetRegistry);

  it("replay buffer is empty for new job", () => {
    rewriteSSERegistry.ensureEntry(100);
    const buf = rewriteSSERegistry.getReplayBufferForTesting(100);
    expect(buf).toHaveLength(0);
  });

  it("emitted events are stored in replay buffer with monotonic seq", () => {
    rewriteSSERegistry.ensureEntry(101);
    rewriteSSERegistry.emitStep(101, { step: 1, label: "Fetching page" });
    rewriteSSERegistry.emitStep(101, { step: 2, label: "Researching" });

    const buf = rewriteSSERegistry.getReplayBufferForTesting(101);
    expect(buf).toHaveLength(2);
    expect(buf[0].event).toBe("step");
    expect(buf[1].event).toBe("step");
    // Seqs are monotonically increasing
    expect(buf[1].seq).toBeGreaterThan(buf[0].seq);
  });

  it("getReplayBuffer(jobId, 0) returns all buffered events", () => {
    rewriteSSERegistry.ensureEntry(102);
    rewriteSSERegistry.emitStep(102, { step: 1, label: "Step 1" });
    rewriteSSERegistry.emitSection(102, { current: 1, total: 3 });
    rewriteSSERegistry.emitSection(102, { current: 2, total: 3 });

    const buf = rewriteSSERegistry.getReplayBuffer(102, 0);
    expect(buf).toHaveLength(3);
  });

  it("getReplayBuffer(jobId, lastSeenSeq) returns only events after lastSeenSeq", () => {
    rewriteSSERegistry.ensureEntry(103);
    rewriteSSERegistry.emitStep(103, { step: 1, label: "Step 1" });
    rewriteSSERegistry.emitStep(103, { step: 2, label: "Step 2" });
    rewriteSSERegistry.emitStep(103, { step: 3, label: "Step 3" });

    const allBuf = rewriteSSERegistry.getReplayBufferForTesting(103);
    expect(allBuf).toHaveLength(3);

    // Client saw the first event — replay only the remaining 2
    const lastSeenSeq = allBuf[0].seq;
    const missed = rewriteSSERegistry.getReplayBuffer(103, lastSeenSeq);
    expect(missed).toHaveLength(2);
    expect(missed[0].event).toBe("step");
    expect((missed[0].data as RewriteStepEvent).step).toBe(2);
  });

  it("getReplayBuffer returns empty array for unknown job", () => {
    const buf = rewriteSSERegistry.getReplayBuffer(9999, 0);
    expect(buf).toHaveLength(0);
  });

  it("terminal events (done/error) are stored in replay buffer", () => {
    rewriteSSERegistry.ensureEntry(104);
    rewriteSSERegistry.emitStep(104, { step: 1, label: "Step 1" });
    rewriteSSERegistry.emitDone(104, { contentLength: 200, wasRevised: true, eeatScore: 8 });

    const buf = rewriteSSERegistry.getReplayBufferForTesting(104);
    expect(buf).toHaveLength(2);
    expect(buf[1].event).toBe("done");
    expect((buf[1].data as RewriteDoneEvent).contentLength).toBe(200);
  });

  it("replay buffer is bounded — oldest entries evicted on overflow", () => {
    rewriteSSERegistry.ensureEntry(105);

    // Emit 110 events — more than REPLAY_BUFFER_SIZE (100)
    for (let i = 0; i < 110; i++) {
      rewriteSSERegistry.emitSection(105, { current: i + 1, total: 110 });
    }

    const buf = rewriteSSERegistry.getReplayBufferForTesting(105);
    // Buffer should be capped at REPLAY_BUFFER_SIZE (100)
    expect(buf.length).toBeLessThanOrEqual(100);
    // Oldest entries evicted — buffer contains the most recent events
    expect((buf[buf.length - 1].data as RewriteSectionEvent).current).toBe(110);
  });

  it("seq values are unique across different jobs", () => {
    rewriteSSERegistry.ensureEntry(200);
    rewriteSSERegistry.ensureEntry(201);

    rewriteSSERegistry.emitStep(200, { step: 1, label: "Job 200 step 1" });
    rewriteSSERegistry.emitStep(201, { step: 1, label: "Job 201 step 1" });

    const buf200 = rewriteSSERegistry.getReplayBufferForTesting(200);
    const buf201 = rewriteSSERegistry.getReplayBufferForTesting(201);

    // Seqs must be globally unique (module-level counter)
    expect(buf200[0].seq).not.toBe(buf201[0].seq);
  });

  it("live subscribers receive (payload, seq) — seq matches replay buffer", () => {
    rewriteSSERegistry.ensureEntry(106);

    const received: Array<{ payload: RewriteSSEPayload; seq: number }> = [];
    rewriteSSERegistry.subscribe(106, (payload, seq) => {
      received.push({ payload, seq });
    });

    rewriteSSERegistry.emitStep(106, { step: 1, label: "Step 1" });
    rewriteSSERegistry.emitSection(106, { current: 1, total: 2 });

    expect(received).toHaveLength(2);

    const buf = rewriteSSERegistry.getReplayBufferForTesting(106);
    // Live subscriber seq must match replay buffer seq
    expect(received[0].seq).toBe(buf[0].seq);
    expect(received[1].seq).toBe(buf[1].seq);
  });

  it("reconnect scenario: replay delivers missed events in order", () => {
    rewriteSSERegistry.ensureEntry(107);

    // Simulate: client connected, received step 1, then disconnected
    const firstBatch: Array<{ payload: RewriteSSEPayload; seq: number }> = [];
    const unsub1 = rewriteSSERegistry.subscribe(107, (payload, seq) => {
      firstBatch.push({ payload, seq });
    });

    rewriteSSERegistry.emitStep(107, { step: 1, label: "Step 1" });
    const lastSeenSeq = firstBatch[0].seq;
    unsub1(); // client disconnected

    // Worker continues emitting while client is disconnected
    rewriteSSERegistry.emitStep(107, { step: 2, label: "Step 2" });
    rewriteSSERegistry.emitSection(107, { current: 1, total: 3 });
    rewriteSSERegistry.emitDone(107, { contentLength: 500, wasRevised: false });

    // Client reconnects — replays missed events
    const missed = rewriteSSERegistry.getReplayBuffer(107, lastSeenSeq);
    expect(missed).toHaveLength(3); // step 2, section 1, done
    expect(missed[0].event).toBe("step");
    expect((missed[0].data as RewriteStepEvent).step).toBe(2);
    expect(missed[1].event).toBe("section");
    expect(missed[2].event).toBe("done");
  });
});

// ─── 3. SSE event contract ────────────────────────────────────────────────────

describe("RewriteSSERegistry — event contract", () => {
  beforeEach(resetRegistry);
  afterEach(resetRegistry);

  it("emitStep delivers correct payload to subscriber", () => {
    rewriteSSERegistry.ensureEntry(300);
    const received: RewriteSSEPayload[] = [];
    rewriteSSERegistry.subscribe(300, (p) => received.push(p));

    rewriteSSERegistry.emitStep(300, { step: 2, label: "Researching keywords" });

    expect(received).toHaveLength(1);
    expect(received[0].event).toBe("step");
    expect((received[0].data as RewriteStepEvent).step).toBe(2);
    expect((received[0].data as RewriteStepEvent).label).toBe("Researching keywords");
  });

  it("emitSection delivers correct payload to subscriber", () => {
    rewriteSSERegistry.ensureEntry(301);
    const received: RewriteSSEPayload[] = [];
    rewriteSSERegistry.subscribe(301, (p) => received.push(p));

    rewriteSSERegistry.emitSection(301, { current: 3, total: 7, sectionTitle: "Intro" });

    expect(received).toHaveLength(1);
    expect(received[0].event).toBe("section");
    const data = received[0].data as RewriteSectionEvent;
    expect(data.current).toBe(3);
    expect(data.total).toBe(7);
    expect(data.sectionTitle).toBe("Intro");
  });

  it("emitDone delivers correct payload and marks terminal", () => {
    rewriteSSERegistry.ensureEntry(302);
    const received: RewriteSSEPayload[] = [];
    rewriteSSERegistry.subscribe(302, (p) => received.push(p));

    rewriteSSERegistry.emitDone(302, { contentLength: 1024, wasRevised: true, eeatScore: 9 });

    expect(received).toHaveLength(1);
    expect(received[0].event).toBe("done");
    const data = received[0].data as RewriteDoneEvent;
    expect(data.contentLength).toBe(1024);
    expect(data.wasRevised).toBe(true);
    expect(data.eeatScore).toBe(9);
    expect(rewriteSSERegistry.isTerminal(302)).toBe(true);
  });

  it("emitError delivers correct payload and marks terminal", () => {
    rewriteSSERegistry.ensureEntry(303);
    const received: RewriteSSEPayload[] = [];
    rewriteSSERegistry.subscribe(303, (p) => received.push(p));

    rewriteSSERegistry.emitError(303, { message: "LLM rate limit exceeded" });

    expect(received).toHaveLength(1);
    expect(received[0].event).toBe("error");
    expect((received[0].data as RewriteErrorEvent).message).toBe("LLM rate limit exceeded");
    expect(rewriteSSERegistry.isTerminal(303)).toBe(true);
  });

  it("events for different jobs do not cross-contaminate", () => {
    rewriteSSERegistry.ensureEntry(400);
    rewriteSSERegistry.ensureEntry(401);

    const job400: string[] = [];
    const job401: string[] = [];

    rewriteSSERegistry.subscribe(400, (p) => job400.push(p.event));
    rewriteSSERegistry.subscribe(401, (p) => job401.push(p.event));

    rewriteSSERegistry.emitStep(400, { step: 1, label: "Job 400" });
    rewriteSSERegistry.emitSection(401, { current: 1, total: 2 });

    expect(job400).toEqual(["step"]);
    expect(job401).toEqual(["section"]);
  });

  it("multiple subscribers receive the same event", () => {
    rewriteSSERegistry.ensureEntry(402);
    const a: string[] = [];
    const b: string[] = [];

    rewriteSSERegistry.subscribe(402, (p) => a.push(p.event));
    rewriteSSERegistry.subscribe(402, (p) => b.push(p.event));

    rewriteSSERegistry.emitStep(402, { step: 1, label: "Step 1" });

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });
});

// ─── 4. Memory safety ─────────────────────────────────────────────────────────

describe("RewriteSSERegistry — memory safety", () => {
  beforeEach(resetRegistry);
  afterEach(resetRegistry);

  it("unsubscribe removes listener — no events after unsubscribe", () => {
    rewriteSSERegistry.ensureEntry(500);
    const received: string[] = [];

    const unsub = rewriteSSERegistry.subscribe(500, (p) => received.push(p.event));
    rewriteSSERegistry.emitStep(500, { step: 1, label: "Step 1" });
    expect(received).toHaveLength(1);

    unsub();
    rewriteSSERegistry.emitStep(500, { step: 2, label: "Step 2" });
    expect(received).toHaveLength(1); // still 1 — no new events after unsubscribe
  });

  it("emitting to non-existent job does not throw", () => {
    expect(() => {
      rewriteSSERegistry.emitStep(9999, { step: 1, label: "Step 1" });
    }).not.toThrow();
  });

  it("emitting error event does not throw even without subscribers", () => {
    rewriteSSERegistry.ensureEntry(501);
    expect(() => {
      rewriteSSERegistry.emitError(501, { message: "crash" });
    }).not.toThrow();
  });

  it("TTL-based eviction removes terminal entry after timeout", () => {
    vi.useFakeTimers();
    resetRegistry();

    rewriteSSERegistry.ensureEntry(502);
    rewriteSSERegistry.emitDone(502, { contentLength: 100, wasRevised: false });
    expect(rewriteSSERegistry.size).toBe(1);

    // Advance past TTL_AFTER_TERMINAL_MS (5 min)
    vi.advanceTimersByTime(6 * 60 * 1000);
    expect(rewriteSSERegistry.size).toBe(0);

    vi.useRealTimers();
    resetRegistry();
  });

  it("stale non-terminal entry evicted after TTL_STALE_MS", () => {
    vi.useFakeTimers();
    resetRegistry();

    rewriteSSERegistry.ensureEntry(503);
    expect(rewriteSSERegistry.size).toBe(1);

    // Advance past TTL_STALE_MS (30 min)
    vi.advanceTimersByTime(31 * 60 * 1000);
    expect(rewriteSSERegistry.size).toBe(0);

    vi.useRealTimers();
    resetRegistry();
  });

  it("terminal entry NOT evicted before TTL_AFTER_TERMINAL_MS expires", () => {
    vi.useFakeTimers();
    resetRegistry();

    rewriteSSERegistry.ensureEntry(504);
    rewriteSSERegistry.emitDone(504, { contentLength: 100, wasRevised: false });

    // Advance only 4 min — less than TTL_AFTER_TERMINAL_MS (5 min)
    vi.advanceTimersByTime(4 * 60 * 1000);
    expect(rewriteSSERegistry.size).toBe(1); // still present

    vi.useRealTimers();
    resetRegistry();
  });
});

// ─── 5. Step B integration — full pipeline simulation ────────────────────────

describe("Step B — full pipeline simulation", () => {
  beforeEach(resetRegistry);
  afterEach(resetRegistry);

  it("simulates complete rewrite pipeline: step1→step2→sections→step3→step4→done", () => {
    rewriteSSERegistry.ensureEntry(600);
    const events: string[] = [];
    const steps: number[] = [];
    const sections: number[] = [];

    rewriteSSERegistry.subscribe(600, (p) => {
      events.push(p.event);
      if (p.event === "step") steps.push((p.data as RewriteStepEvent).step);
      if (p.event === "section") sections.push((p.data as RewriteSectionEvent).current);
    });

    // Simulate the 4-stage pipeline
    rewriteSSERegistry.emitStep(600, { step: 1, label: "Fetching page content" });
    rewriteSSERegistry.emitStep(600, { step: 2, label: "Researching keywords" });
    rewriteSSERegistry.emitStep(600, { step: 3, label: "Generating content" });
    rewriteSSERegistry.emitSection(600, { current: 1, total: 3, sectionTitle: "Introduction" });
    rewriteSSERegistry.emitSection(600, { current: 2, total: 3, sectionTitle: "Main content" });
    rewriteSSERegistry.emitSection(600, { current: 3, total: 3, sectionTitle: "Conclusion" });
    rewriteSSERegistry.emitStep(600, { step: 4, label: "E-E-A-T verification" });
    rewriteSSERegistry.emitDone(600, { contentLength: 2048, wasRevised: true, eeatScore: 8.5 });

    expect(events).toEqual(["step", "step", "step", "section", "section", "section", "step", "done"]);
    expect(steps).toEqual([1, 2, 3, 4]);
    expect(sections).toEqual([1, 2, 3]);
    expect(rewriteSSERegistry.isTerminal(600)).toBe(true);

    // Replay buffer should contain all 8 events
    const buf = rewriteSSERegistry.getReplayBufferForTesting(600);
    expect(buf).toHaveLength(8);
  });

  it("error path: step1→step2→error marks terminal and stops pipeline", () => {
    rewriteSSERegistry.ensureEntry(601);
    const events: string[] = [];

    rewriteSSERegistry.subscribe(601, (p) => events.push(p.event));

    rewriteSSERegistry.emitStep(601, { step: 1, label: "Fetching page content" });
    rewriteSSERegistry.emitStep(601, { step: 2, label: "Researching keywords" });
    rewriteSSERegistry.emitError(601, { message: "LLM API unavailable" });

    expect(events).toEqual(["step", "step", "error"]);
    expect(rewriteSSERegistry.isTerminal(601)).toBe(true);

    // Replay buffer contains all 3 events including error
    const buf = rewriteSSERegistry.getReplayBufferForTesting(601);
    expect(buf).toHaveLength(3);
    expect(buf[2].event).toBe("error");
  });
});
