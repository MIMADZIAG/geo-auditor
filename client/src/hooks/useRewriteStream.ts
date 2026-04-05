/**
 * useRewriteStream
 * ─────────────────────────────────────────────────────────────────────────────
 * React hook that subscribes to the Signal Rewrite SSE stream at
 * `/api/rewrite/stream/:jobId` and surfaces real-time pipeline progress.
 *
 * Design principles:
 *   - Zero polling: pure EventSource push model
 *   - Backward-compatible: returns idle state when jobId is null/undefined
 *   - Automatic reconnect with exponential backoff (3 s → 6 s → 12 s, max 30 s)
 *   - Graceful fallback: if SSE is unsupported or blocked, caller can fall back
 *     to tRPC mutation status (the mutation itself still returns the full result)
 *   - Memory-safe: EventSource is closed on unmount or when jobId changes
 *   - Deduplication: duplicate events (same step/section) are silently dropped
 *
 * Step C — Last-Event-ID tracking:
 *   The hook tracks the seq of the last received event via `lastSeenSeqRef`.
 *   The browser's EventSource API automatically sends this as the `Last-Event-ID`
 *   header on reconnect, and the server replays all missed events from its
 *   bounded ring buffer. The hook deduplicates replayed step/section events
 *   by comparing against the last seen step/section to avoid UI flicker.
 *
 * Event contract (mirrors RewriteSSEPayload):
 *   step     → pipeline stage changed (1–4)
 *   section  → one content section generated (current / total)
 *   done     → rewrite complete
 *   error    → rewrite failed
 *
 * @module useRewriteStream
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────────

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
  contentLength: number;
  wasRevised: boolean;
  eeatScore?: number | null;
}

export interface RewriteErrorEvent {
  message: string;
}

export type RewriteStreamStatus =
  | "idle"        // no jobId provided
  | "connecting"  // EventSource opened, waiting for first event
  | "streaming"   // at least one event received
  | "done"        // terminal "done" event received
  | "error"       // terminal "error" event received
  | "reconnecting"; // connection lost, attempting reconnect

export interface RewriteStreamState {
  status: RewriteStreamStatus;
  /** Current pipeline step (1–4), null if not yet received */
  currentStep: RewriteStepEvent | null;
  /** Latest section progress, null if not yet received */
  sectionProgress: RewriteSectionEvent | null;
  /** Terminal done event, null if not yet received */
  doneEvent: RewriteDoneEvent | null;
  /** Terminal error event, null if not yet received */
  errorEvent: RewriteErrorEvent | null;
  /** Whether SSE is supported in this browser */
  isSupported: boolean;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const INITIAL_RETRY_MS  = 3_000;
const MAX_RETRY_MS      = 30_000;
const RETRY_MULTIPLIER  = 2;

const INITIAL_STATE: RewriteStreamState = {
  status: "idle",
  currentStep: null,
  sectionProgress: null,
  doneEvent: null,
  errorEvent: null,
  isSupported: typeof EventSource !== "undefined",
};

// ─── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Subscribe to real-time rewrite pipeline progress via SSE.
 *
 * @param jobId  Numeric job ID returned by the `sandbox.rewrite` mutation's
 *               `streamJobId` field. Pass `null` or `undefined` to stay idle.
 *
 * @example
 * const streamJobId = useRef(Date.now()); // stable client-side ID
 * const stream = useRewriteStream(isRewriting ? streamJobId.current : null);
 *
 * // Pass streamJobId.current to the tRPC mutation:
 * rewriteMutation.mutate({ ..., streamJobId: streamJobId.current });
 */
