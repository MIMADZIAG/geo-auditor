/**
 * Citation SSE HTTP Handler
 * ─────────────────────────────────────────────────────────────────────────────
 * Registers GET /api/citation/stream/:jobId on the Express app.
 *
 * Protocol (W3C Server-Sent Events):
 *   - Content-Type: text/event-stream
 *   - Each message: "event: <type>\ndata: <JSON>\n\n"
 *   - Heartbeat every 15 s to prevent proxy/load-balancer timeouts
 *   - Terminal events ("done", "error") are followed by stream close
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
 *   2. If job is already terminal → send "done"/"error" from DB, close
 *   3. If job is active → subscribe to registry, stream events as they arrive
 *   4. Client disconnects → unsubscribe, clear heartbeat, no-op
 *
 * Reconnection (EventSource automatic retry):
 *   - "retry: 3000\n\n" hint sent on connect (3 s backoff)
 *   - "id: <seq>\n\n" on each event for Last-Event-ID resumption
 *     (full replay not implemented — client falls back to polling on reconnect)
 *
 * CORS:
 *   - Same-origin in production (Vite proxy in dev)
 *   - No explicit CORS headers needed; Express handles via existing middleware
 */

import type { Express, Request, Response } from "express";
import { getCitationRegistry } from "./sseRegistry";
import type { SSEEventType, SSEEventMap } from "./sseRegistry";
import { getDb } from "../db";
import { citationJobs } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── SSE wire format helpers ──────────────────────────────────────────────────

let globalSeq = 0;

function sendSSEEvent<T extends SSEEventType>(
  res: Response,
  event: T,
  payload: SSEEventMap[T],
): void {
  const id = ++globalSeq;
  const data = JSON.stringify(payload);
  // W3C SSE format: id, event, data, blank line
  res.write(`id: ${id}\nevent: ${event}\ndata: ${data}\n\n`);
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

    // ── 4. Handle already-terminal jobs ──────────────────────────────────────
    // If the job finished before the client connected (e.g., page refresh),
    // send a synthetic "done" or "error" event immediately and close.
    if (jobStatus === "completed" || jobStatus === "failed") {
      const registry = getCitationRegistry();
      if (!registry.isJobTerminal(jobId)) {
        // Registry was cleared (server restart) — synthesize terminal event from DB status
        if (jobStatus === "completed") {
          sendSSEEvent(res, "done", {
            jobId,
            summary: { chatgpt: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 }, google: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 }, perplexity: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 }, gemini: { cited: 0, domainCited: 0, total: 0, queriesWithAI: 0 } },
            foundCitation: false,
            totalQueriesChecked: 0,
            allCompetitorDomains: [],
          });
        } else {
          sendSSEEvent(res, "error", { jobId, message: "Job failed" });
        }
      }
      res.end();
      return;
    }

    // ── 5. Subscribe to live events ───────────────────────────────────────────
    const registry = getCitationRegistry();
    let isClosed = false;

    const subscription = registry.subscribe(jobId, (event, payload) => {
      if (isClosed) return;
      sendSSEEvent(res, event, payload as any);
      // Close stream after terminal events
      if (event === "done" || event === "error") {
        clearInterval(heartbeatTimer);
        isClosed = true;
        res.end();
      }
    });

    // ── 6. Heartbeat — prevent proxy/LB timeout (every 15 s) ─────────────────
    const heartbeatTimer = setInterval(() => {
      if (isClosed) {
        clearInterval(heartbeatTimer);
        return;
      }
      sendHeartbeat(res);
    }, 15_000);

    // ── 7. Client disconnect cleanup ──────────────────────────────────────────
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
