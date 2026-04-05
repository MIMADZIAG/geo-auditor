/**
 * rewriteSSEHandler
 * ─────────────────────────────────────────────────────────────────────────────
 * Express route handler for `GET /api/rewrite/stream/:jobId`.
 *
 * Implements the W3C Server-Sent Events specification:
 *   - `Content-Type: text/event-stream`
 *   - `Cache-Control: no-cache`
 *   - `X-Accel-Buffering: no`  (disables Nginx proxy buffering)
 *   - `retry: 3000\n\n` hint on connect
 *   - `id: <seq>\n\n` on every event for Last-Event-ID resumption
 *   - Heartbeat comment (`: heartbeat`) every 15 s to keep proxies alive
 *
 * Event contract (mirrors RewriteSSEPayload):
 *   event: step     — pipeline stage changed
 *   event: section  — one content section generated
 *   event: done     — rewrite complete
 *   event: error    — rewrite failed
 *
 * Step C — Last-Event-ID replay:
 *   When a client reconnects after a network interruption, the browser
 *   automatically sends the `Last-Event-ID` header with the seq of the last
 *   event it received. This handler:
 *     1. Parses the header value as an integer.
 *     2. Calls registry.getReplayBuffer(jobId, lastSeenSeq) to get all missed events.
 *     3. Replays them in order before subscribing to live events.
 *   This eliminates the "missed events during reconnect" window without
 *   requiring Redis or persistent storage.
 *
 * Late-connect handling:
 *   If the job is already terminal when the client connects, we replay the
 *   buffer (which includes the terminal event) and close immediately.
 *
 * @module rewriteSSEHandler
 */

import type { Request, Response } from "express";
import { rewriteSSERegistry } from "./rewriteSSERegistry";

// ─── Constants ─────────────────────────────────────────────────────────────────

const HEARTBEAT_INTERVAL_MS = 15_000;

// ─── Handler ───────────────────────────────────────────────────────────────────

export function rewriteSSEHandler(req: Request, res: Response): void {
  // ── 1. Parse and validate jobId ────────────────────────────────────────────
  const rawId = req.params["jobId"];
  const jobId = rawId ? parseInt(rawId, 10) : NaN;

  if (isNaN(jobId) || jobId <= 0) {
    res.status(400).json({ error: "Invalid jobId" });
    return;
  }

  // ── 2. SSE headers ─────────────────────────────────────────────────────────
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Nginx: disable proxy buffering
  res.flushHeaders();

  // ── 3. Retry hint ──────────────────────────────────────────────────────────
  res.write("retry: 3000\n\n");

  /** Write a named SSE event with the registry-assigned seq as id. */
  function sendEvent(eventName: string, data: unknown, seq: number): void {
    const payload = JSON.stringify(data);
    res.write(`id: ${seq}\nevent: ${eventName}\ndata: ${payload}\n\n`);
    // Flush immediately — critical for streaming through proxies
    if (typeof (res as any).flush === "function") {
      (res as any).flush();
    }
  }

  /** Write an SSE comment (heartbeat). Does not increment seq. */
  function sendHeartbeat(): void {
    res.write(": heartbeat\n\n");
    if (typeof (res as any).flush === "function") {
      (res as any).flush();
    }
  }

  // ── 4. Step C: Parse Last-Event-ID for replay ─────────────────────────────
  // The browser sends this header automatically on reconnect.
  // Value is the `id` field of the last event the client received.
  const lastEventIdHeader = req.headers["last-event-id"];
  const lastSeenSeq = lastEventIdHeader
    ? parseInt(String(lastEventIdHeader), 10) || 0
    : 0;

  // ── 5. Late-connect: job already terminal ──────────────────────────────────
  // If the job finished before the client connected (e.g., page refresh or
  // reconnect after completion), replay the buffer and close immediately.
  if (rewriteSSERegistry.has(jobId) && rewriteSSERegistry.isTerminal(jobId)) {
    const missed = rewriteSSERegistry.getReplayBuffer(jobId, lastSeenSeq);
    for (const entry of missed) {
      sendEvent(entry.event, entry.data, entry.seq);
    }
    // If buffer was empty (server restart cleared it), send synthetic done
    if (missed.length === 0) {
      sendEvent("done", { contentLength: 0, wasRevised: false, eeatScore: null }, Date.now());
    }
    res.end();
    return;
  }

  // ── 6. Step C: Replay missed events before subscribing to live stream ──────
  // This handles the reconnect window: events emitted between disconnect and
  // reconnect are replayed in order before the live subscription starts.
  // We must replay BEFORE subscribing to avoid duplicate delivery.
  if (rewriteSSERegistry.has(jobId) && lastSeenSeq > 0) {
    const missed = rewriteSSERegistry.getReplayBuffer(jobId, lastSeenSeq);
    for (const entry of missed) {
      sendEvent(entry.event, entry.data, entry.seq);
    }
    // If the job became terminal during replay, close the connection now
    if (rewriteSSERegistry.isTerminal(jobId)) {
      res.end();
      return;
    }
  }

  // ── 7. Job not yet registered (client connected before tRPC procedure ran) ─
  // Send a heartbeat and keep the connection open; the registry entry will
  // be created when the tRPC procedure starts (within ~100 ms).
  // If the job never appears, the client will reconnect via retry hint.
  if (!rewriteSSERegistry.has(jobId)) {
    sendHeartbeat();
  }

  // ── 8. Heartbeat timer ─────────────────────────────────────────────────────
  const heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

  // ── 9. Subscribe to registry events ───────────────────────────────────────
  // The listener receives (payload, seq) — seq is the registry-assigned
  // monotonic sequence number used as the SSE event id.
  const unsubscribe = rewriteSSERegistry.subscribe(jobId, (payload, seq) => {
    sendEvent(payload.event, payload.data, seq);

    // Close connection on terminal events
    if (payload.event === "done" || payload.event === "error") {
      cleanup();
    }
  });

  // ── 10. Cleanup on client disconnect ──────────────────────────────────────
  function cleanup(): void {
    clearInterval(heartbeatTimer);
    unsubscribe();
    if (!res.writableEnded) res.end();
  }

  req.on("close", cleanup);
  req.on("aborted", cleanup);
}