export function useRewriteStream(
  jobId: number | null | undefined,
): RewriteStreamState {
  const [state, setState] = useState<RewriteStreamState>(INITIAL_STATE);

  // Stable ref for retry delay — survives re-renders without triggering effects
  const retryDelayRef  = useRef(INITIAL_RETRY_MS);
  const retryTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const esRef          = useRef<EventSource | null>(null);
  // Track whether we've reached a terminal state to prevent reconnects
  const isTerminalRef  = useRef(false);
  /**
   * Step C: Track the seq of the last received event.
   * The browser's EventSource API automatically sends this as the `Last-Event-ID`
   * header on reconnect, enabling the server to replay missed events.
   * This ref is used for deduplication of replayed step/section events.
   */
  const lastSeenSeqRef = useRef<number>(0);
  // Deduplication: track last seen step to avoid re-rendering the same step
  const lastStepRef    = useRef<number>(0);

  const cleanup = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!jobId) {
      setState(INITIAL_STATE);
      return;
    }

    if (!INITIAL_STATE.isSupported) {
      // SSE not available — caller should rely on tRPC mutation status
      setState(prev => ({ ...prev, status: "idle", isSupported: false }));
      return;
    }

    isTerminalRef.current = false;
    retryDelayRef.current = INITIAL_RETRY_MS;
    lastSeenSeqRef.current = 0;
    lastStepRef.current = 0;

    function connect(): void {
      cleanup();

      // EventSource automatically sends Last-Event-ID on reconnect based on
      // the `id:` field received in previous events. No manual header needed.
      const es = new EventSource(`/api/rewrite/stream/${jobId}`);
      esRef.current = es;

      setState(prev => ({
        ...prev,
        status: prev.status === "idle" ? "connecting" : "reconnecting",
      }));

      es.addEventListener("step", (e: MessageEvent) => {
        try {
          const data: RewriteStepEvent = JSON.parse(e.data);
          // Step C: update last seen seq
          if (e.lastEventId) {
            const seq = parseInt(e.lastEventId, 10);
            if (!isNaN(seq) && seq > lastSeenSeqRef.current) {
              lastSeenSeqRef.current = seq;
            }
          }
          // Dedup: skip if we already showed this step (replay scenario)
          if (data.step <= lastStepRef.current) return;
          lastStepRef.current = data.step;
          retryDelayRef.current = INITIAL_RETRY_MS; // reset backoff on success
          setState(prev => ({
            ...prev,
            status: "streaming",
            currentStep: data,
          }));
        } catch {
          // Malformed event — ignore
        }
      });

      es.addEventListener("section", (e: MessageEvent) => {
        try {
          const data: RewriteSectionEvent = JSON.parse(e.data);
          // Step C: update last seen seq
          if (e.lastEventId) {
            const seq = parseInt(e.lastEventId, 10);
            if (!isNaN(seq) && seq > lastSeenSeqRef.current) {
              lastSeenSeqRef.current = seq;
            }
          }
          setState(prev => {
            // Dedup: skip if this section is not newer than what we already have
            if (
              prev.sectionProgress &&
              data.current <= prev.sectionProgress.current
            ) {
              return prev;
            }
            return {
              ...prev,
              status: "streaming",
              sectionProgress: data,
            };
          });
        } catch {
          // Malformed event — ignore
        }
      });

      es.addEventListener("done", (e: MessageEvent) => {
        try {
          const data: RewriteDoneEvent = JSON.parse(e.data);
          if (e.lastEventId) {
            const seq = parseInt(e.lastEventId, 10);
            if (!isNaN(seq) && seq > lastSeenSeqRef.current) {
              lastSeenSeqRef.current = seq;
            }
          }
          isTerminalRef.current = true;
          setState(prev => ({
            ...prev,
            status: "done",
            doneEvent: data,
          }));
          cleanup();
        } catch {
          // Malformed event — still mark done
          isTerminalRef.current = true;
          setState(prev => ({ ...prev, status: "done" }));
          cleanup();
        }
      });

      es.addEventListener("error", (e: MessageEvent) => {
        try {
          const data: RewriteErrorEvent = JSON.parse(e.data);
          isTerminalRef.current = true;
          setState(prev => ({
            ...prev,
            status: "error",
            errorEvent: data,
          }));
          cleanup();
        } catch {
          // SSE connection error (not a payload error) — attempt reconnect
          // Step C: on reconnect, browser sends Last-Event-ID automatically,
          // server replays missed events, dedup prevents UI flicker.
          if (!isTerminalRef.current) {
            es.close();
            esRef.current = null;
            setState(prev => ({ ...prev, status: "reconnecting" }));

            const delay = retryDelayRef.current;
            retryDelayRef.current = Math.min(delay * RETRY_MULTIPLIER, MAX_RETRY_MS);

            retryTimerRef.current = setTimeout(connect, delay);
          }
        }
      });
    }

    connect();

    return cleanup;
  }, [jobId, cleanup]);

  return state;
}
