import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createLogger } from "@ai-marketing-manager/config";
import { loadApiEnv } from "@ai-marketing-manager/api/env";
import { buildApp, type App } from "@ai-marketing-manager/api/app";
import { getPrismaClient } from "@ai-marketing-manager/domain";
import { closeRedisConnection } from "@ai-marketing-manager/queue";

vi.mock("@clerk/backend/webhooks", () => ({
  verifyWebhook: vi.fn(),
}));

const TEST_SECRET_KEY = "test-fixture-secret-not-a-real-clerk-key";
const TEST_SIGNING_SECRET = "whsec_test_fixture_not_a_real_signing_secret";
const prisma = getPrismaClient();
const createdEventIds: string[] = [];

function testEventId(): string {
  const id = `msg_test_${randomUUID()}`;
  createdEventIds.push(id);
  return id;
}

/**
 * Phase 2.3 Step 5/12 — the webhook intake boundary: signature verification, idempotency
 * (threat #14 "replayed webhook"), and forgery rejection (threat #13). Never processes an
 * event inline — this only proves the intake contract; sync application logic is tested
 * separately (tests/integration/identity-sync.test.ts) and in
 * workers/webhook/src/apply-webhook-event.test.ts (mocked, unit-level).
 */
describe("POST /webhooks/clerk (identity-sync.md §2)", () => {
  let app: App;
  let appWithoutSigningSecret: App;
  let verifyWebhook: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    ({ verifyWebhook } = (await import("@clerk/backend/webhooks")) as unknown as {
      verifyWebhook: ReturnType<typeof vi.fn>;
    });

    const logger = createLogger({ serviceName: "test-api-webhooks", level: "silent" });

    app = await buildApp({
      env: loadApiEnv({
        ...process.env,
        CLERK_SECRET_KEY: TEST_SECRET_KEY,
        CLERK_WEBHOOK_SIGNING_SECRET: TEST_SIGNING_SECRET,
      }),
      logger,
    });
    await app.ready();

    appWithoutSigningSecret = await buildApp({
      env: loadApiEnv({
        ...process.env,
        CLERK_SECRET_KEY: TEST_SECRET_KEY,
        CLERK_WEBHOOK_SIGNING_SECRET: undefined,
      }),
      logger,
    });
    await appWithoutSigningSecret.ready();
  });

  afterEach(() => {
    verifyWebhook.mockReset();
  });

  afterAll(async () => {
    await app.close();
    await appWithoutSigningSecret.close();
    await prisma.clerkWebhookEvent.deleteMany({ where: { id: { in: createdEventIds } } });
    await closeRedisConnection();
  });

  it("returns 503 when no webhook signing secret is configured — never trusts an unverifiable payload", async () => {
    const response = await appWithoutSigningSecret.inject({
      method: "POST",
      url: "/webhooks/clerk",
      payload: { type: "user.created", data: {} },
    });

    expect(response.statusCode).toBe(503);
    expect(verifyWebhook).not.toHaveBeenCalled();
  });

  it("[webhook forgery] an invalid/unverifiable signature is rejected before any processing", async () => {
    verifyWebhook.mockRejectedValueOnce(new Error("signature mismatch"));
    const eventId = testEventId();

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/clerk",
      headers: { "svix-id": eventId, "svix-timestamp": "123", "svix-signature": "bad" },
      payload: { type: "user.created", data: { id: "user_forged" } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");

    // No envelope row was persisted for a rejected signature — verification happens
    // strictly before any durable state change.
    const row = await prisma.clerkWebhookEvent.findUnique({ where: { id: eventId } });
    expect(row).toBeNull();
  });

  it("a verified event is accepted, persisted, and enqueued", async () => {
    const eventId = testEventId();
    verifyWebhook.mockResolvedValueOnce({ type: "user.created", data: { id: "user_test_123" } });

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/clerk",
      headers: { "svix-id": eventId },
      payload: { type: "user.created", data: { id: "user_test_123" } },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.received).toBe(true);
    expect(body.data.duplicate).toBe(false);

    const row = await prisma.clerkWebhookEvent.findUnique({ where: { id: eventId } });
    expect(row).not.toBeNull();
    expect(row?.eventType).toBe("user.created");
    expect(row?.status).toBe("RECEIVED");
  });

  it("[webhook replay] a duplicate delivery of the same event ID is a no-op, not reprocessed", async () => {
    const eventId = testEventId();
    verifyWebhook.mockResolvedValue({ type: "user.updated", data: { id: "user_test_456" } });

    const first = await app.inject({
      method: "POST",
      url: "/webhooks/clerk",
      headers: { "svix-id": eventId },
      payload: { type: "user.updated", data: { id: "user_test_456" } },
    });
    expect(first.json().data.duplicate).toBe(false);

    const second = await app.inject({
      method: "POST",
      url: "/webhooks/clerk",
      headers: { "svix-id": eventId },
      payload: { type: "user.updated", data: { id: "user_test_456" } },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().data.duplicate).toBe(true);

    const rowCount = await prisma.clerkWebhookEvent.count({ where: { id: eventId } });
    expect(rowCount).toBe(1); // never double-persisted
  });

  it("rejects a request with no svix-id header even if the payload otherwise verifies", async () => {
    verifyWebhook.mockResolvedValueOnce({ type: "user.created", data: { id: "user_test_789" } });

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/clerk",
      payload: { type: "user.created", data: { id: "user_test_789" } },
    });

    expect(response.statusCode).toBe(400);
  });

  it("never leaks the configured secret key values in any response", async () => {
    verifyWebhook.mockRejectedValueOnce(new Error("bad signature"));
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/clerk",
      headers: { "svix-id": testEventId() },
      payload: { type: "user.created", data: {} },
    });
    expect(response.payload).not.toContain(TEST_SECRET_KEY);
    expect(response.payload).not.toContain(TEST_SIGNING_SECRET);
  });
});
