/**
 * Citation SSE HTTP Handler
 * ─────────────────────────────────────────────────────────────────────────────
 * Registers GET /api/citation/stream/:jobId on the Express app.
 *
 * Protocol (W3C Server-Sent Events):
 *   - Content-Type: text/event-stream
 *   - Each message: "id: <seq>\nevent: <type>\ndata: <JSON>\n\n"
 *   - Heartbeat every 15 s to prevent proxy/load-balancer timeouts
 *   - Terminal events ("done", "error") are followed by stream close
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
 * Security:
 *   - jobId is validated as a positive integer
 *   - Job existence is verified against the DB before subscribing
 *   - No authentication required for SSE (job IDs are non-guessable UUIDs
 *     in most systems; here they are sequential ints but the audit flow
 *     already gates job creation behind auth). A future improvement would
 *     add a short-lived signed token per job.
 *
 * Connection lifecycle:
 *   1. Client connects → headers sent, heartbeat started
 *   2. If job is already terminal → replay buffer + close
 *   3. If job is active → replay missed events, then subscribe to live events
 *   4. Client disconnects → unsubscribe, clear heartbeat, no-op
 *
 * CORS:
 *   - Same-origin in production (Vite proxy in dev)
 *   - No explicit CORS headers needed; Express handles via existing middleware
 */

import type { Express, Request, Response } from "express";
import { getCitationRegistry } from "./sseRegistry";
import type { SSEEventType, SSEEventMap, ReplayEntry } from "./sseRegistry";
import { getDb } from "../db";
import { citationJobs } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── SSE wire format helpers ──────────────────────────────────────────────────

function sendSSEEvent<T extends SSEEventType>(
  res: Response,
  event: T,
  payload: SSEEventMap[T],
  seq: number,
): void {
  const data = JSON.stringify(payload);
  // W3C SSE format: id, event, data, blank line
  res.write(`id: ${seq}\nevent: ${event}\ndata: ${data}\n\n`);
  // Flush immediately — critical for streaming through proxies
  if (typeof (res as any).flush === "function") {
    (res as any).flush();
  }
}

function sendHeartbeat(res: Response): void {
  // SSE comment line — keeps connection alive through proxies
  res.write(": heartbeat\n\n");
  if (typeof (res as any).flush === "function") {
    (res as any).flush();
  }
}

// ─── Register route ───────────────────────────────────────────────────────────

export function registerCitationSSERoute(app: Express): void {
  app.get("/api/citation/stream/:jobId", async (req: Request, res: Response) => {
    // ── 1. Parse & validate jobId ─────────────────────────────────────────────
    const jobId = parseInt(req.params.jobId, 10);
    if (!Number.isFinite(jobId) || jobId <= 0) {
      res.status(400).json({ error: "Invalid jobId" });
      return;
    }

    // ── 2. Verify job exists in DB ────────────────────────────────────────────
    const db = await getDb();
    if (!db) {
      res.status(503).json({ error: "Database unavailable" });
      return;
    }
    const rows = await db
      .select({ id: citationJobs.id, status: citationJobs.status })
      .from(citationJobs)
      .where(eq(citationJobs.id, jobId))
      .limit(1);

    if (rows.length === 0) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const jobStatus = rows[0].status;

    // ── 3. Set SSE headers ────────────────────────────────────────────────────
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
    res.flushHeaders();

    // Retry hint: client should wait 3 s before reconnecting
    res.write("retry: 3000\n\n");

    // ── 4. Step C: Parse Last-Event-ID for replay ─────────────────────────────
    // The browser sends this header automatically on reconnect.
    // Value is the `id` field of the last event the client received.
    const lastEventIdHeader = req.headers["last-event-id"];
    const lastSeenSeq = lastEventIdHeader
      ? parseInt(String(lastEventIdHeader), 10) || 0
      : 0;

    const registry = getCitationRegistry();

    // ── 5. Handle already-terminal jobs ──────────────────────────────────────
    // If the job finished before the client connected (e.g., page refresh),
    // replay the buffer (which includes the terminal event) and close.
    if (jobStatus === "completed" || jobStatus === "failed") {
      if (registry.hasJob(jobId)) {
        // Replay all buffered events the client hasn't seen yet
        const missed = registry.getReplayBuffer(jobId, lastSeenSeq);
        for (const entry of missed) {
          sendSSEEvent(res, entry.event as SSEEventType, entry.payload as SSEEventMap[SSEEventType], entry.seq);
        }
      } else {
        // Registry was cleared (server restart) — synthesize terminal event from DB status
        const syntheticSeq = Date.now(); // stable enough for a synthetic event
        if (jobStatus === "completed") {
          sendSSEEvent(res, "done", {
            jobId,
            summary: { chatgpt: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 }, google: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 }, perplexity: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 }, gemini: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 } },
            foundCitation: false,
            totalQueriesChecked: 0,
            allCompetitorDomains: [],
          }, syntheticSeq);
        } else {
          sendSSEEvent(res, "error", { jobId, message: "Job failed" }, syntheticSeq);
        }
      }
      res.end();
      return;
    }

    // ── 6. Step C: Replay missed events before subscribing to live stream ─────
    // This handles the reconnect window: events emitted between disconnect and
    // reconnect are replayed in order before the live subscription starts.
    // We must replay BEFORE subscribing to avoid duplicate delivery.
    const missedEvents = registry.getReplayBuffer(jobId, lastSeenSeq);
    for (const entry of missedEvents) {
      sendSSEEvent(res, entry.event as SSEEventType, entry.payload as SSEEventMap[SSEEventType], entry.seq);
    }

    // If the job became terminal during replay (all events including done/error
    // were in the buffer), close the connection now.
    if (registry.isJobTerminal(jobId)) {
      res.end();
      return;
    }

    // ── 7. Subscribe to live events ───────────────────────────────────────────
    let isClosed = false;

    const subscription = registry.subscribe(jobId, (event, payload, seq) => {
      if (isClosed) return;
      sendSSEEvent(res, event, payload as any, seq);
      // Close stream after terminal events
      if (event === "done" || event === "error") {
        clearInterval(heartbeatTimer);
        isClosed = true;
        res.end();
      }
    });

    // ── 8. Heartbeat — prevent proxy/LB timeout (every 15 s) ─────────────────
    const heartbeatTimer = setInterval(() => {
      if (isClosed) {
        clearInterval(heartbeatTimer);
        return;
      }
      sendHeartbeat(res);
    }, 15_000);

    // ── 9. Client disconnect cleanup ──────────────────────────────────────────
    req.on("close", () => {
      isClosed = true;
      clearInterval(heartbeatTimer);
      subscription.unsubscribe();
    });

    req.on("error", () => {
      isClosed = true;
      clearInterval(heartbeatTimer);
      subscription.unsubscribe();
    });
  });
}
