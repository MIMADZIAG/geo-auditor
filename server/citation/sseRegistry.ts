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

// ─── Registry entry ───────────────────────────────────────────────────────────

interface RegistryEntry {
  emitter: EventEmitter;
  /** Timestamp of last activity — used for TTL eviction */
  lastActivityAt: number;
  /** Whether the job has reached a terminal state (done/error) */
  isTerminal: boolean;
  /** Cleanup timer handle */
  cleanupTimer: ReturnType<typeof setTimeout> | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** How long to keep a terminal job's emitter alive for late-connecting clients */
const TTL_AFTER_TERMINAL_MS = 5 * 60 * 1000; // 5 minutes

/** How long to keep an active job's emitter alive without any activity */
const TTL_ACTIVE_MS = 30 * 60 * 1000; // 30 minutes

/** Maximum number of listeners per emitter (prevents Node.js memory leak warning) */
const MAX_LISTENERS = 50;

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
   */
  emit<T extends SSEEventType>(jobId: number, event: T, payload: SSEEventMap[T]): void {
    const entry = this.ensureEntry(jobId);
    entry.lastActivityAt = Date.now();
    entry.emitter.emit(event, payload);

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
   * @param onEvent - Callback invoked for each event
   * @returns Object with unsubscribe() method
   */
  subscribe(
    jobId: number,
    onEvent: <T extends SSEEventType>(event: T, payload: SSEEventMap[T]) => void,
  ): { unsubscribe: () => void } {
    const entry = this.ensureEntry(jobId);

    // Typed handler wrappers — one per event type
    const handlers: Partial<Record<SSEEventType, (payload: any) => void>> = {
      result: (p: CitationResult) => onEvent("result", p),
      progress: (p: SSEProgressPayload) => onEvent("progress", p),
      done: (p: SSEDonePayload) => onEvent("done", p),
      error: (p: SSEErrorPayload) => onEvent("error", p),
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
