/**
 * useCitationStream — SSE client hook for Citation Intelligence
 * ─────────────────────────────────────────────────────────────────────────────
 * Replaces the 4-second polling interval with a real-time EventSource stream.
 *
 * Architecture (Stripe × Linear × Vercel reliability standards):
 *
 *  1. Progressive result accumulation — each "result" event is merged into
 *     local state immediately, enabling per-engine progressive disclosure.
 *
 *  2. Graceful fallback — if EventSource is unavailable (old browser, proxy
 *     that strips SSE) the hook falls back to the existing polling mechanism
 *     by returning `shouldFallbackToPolling: true`.
 *
 *  3. Reconnection with backoff — EventSource auto-reconnects on network
 *     drops. The hook tracks reconnect attempts and caps at MAX_RECONNECTS
 *     before falling back to polling.
 *
 *  4. Duplicate deduplication — results are keyed by `query+engine` to
 *     prevent double-rendering if a reconnect causes event replay.
 *
 *  5. Cleanup on unmount — EventSource is always closed to prevent memory
 *     leaks and dangling connections.
 *
 *  6. Backward compatibility — when `jobId` is null/undefined the hook
 *     is a no-op, preserving the existing idle state behavior.
 *
 * Usage:
 *   const { streamResults, progress, isDone, isError } = useCitationStream(jobId);
 */

import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types (mirror server/citation/sseRegistry.ts) ────────────────────────────

export interface StreamCitationResult {
  query: string;
  engine: "chatgpt" | "google" | "perplexity" | "gemini";
  round: number;
  isCited: "yes" | "domain" | "no";
  citedUrl?: string;
  domainCitedUrl?: string;
  allCitedUrls: string[];
  competitorDomains: string[];
  snippet?: string;
  responseText?: string;
  hasAIOverview?: boolean;
  fromCache?: boolean;
}

export interface StreamProgress {
  round: number;
  engine: string;
  queriesCompleted: number;
  queriesTotal: number;
}

export interface StreamDonePayload {
  jobId: number;
  summary: {
    chatgpt: { cited: number; domainCited: number; total: number; queriesWithAI: number };
    google: { cited: number; domainCited: number; total: number; queriesWithAI: number };
    perplexity: { cited: number; domainCited: number; total: number; queriesWithAI: number };
    gemini: { cited: number; domainCited: number; total: number; queriesWithAI: number };
  };
  foundCitation: boolean;
  totalQueriesChecked: number;
  allCompetitorDomains: { domain: string; count: number }[];
}

export type StreamStatus = "idle" | "connecting" | "streaming" | "done" | "error" | "fallback";

export interface UseCitationStreamResult {
  /** Accumulated citation results as they arrive — grows progressively */
  streamResults: StreamCitationResult[];
  /** Latest progress snapshot */
  progress: StreamProgress | null;
  /** Final summary emitted with "done" event */
  donePayload: StreamDonePayload | null;
  /** Current stream status */
  status: StreamStatus;
  /** True when job is complete (done or error) */
  isDone: boolean;
  /** True when job errored */
  isError: boolean;
  /** True when SSE is unavailable and caller should use polling fallback */
  shouldFallbackToPolling: boolean;
  /** Number of results received so far */
  resultCount: number;
  /** Manually close the stream (e.g., on component unmount) */
  close: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_RECONNECTS = 3;
const SSE_BASE_URL = "/api/citation/stream";

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCitationStream(
  jobId: number | null | undefined,
): UseCitationStreamResult {
  const [streamResults, setStreamResults] = useState<StreamCitationResult[]>([]);
  const [progress, setProgress] = useState<StreamProgress | null>(null);
  const [donePayload, setDonePayload] = useState<StreamDonePayload | null>(null);
  const [status, setStatus] = useState<StreamStatus>("idle");

  // Deduplication set: "query|engine" keys
  const seenKeys = useRef<Set<string>>(new Set());
  // EventSource instance ref — stable across renders
  const esRef = useRef<EventSource | null>(null);
  // Reconnect counter
  const reconnectCount = useRef(0);
  // Whether we've already reached a terminal state
  const isTerminal = useRef(false);

  const close = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }, []);

  useEffect(() => {
    // No jobId — stay idle
    if (!jobId) return;

    // Check EventSource availability (IE11, some corporate proxies)
    if (typeof EventSource === "undefined") {
      setStatus("fallback");
      return;
    }

    // Reset state for new job
    setStreamResults([]);
    setProgress(null);
    setDonePayload(null);
    setStatus("connecting");
    seenKeys.current = new Set();
    reconnectCount.current = 0;
    isTerminal.current = false;

    const url = `${SSE_BASE_URL}/${jobId}`;
    const es = new EventSource(url);
    esRef.current = es;

    // ── "result" event: per-engine citation result ────────────────────────────
    es.addEventListener("result", (e: MessageEvent) => {
      try {
        const result: StreamCitationResult = JSON.parse(e.data);
        const key = `${result.query}|${result.engine}`;
        if (seenKeys.current.has(key)) return; // dedup on reconnect
        seenKeys.current.add(key);
        setStreamResults((prev) => [...prev, result]);
        setStatus("streaming");
      } catch {
        // Malformed event — ignore, do not crash
      }
    });

    // ── "progress" event: lightweight counter update ──────────────────────────
    es.addEventListener("progress", (e: MessageEvent) => {
      try {
        const p: StreamProgress = JSON.parse(e.data);
        setProgress(p);
      } catch {
        // Ignore
      }
    });

    // ── "done" event: terminal — job completed successfully ───────────────────
    es.addEventListener("done", (e: MessageEvent) => {
      try {
        const payload: StreamDonePayload = JSON.parse(e.data);
        setDonePayload(payload);
        setStatus("done");
        isTerminal.current = true;
        es.close();
        esRef.current = null;
      } catch {
        setStatus("done");
        isTerminal.current = true;
        es.close();
        esRef.current = null;
      }
    });

    // ── "error" event: terminal — job failed ─────────────────────────────────
    es.addEventListener("error", (e: MessageEvent) => {
      // Note: this is the custom "error" SSE event, not the onerror handler
      setStatus("error");
      isTerminal.current = true;
      es.close();
      esRef.current = null;
    });

    // ── onerror: connection-level error (network drop, server restart) ────────
    es.onerror = () => {
      if (isTerminal.current) return; // already done — ignore stale error

      reconnectCount.current++;
      if (reconnectCount.current >= MAX_RECONNECTS) {
        // Too many reconnects — fall back to polling
        setStatus("fallback");
        es.close();
        esRef.current = null;
        return;
      }
      // EventSource will auto-reconnect after the retry interval (3s, set by server)
      // We stay in "streaming" status to avoid UI flicker on brief network hiccups
    };

    // ── Cleanup on unmount or jobId change ────────────────────────────────────
    return () => {
      es.close();
      esRef.current = null;
    };
  }, [jobId]);

  const isDone = status === "done";
  const isError = status === "error";
  const shouldFallbackToPolling = status === "fallback";

  return {
    streamResults,
    progress,
    donePayload,
    status,
    isDone,
    isError,
    shouldFallbackToPolling,
    resultCount: streamResults.length,
    close,
  };
}
