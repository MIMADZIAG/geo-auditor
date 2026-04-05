/**
 * Citation SSE Registry
 * ─────────────────────────────────────────────────────────────────────────────
 * A process-scoped in-memory registry that bridges the citation worker
 * (which runs in the same Node.js process) with SSE client connections.
 *
 * Design principles (Cloudflare × Stripe × Linear reliability standards):
 *
 *  1. Job-scoped emitters — each jobId gets its own EventEmitter, preventing
 *     cross-job event leakage and enabling clean per-job cleanup.
 *
 *  2. Bounded memory — jobs are automatically evicted after TTL_MS (5 min).
 *     A completed/failed job keeps its emitter alive long enough for any
 *     late-connecting clients to receive the terminal "done" event.
 *
 *  3. Zero-dependency — uses Node's built-in EventEmitter; no Redis, no
 *     external pub/sub. Scales to the single-process deployment model.
 *
 *  4. Backpressure-aware — SSE clients that disconnect are removed from the
 *     subscriber list immediately; the emitter continues for remaining clients.
 *
 *  5. Typed events — all event payloads are strongly typed so TypeScript
 *     enforces the contract between worker and client.
 *
 *  6. Last-Event-ID replay (Step C) — every emitted event is appended to a
 *     per-job bounded ring buffer (max REPLAY_BUFFER_SIZE entries). When a
 *     client reconnects with a Last-Event-ID header, the handler replays all
 *     events with seq > lastSeenId before subscribing to live events.
 *     This eliminates the "missed events during reconnect" window without
 *     requiring Redis or persistent storage.
 *
 * Event types emitted per job:
 *   "result"   — one CitationResult as it arrives from an engine query
 *   "progress" — lightweight heartbeat with round/engine/total counters
 *   "done"     — terminal event with final summary; clients should close
 *   "error"    — terminal event when the job fails
 *
 * Usage:
 *   // Worker side:
 *   const reg = getCitationRegistry();
 *   reg.emit(jobId, "result", citationResult);
 *   reg.emit(jobId, "done", summary);
 *
 *   // SSE endpoint side:
 *   const sub = reg.subscribe(jobId, (event, payload) => { ... });
 *   req.on("close", () => sub.unsubscribe());
 *
 *   // Replay on reconnect:
 *   const missed = reg.getReplayBuffer(jobId, lastSeenSeq);
 *   for (const entry of missed) { sendSSEEvent(res, entry.event, entry.payload); }
 */

import { EventEmitter } from "events";
import type { CitationResult, CitationJobResult } from "./worker";

// ─── Event payload types ──────────────────────────────────────────────────────

export interface SSEProgressPayload {
  jobId: number;
  round: number;
  engine: string;
  queriesCompleted: number;
  queriesTotal: number;
}

export interface SSEDonePayload {
  jobId: number;
  summary: CitationJobResult["summary"];
  foundCitation: boolean;
  totalQueriesChecked: number;
  allCompetitorDomains: CitationJobResult["allCompetitorDomains"];
}

export interface SSEErrorPayload {
  jobId: number;
  message: string;
}

export type SSEEventMap = {
  result: CitationResult;
  progress: SSEProgressPayload;
  done: SSEDonePayload;
  error: SSEErrorPayload;
};

export type SSEEventType = keyof SSEEventMap;

// ─── Replay buffer types ──────────────────────────────────────────────────────

export interface ReplayEntry<T extends SSEEventType = SSEEventType> {
  /** Monotonically increasing sequence number — used as SSE event id */
  seq: number;
  event: T;
  payload: SSEEventMap[T];
}

// ─── Registry entry ───────────────────────────────────────────────────────────

