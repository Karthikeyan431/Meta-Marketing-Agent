import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLogger } from "@ai-marketing-manager/config";
import { loadApiEnv } from "@ai-marketing-manager/api/env";
import { buildApp, type App } from "@ai-marketing-manager/api/app";

/**
 * Exercises the real API app (built the same way server.ts does) against real
 * PostgreSQL + Redis via Fastify's .inject(), with no port bound. Requires
 * DATABASE_URL / REDIS_URL to point at reachable instances — see
 * docs/implementation/local-development.md.
 */
describe("API health and readiness", () => {
  let app: App;

  beforeAll(async () => {
    const env = loadApiEnv();
    const logger = createLogger({ serviceName: "test-api", level: "silent" });
    app = await buildApp({ env, logger });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health returns 200 with a live timestamp and a request ID header", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-request-id"]).toBeTruthy();

    const body = response.json();
    expect(body.data.status).toBe("ok");
    expect(body.data.service).toBe("api");
    expect(new Date(body.data.timestamp).toString()).not.toBe("Invalid Date");
  });

  it("GET /ready returns 200 and ok when PostgreSQL and Redis are both reachable", async () => {
    const response = await app.inject({ method: "GET", url: "/ready" });

    const body = response.json();
    expect(body.data.checks.database.status).toBe("ok");
    expect(body.data.checks.redis.status).toBe("ok");
    expect(response.statusCode).toBe(200);
    expect(body.data.status).toBe("ok");
  });

  it("GET /unknown-route returns a standard 404 error envelope, not a bare 404", async () => {
    const response = await app.inject({ method: "GET", url: "/unknown-route" });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.requestId).toBeTruthy();
  });

  it("sets baseline security headers on every response", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });
});
