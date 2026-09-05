import { describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}));

describe("getAuthenticatedIdentity", () => {
  it("returns null when Clerk reports no signed-in user — never guesses an identity", async () => {
    authMock.mockResolvedValueOnce({ userId: null, getToken: vi.fn() });
    const { getAuthenticatedIdentity } = await import("./auth.js");

    const identity = await getAuthenticatedIdentity();
    expect(identity).toBeNull();
  });

  it("returns the Clerk userId and a token getter when signed in", async () => {
    const getToken = vi.fn().mockResolvedValue("a-session-token");
    authMock.mockResolvedValueOnce({ userId: "user_abc", getToken });
    const { getAuthenticatedIdentity } = await import("./auth.js");

    const identity = await getAuthenticatedIdentity();
    expect(identity).not.toBeNull();
    expect(identity?.userId).toBe("user_abc");
    await expect(identity?.getToken()).resolves.toBe("a-session-token");
  });
});
