import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { runAndCacheHealthCheck } from "../citation/selectorHealth";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);

// ─── Google AI Overview Selector Health Monitor ───────────────────────────────
// Runs every 6 hours. Tests 5 fixed queries to verify CSS selectors still work.
// Sends immediate email alert to owner if selectors are broken or scraper is blocked.
const SELECTOR_HEALTH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Initial check: run 2 minutes after server start (let server warm up first)
setTimeout(() => {
  console.log("[SelectorHealth] Running initial health check (2min after startup)...");
  runAndCacheHealthCheck().catch((err) =>
    console.error("[SelectorHealth] Initial check failed:", err)
  );
}, 2 * 60 * 1000);

// Recurring check every 6 hours
setInterval(() => {
  console.log("[SelectorHealth] Running scheduled 6h health check...");
  runAndCacheHealthCheck().catch((err) =>
    console.error("[SelectorHealth] Scheduled check failed:", err)
  );
}, SELECTOR_HEALTH_INTERVAL_MS);

console.log("[SelectorHealth] Selector monitoring active — checks every 6h, initial check in 2min.");
