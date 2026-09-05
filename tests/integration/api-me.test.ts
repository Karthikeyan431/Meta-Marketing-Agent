import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createLogger } from "@ai-marketing-manager/config";
import { loadApiEnv } from "@ai-marketing-manager/api/env";
import { buildApp, type App } from "@ai-marketing-manager/api/app";

/**
 * @clerk/backend's verifyToken is mocked throughout — no real Clerk application or
 * network call is ever involved. This satisfies the governing task's explicit instruction
 * to use mocks/fixtures in CI rather than depend on a real production Clerk account.
 */
vi.mock("@clerk/backend", () => ({
  verifyToken: vi.fn(),
}));

const TEST_SECRET_KEY = "test-fixture-secret-not-a-real-clerk-key";

describe("API authentication boundary (Phase 2.2)", () => {
  let app: App;
  let verifyToken: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    ({ verifyToken } = (await import("@clerk/backend")) as unknown as {
      verifyToken: ReturnType<typeof vi.fn>;
    });

    // Injected directly so this test never depends on real environment configuration —
    // the value itself is a non-functional fixture, never used for a real verification
    // (verifyToken is mocked above).
    const env = loadApiEnv({ ...process.env, CLERK_SECRET_KEY: TEST_SECRET_KEY });
    const logger = createLogger({ serviceName: "test-api-auth", level: "silent" });
    app = await buildApp({ env, logger });
    await app.ready();
  });

  afterEach(() => {
    verifyToken.mockReset();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /me with no Authorization header returns 401 AUTHENTICATION_ERROR", async () => {
    const response = await app.inject({ method: "GET", url: "/me" });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.code).toBe("AUTHENTICATION_ERROR");
    expect(body.error.requestId).toBeTruthy();
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it("GET /me with an invalid/expired token returns 401, never a guessed identity", async () => {
    verifyToken.mockRejectedValueOnce(new Error("token expired"));

    const response = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: "Bearer not-a-real-token" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("AUTHENTICATION_ERROR");
  });

  it("GET /me with a valid token resolves the identity the token actually verifies to", async () => {
    verifyToken.mockResolvedValueOnce({ sub: "user_valid_123" });

    const response = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: "Bearer a-validly-signed-test-token" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.userId).toBe("user_valid_123");
    expect(verifyToken).toHaveBeenCalledWith(
      "a-validly-signed-test-token",
      expect.objectContaining({ secretKey: TEST_SECRET_KEY }),
    );
  });

  it("a client cannot spoof another user's identity via headers/body — only the verified token's subject is ever returned", async () => {
    verifyToken.mockResolvedValueOnce({ sub: "user_real_owner" });

    const response = await app.inject({
      method: "GET",
      url: "/me",
      headers: {
        authorization: "Bearer a-validly-signed-test-token",
        // A malicious/confused client claiming to be someone else — must be ignored.
        "x-user-id": "user_attacker",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.userId).toBe("user_real_owner");
  });

  it("never leaks the configured secret key value in a response body", async () => {
    verifyToken.mockResolvedValueOnce({ sub: "user_valid_123" });

    const response = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: "Bearer a-validly-signed-test-token" },
    });

    expect(response.payload).not.toContain(TEST_SECRET_KEY);
  });

  it("never leaks the configured secret key value in a 401 error response", async () => {
    const response = await app.inject({ method: "GET", url: "/me" });
    expect(response.payload).not.toContain(TEST_SECRET_KEY);
  });
});
