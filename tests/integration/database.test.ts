import { afterAll, describe, expect, it } from "vitest";
import { checkDatabaseHealth, disconnectDatabase } from "@ai-marketing-manager/domain";

describe("PostgreSQL connectivity", () => {
  afterAll(async () => {
    await disconnectDatabase();
  });

  it("connects and executes a query against DATABASE_URL", async () => {
    const result = await checkDatabaseHealth();

    expect(result.ok).toBe(true);
    expect(result.message).toBeUndefined();
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
