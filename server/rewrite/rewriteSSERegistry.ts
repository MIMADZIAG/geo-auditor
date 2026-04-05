/**
 * RewriteSSERegistry
 * ─────────────────────────────────────────────────────────────────────────────
 * Job-scoped EventEmitter registry for Signal Rewrite progress streaming.
 *
 * Architecture mirrors the citation SSERegistry but is typed for rewrite events:
 *
 *   "step"     — pipeline stage changed (1=fetch, 2=research, 3=generate, 4=verify)
 *   "section"  — one content section generated (section N of M)
 *   "done"     — rewrite complete, carries final content hash for client validation
 *   "error"    — rewrite failed, carries human-readable message
 *
 * Lifecycle:
 *   1. tRPC rewrite procedure calls `ensureEntry(jobId)` before starting work.
 *   2. Worker calls `emit*(jobId, payload)` helpers as each stage completes.
 *   3. SSE handler subscribes via `subscribe(jobId, listener)`.
 *   4. On "done" or "error", the entry is marked terminal and scheduled for GC.
 *
 * Memory safety:
 *   - Terminal entries are evicted after TTL_AFTER_TERMINAL_MS (5 min).
 *   - Non-terminal entries that are never closed are evicted after
 *     TTL_STALE_MS (30 min) to handle crashed workers.
 *   - Max MAX_ENTRIES concurrent jobs; oldest non-terminal entry evicted on overflow.
 *
 * Step C — Last-Event-ID replay:
 *   Every emitted event is appended to a per-job bounded ring buffer
 *   (max REPLAY_BUFFER_SIZE entries). When a client reconnects with a
 *   Last-Event-ID header, the handler replays all events with seq > lastSeenSeq
 *   before subscribing to live events. This eliminates the "missed events during
 *   reconnect" window without requiring Redis or persistent storage.
 *
 * @module rewriteSSERegistry
 */

import { EventEmitter } from "events";

// ─── Event type definitions ────────────────────────────────────────────────────

export interface RewriteStepEvent {
  step: 1 | 2 | 3 | 4;
  label: string;
}

export interface RewriteSectionEvent {
  current: number;
  total: number;
  sectionTitle?: string;
}

export interface RewriteDoneEvent {
  /** Byte length of final content — lets client verify it received the full result */
  contentLength: number;
  /** Whether E-E-A-T revision was applied */
  wasRevised: boolean;
  /** E-E-A-T overall score (0–10) if available */
  eeatScore?: number | null;
}

export interface RewriteErrorEvent {
  message: string;
}

export type RewriteSSEEventName = "step" | "section" | "done" | "error";

export type RewriteSSEPayload =
  | { event: "step"; data: RewriteStepEvent }
  | { event: "section"; data: RewriteSectionEvent }
  | { event: "done"; data: RewriteDoneEvent }
  | { event: "error"; data: RewriteErrorEvent };

// ─── Replay buffer types ──────────────────────────────────────────────────────

export interface RewriteReplayEntry {
  /** Monotonically increasing sequence number — used as SSE event id */
  seq: number;
  event: RewriteSSEEventName;
  data: RewriteSSEPayload["data"];
}

// ─── Registry entry ────────────────────────────────────────────────────────────

interface RegistryEntry {
  emitter: EventEmitter;
  isTerminal: boolean;
  createdAt: number;
  /** setTimeout handle for TTL-based GC */
  gcTimer: ReturnType<typeof setTimeout> | null;
  /**
   * Step C: Bounded ring buffer of emitted events for Last-Event-ID replay.
   * Oldest entries are evicted when the buffer exceeds REPLAY_BUFFER_SIZE.
   */
  replayBuffer: RewriteReplayEntry[];
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const TTL_AFTER_TERMINAL_MS = 5 * 60 * 1000;  // 5 min — keep for late SSE connects
const TTL_STALE_MS          = 30 * 60 * 1000; // 30 min — evict crashed/abandoned jobs
const MAX_ENTRIES           = 500;             // hard cap on concurrent rewrite jobs

/**
 * Step C: Max events stored in per-job replay buffer.
 * A rewrite job typically emits ~10–20 events (4 steps + sections + done).
 * 100 gives comfortable headroom without excessive memory use (~30 KB/job).
 */
const REPLAY_BUFFER_SIZE = 100;

// ─── Monotonic sequence counter ───────────────────────────────────────────────
// Module-level counter shared across all rewrite jobs in this process.
// Using a module-level counter (not per-job) ensures global uniqueness,
// which matters if a client reconnects and provides a Last-Event-ID from
// a previous job's event stream.

let _rewriteSeq = 0;
function nextSeq(): number {
  return ++_rewriteSeq;
}

// ─── Registry ──────────────────────────────────────────────────────────────────

class RewriteSSERegistry {
  private readonly entries = new Map<number, RegistryEntry>();

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  /**
   * Ensure an entry exists for `jobId`.
   * Idempotent — safe to call multiple times for the same job.
   */
  ensureEntry(jobId: number): void {
    if (this.entries.has(jobId)) return;

    // Overflow guard: evict oldest non-terminal entry
    if (this.entries.size >= MAX_ENTRIES) {
      this._evictOldest();
    }

    const emitter = new EventEmitter();
    emitter.setMaxListeners(64); // one per SSE client + internal listeners

    // Node.js treats "error" events specially — add a default no-op listener
    // so an unhandled "error" emission doesn't throw an uncaught exception.
    emitter.on("error", () => {});

    const entry: RegistryEntry = {
      emitter,
      isTerminal: false,
      createdAt: Date.now(),
      gcTimer: null,
      replayBuffer: [],
    };

    // Stale-job GC: evict if never completed within TTL_STALE_MS
    entry.gcTimer = setTimeout(() => {
      if (!this.entries.get(jobId)?.isTerminal) {
        this._evict(jobId);
      }
    }, TTL_STALE_MS);

    this.entries.set(jobId, entry);
  }

