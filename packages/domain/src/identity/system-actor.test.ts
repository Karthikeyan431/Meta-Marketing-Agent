import { describe, expect, it } from "vitest";
import { assertSystemActorProvisioned, type SystemActorContext } from "./system-actor.js";
import { SystemActorNotProvisionedError } from "./errors.js";

function validContext(overrides: Partial<SystemActorContext> = {}): SystemActorContext {
  return {
    workspaceId: "11111111-1111-1111-1111-111111111111",
    systemActorId: "autonomous-optimization-guardrail",
    configuredByUserId: "22222222-2222-2222-2222-222222222222",
    grantedPermissions: ["campaign.pause"],
    ...overrides,
  };
}

describe("assertSystemActorProvisioned (OD-2.4A-01)", () => {
  it("accepts a fully-provisioned system actor context", () => {
    expect(() => assertSystemActorProvisioned(validContext())).not.toThrow();
  });

  it("rejects a missing workspaceId", () => {
    expect(() => assertSystemActorProvisioned(validContext({ workspaceId: "" }))).toThrow(
      SystemActorNotProvisionedError,
    );
  });

  it("rejects a missing systemActorId", () => {
    expect(() => assertSystemActorProvisioned(validContext({ systemActorId: "" }))).toThrow(
      SystemActorNotProvisionedError,
    );
  });

  it("rejects a missing configuredByUserId (accountability chain required)", () => {
    expect(() => assertSystemActorProvisioned(validContext({ configuredByUserId: "" }))).toThrow(
      SystemActorNotProvisionedError,
    );
  });

  it("rejects an empty grantedPermissions set — never implicit/ambient authority", () => {
    expect(() => assertSystemActorProvisioned(validContext({ grantedPermissions: [] }))).toThrow(
      SystemActorNotProvisionedError,
    );
  });

  it("does not throw a generic Error — callers can distinguish this from other failures", () => {
    try {
      assertSystemActorProvisioned(validContext({ grantedPermissions: [] }));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SystemActorNotProvisionedError);
      expect((error as SystemActorNotProvisionedError).code).toBe("SYSTEM_ACTOR_NOT_PROVISIONED");
    }
  });
});
