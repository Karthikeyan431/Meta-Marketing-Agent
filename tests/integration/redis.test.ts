import { afterAll, describe, expect, it } from "vitest";
import { checkRedisHealth, closeRedisConnection } from "@ai-marketing-manager/queue";

const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";

describe("Redis connectivity", () => {
  afterAll(async () => {
    await closeRedisConnection();
  });

  it("connects and receives PONG from REDIS_URL", async () => {
    const result = await checkRedisHealth(REDIS_URL);

    expect(result.ok).toBe(true);
    expect(result.message).toBeUndefined();
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