interface RegistryEntry {
  emitter: EventEmitter;
  /** Timestamp of last activity — used for TTL eviction */
  lastActivityAt: number;
  /** Whether the job has reached a terminal state (done/error) */
  isTerminal: boolean;
  /** Cleanup timer handle */
  cleanupTimer: ReturnType<typeof setTimeout> | null;
  /**
   * Step C: Bounded ring buffer of emitted events for Last-Event-ID replay.
   * Oldest entries are evicted when the buffer exceeds REPLAY_BUFFER_SIZE.
   */
  replayBuffer: ReplayEntry[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** How long to keep a terminal job's emitter alive for late-connecting clients */
const TTL_AFTER_TERMINAL_MS = 5 * 60 * 1000; // 5 minutes

/** How long to keep an active job's emitter alive without any activity */
const TTL_ACTIVE_MS = 30 * 60 * 1000; // 30 minutes

/** Maximum number of listeners per emitter (prevents Node.js memory leak warning) */
const MAX_LISTENERS = 50;

/**
 * Step C: Maximum events stored in the per-job replay buffer.
 * A citation job typically emits ~50–150 events (results + progress + done).
 * 200 gives comfortable headroom without excessive memory use.
 * At ~300 bytes/event avg, this is ~60 KB per active job.
 */
const REPLAY_BUFFER_SIZE = 200;

// ─── Monotonic sequence counter ───────────────────────────────────────────────
// Process-scoped counter — unique across all jobs in this process lifetime.
// Using a module-level counter (not per-job) ensures global uniqueness,
// which matters if a client reconnects and provides a Last-Event-ID from
// a previous job's event stream.

let _globalSeq = 0;
function nextSeq(): number {
  return ++_globalSeq;
}

// ─── CitationSSERegistry ──────────────────────────────────────────────────────

class CitationSSERegistry {
  private readonly jobs = new Map<number, RegistryEntry>();

  /**
   * Ensure a registry entry exists for the given jobId.
   * Idempotent — safe to call multiple times.
   */
  private ensureEntry(jobId: number): RegistryEntry {
    let entry = this.jobs.get(jobId);
    if (!entry) {
      const emitter = new EventEmitter();
      emitter.setMaxListeners(MAX_LISTENERS);
      // CRITICAL: Node.js EventEmitter throws if "error" event is emitted with no listeners.
      // Add a no-op default listener so emitting "error" events is always safe.
      // Typed subscribers added via subscribe() will receive the event normally.
      emitter.on("error", () => {});
      entry = {
        emitter,
        lastActivityAt: Date.now(),
        isTerminal: false,
        cleanupTimer: null,
        replayBuffer: [],
      };
      this.jobs.set(jobId, entry);
    }
    return entry;
  }

  /**
   * Schedule cleanup of a terminal job's emitter after TTL.
   * Called when "done" or "error" is emitted.
   */
  private scheduleCleanup(jobId: number): void {
    const entry = this.jobs.get(jobId);
    if (!entry) return;
    if (entry.cleanupTimer) clearTimeout(entry.cleanupTimer);
    entry.cleanupTimer = setTimeout(() => {
      this.jobs.delete(jobId);
    }, TTL_AFTER_TERMINAL_MS);
  }

  /**
   * Emit a typed event for a specific job.
   * Called by the citation worker.
   *
   * Step C: Every emitted event is appended to the per-job replay buffer.
   * The buffer is bounded — oldest entries are evicted when full.
   */
  emit<T extends SSEEventType>(jobId: number, event: T, payload: SSEEventMap[T]): void {
    const entry = this.ensureEntry(jobId);
    entry.lastActivityAt = Date.now();

    // Step C: Assign a global sequence number and append to replay buffer
    const seq = nextSeq();
    const replayEntry: ReplayEntry<T> = { seq, event, payload };
    entry.replayBuffer.push(replayEntry as ReplayEntry);

    // Evict oldest entry if buffer is full (ring buffer semantics)
    if (entry.replayBuffer.length > REPLAY_BUFFER_SIZE) {
      entry.replayBuffer.shift();
    }

    // Emit to live subscribers — pass seq so the SSE handler can use it as event id
    entry.emitter.emit(event, payload, seq);

    if (event === "done" || event === "error") {
      entry.isTerminal = true;
      this.scheduleCleanup(jobId);
    }
  }

  /**
   * Subscribe to all events for a specific job.
   * Returns an unsubscribe function — MUST be called when the client disconnects.
   *
   * @param jobId - The citation job to subscribe to
   * @param onEvent - Callback invoked for each event, with its sequence number
   * @returns Object with unsubscribe() method
   */
  subscribe(
    jobId: number,
    onEvent: <T extends SSEEventType>(event: T, payload: SSEEventMap[T], seq: number) => void,
  ): { unsubscribe: () => void } {
    const entry = this.ensureEntry(jobId);

    // Typed handler wrappers — one per event type
    // Each handler receives (payload, seq) from the emitter
    const handlers: Partial<Record<SSEEventType, (payload: any, seq: number) => void>> = {
      result: (p: CitationResult, seq: number) => onEvent("result", p, seq),
      progress: (p: SSEProgressPayload, seq: number) => onEvent("progress", p, seq),
      done: (p: SSEDonePayload, seq: number) => onEvent("done", p, seq),
      error: (p: SSEErrorPayload, seq: number) => onEvent("error", p, seq),
    };

    for (const [event, handler] of Object.entries(handlers)) {
      if (handler) entry.emitter.on(event, handler);
    }

    return {
      unsubscribe: () => {
        for (const [event, handler] of Object.entries(handlers)) {
          if (handler) entry.emitter.off(event, handler);
        }
      },
    };
  }

  /**
   * Step C: Return all buffered events with seq > lastSeenSeq.
   *
   * Called by the SSE handler when a client reconnects with a Last-Event-ID
   * header. The handler replays these events before subscribing to live events,
   * ensuring no events are missed during the reconnect window.
   *
   * @param jobId       - The citation job
   * @param lastSeenSeq - The seq value from the client's Last-Event-ID header.
   *                      Pass 0 to get all buffered events.
   * @returns Ordered array of replay entries (oldest first)
   */
  getReplayBuffer(jobId: number, lastSeenSeq: number): ReplayEntry[] {
    const entry = this.jobs.get(jobId);
    if (!entry) return [];
    return entry.replayBuffer.filter(e => e.seq > lastSeenSeq);
  }

  /**
   * Check if a job has reached a terminal state.
   * Used by the SSE endpoint to decide whether to wait or close immediately.
   */
  isJobTerminal(jobId: number): boolean {
    return this.jobs.get(jobId)?.isTerminal ?? false;
  }

  /**
   * Check if a job entry exists in the registry.
   */
  hasJob(jobId: number): boolean {
    return this.jobs.has(jobId);
  }

  /**
   * Evict stale active jobs (safety valve — prevents unbounded memory growth).
   * Called periodically by the cleanup interval.
   */
  evictStale(): void {
    const now = Date.now();
    for (const [jobId, entry] of Array.from(this.jobs.entries())) {
      if (!entry.isTerminal && now - entry.lastActivityAt > TTL_ACTIVE_MS) {
        if (entry.cleanupTimer) clearTimeout(entry.cleanupTimer);
        this.jobs.delete(jobId);
      }
    }
  }

  /** Visible for testing */
  get size(): number {
    return this.jobs.size;
  }

  /** Step C: Visible for testing — returns replay buffer for a job */
  getReplayBufferForTesting(jobId: number): ReplayEntry[] {
    return this.jobs.get(jobId)?.replayBuffer ?? [];
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _registry: CitationSSERegistry | null = null;

export function getCitationRegistry(): CitationSSERegistry {
  if (!_registry) {
    _registry = new CitationSSERegistry();
    // Evict stale active jobs every 10 minutes
    setInterval(() => _registry!.evictStale(), 10 * 60 * 1000).unref();
  }
  return _registry;
}

/** Reset singleton — for testing only */
export function _resetRegistryForTesting(): void {
  _registry = null;
}