  /**
   * Subscribe to all SSE events for `jobId`.
   *
   * Step C: The listener now receives (payload, seq) so the SSE handler can
   * use seq as the W3C SSE `id` field for Last-Event-ID tracking.
   *
   * Returns an unsubscribe function — call it on client disconnect.
   */
  subscribe(
    jobId: number,
    listener: (payload: RewriteSSEPayload, seq: number) => void,
  ): () => void {
    const entry = this.entries.get(jobId);
    if (!entry) return () => {};

    const handler = (payload: RewriteSSEPayload, seq: number) => listener(payload, seq);
    entry.emitter.on("__payload__", handler);

    return () => {
      entry.emitter.off("__payload__", handler);
    };
  }

  /**
   * Step C: Return all buffered events with seq > lastSeenSeq.
   *
   * Called by the SSE handler when a client reconnects with a Last-Event-ID
   * header. The handler replays these events before subscribing to live events,
   * ensuring no events are missed during the reconnect window.
   *
   * @param jobId       - The rewrite job
   * @param lastSeenSeq - The seq value from the client's Last-Event-ID header.
   *                      Pass 0 to get all buffered events.
   * @returns Ordered array of replay entries (oldest first)
   */
  getReplayBuffer(jobId: number, lastSeenSeq: number): RewriteReplayEntry[] {
    const entry = this.entries.get(jobId);
    if (!entry) return [];
    return entry.replayBuffer.filter(e => e.seq > lastSeenSeq);
  }

  /** True if the job exists and has not yet reached a terminal state. */
  isActive(jobId: number): boolean {
    const entry = this.entries.get(jobId);
    return !!entry && !entry.isTerminal;
  }

  /** True if the job is known (may be terminal). */
  has(jobId: number): boolean {
    return this.entries.has(jobId);
  }

  /** True if the job has reached a terminal state. */
  isTerminal(jobId: number): boolean {
    return this.entries.get(jobId)?.isTerminal ?? false;
  }

  // ── Emit helpers ─────────────────────────────────────────────────────────────

  emitStep(jobId: number, data: RewriteStepEvent): void {
    this._emit(jobId, { event: "step", data });
  }

  emitSection(jobId: number, data: RewriteSectionEvent): void {
    this._emit(jobId, { event: "section", data });
  }

  emitDone(jobId: number, data: RewriteDoneEvent): void {
    this._emit(jobId, { event: "done", data });
    this._markTerminal(jobId);
  }

  emitError(jobId: number, data: RewriteErrorEvent): void {
    this._emit(jobId, { event: "error", data });
    this._markTerminal(jobId);
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private _emit(jobId: number, payload: RewriteSSEPayload): void {
    const entry = this.entries.get(jobId);
    if (!entry) return;

    // Step C: Assign a global sequence number and append to replay buffer
    const seq = nextSeq();
    const replayEntry: RewriteReplayEntry = { seq, event: payload.event, data: payload.data };
    entry.replayBuffer.push(replayEntry);

    // Evict oldest entry if buffer is full (ring buffer semantics)
    if (entry.replayBuffer.length > REPLAY_BUFFER_SIZE) {
      entry.replayBuffer.shift();
    }

    // Emit to live subscribers — pass seq so the SSE handler can use it as event id
    entry.emitter.emit("__payload__", payload, seq);
  }

  private _markTerminal(jobId: number): void {
    const entry = this.entries.get(jobId);
    if (!entry || entry.isTerminal) return;

    entry.isTerminal = true;

    // Cancel stale-job GC and schedule terminal TTL GC
    if (entry.gcTimer) clearTimeout(entry.gcTimer);
    entry.gcTimer = setTimeout(() => this._evict(jobId), TTL_AFTER_TERMINAL_MS);
  }

  private _evict(jobId: number): void {
    const entry = this.entries.get(jobId);
    if (!entry) return;
    if (entry.gcTimer) clearTimeout(entry.gcTimer);
    entry.emitter.removeAllListeners();
    this.entries.delete(jobId);
  }

  private _evictOldest(): void {
    let oldestId: number | null = null;
    let oldestTime = Infinity;
    for (const [id, entry] of Array.from(this.entries.entries())) {
      if (!entry.isTerminal && entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestId = id;
      }
    }
    if (oldestId !== null) this._evict(oldestId);
  }

  // ── Diagnostics (for tests / health endpoints) ────────────────────────────────

  get size(): number {
    return this.entries.size;
  }

  getStatus(jobId: number): "active" | "terminal" | "unknown" {
    const entry = this.entries.get(jobId);
    if (!entry) return "unknown";
    return entry.isTerminal ? "terminal" : "active";
  }

  /** Step C: Visible for testing */
  getReplayBufferForTesting(jobId: number): RewriteReplayEntry[] {
    return this.entries.get(jobId)?.replayBuffer ?? [];
  }
}

// ─── Singleton export ──────────────────────────────────────────────────────────

export const rewriteSSERegistry = new RewriteSSERegistry();
