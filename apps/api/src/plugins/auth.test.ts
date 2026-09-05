import { describe, expect, it } from "vitest";
import type { FastifyRequest } from "fastify";
import { AuthenticationRequiredError, requireAuthenticatedIdentity } from "./auth.js";

function fakeRequest(authenticatedIdentity: { userId: string } | null): FastifyRequest {
  return { authenticatedIdentity } as unknown as FastifyRequest;
}

describe("requireAuthenticatedIdentity", () => {
  it("returns the identity when one was already resolved onto the request", () => {
    const identity = requireAuthenticatedIdentity(fakeRequest({ userId: "user_123" }));
    expect(identity).toEqual({ userId: "user_123" });
  });

  it("throws AuthenticationRequiredError (401) when no identity was resolved", () => {
    expect(() => requireAuthenticatedIdentity(fakeRequest(null))).toThrow(
      AuthenticationRequiredError,
    );
  });

  it("the thrown error carries statusCode 401, distinct from a future authorization failure", () => {
    try {
      requireAuthenticatedIdentity(fakeRequest(null));
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AuthenticationRequiredError);
      expect((error as AuthenticationRequiredError).statusCode).toBe(401);
    }
  });
});
