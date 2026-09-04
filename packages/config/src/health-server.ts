import { createServer, type Server } from "node:http";
import type { Logger } from "pino";

export interface HealthServerOptions {
  port: number;
  serviceName: string;
  logger: Logger;
  /** Returns whether this process is ready to do work (e.g. worker connected + listening). */
  isReady: () => boolean;
}

/**
 * Minimal dependency-free HTTP health/readiness server for processes that aren't a full
 * API (workers). GET /health always returns 200 while the process is alive; GET /ready
 * returns 200 only once `isReady()` is true, 503 otherwise — same liveness/readiness
 * split as the API (see apps/api/src/routes), just without a web framework.
 */
export function createHealthServer(options: HealthServerOptions): Server {
  const { port, serviceName, logger, isReady } = options;

  const server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ status: "ok", service: serviceName, timestamp: new Date().toISOString() }),
      );
      return;
    }
    if (url === "/ready") {
      const ready = isReady();
      res.writeHead(ready ? 200 : 503, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          status: ready ? "ok" : "unavailable",
          service: serviceName,
          timestamp: new Date().toISOString(),
        }),
      );
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { code: "NOT_FOUND", message: "Not found" } }));
  });

  server.listen(port, () => {
    logger.info({ port, service: serviceName }, "health server listening");
  });

  return server;
}
