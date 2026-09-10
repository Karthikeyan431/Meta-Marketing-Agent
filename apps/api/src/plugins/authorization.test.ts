import { describe, expect, it } from "vitest";
import type { WorkspaceMembership } from "@ai-marketing-manager/domain";
import {
  requirePermission,
  requireResourceAccess,
  AuthorizationError,
  ResourceNotFoundError,
} from "./authorization.js";

function fakeMembership(overrides: Partial<WorkspaceMembership> = {}): WorkspaceMembership {
  return {
    id: "membership-1",
    workspaceId: "workspace-1",
    userId: "user-1",
    role: "VIEWER",
    status: "ACTIVE",
    clerkSyncedAt: null,
    removedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as WorkspaceMembership;
}

describe("requirePermission (authorization.md §1, rbac.md §3)", () => {
  it("[privilege escalation] a VIEWER cannot perform an OWNER-only action", () => {
    const membership = fakeMembership({ role: "VIEWER" });
    expect(() => requirePermission(membership, "workspace.delete")).toThrow(AuthorizationError);
  });

  it("allows an action the role's permission set actually grants", () => {
    const membership = fakeMembership({ role: "OWNER" });
    expect(() => requirePermission(membership, "workspace.delete")).not.toThrow();
  });

  it("[privilege escalation] holding campaign.update never implies budget.approve (rbac.md §4)", () => {
    const membership = fakeMembership({ role: "MANAGER" });
    expect(() => requirePermission(membership, "campaign.update")).not.toThrow();
    expect(() => requirePermission(membership, "budget.approve")).toThrow(AuthorizationError);
  });

  it("thrown errors carry statusCode 403, mapped by error-handler.ts to AUTHORIZATION_ERROR", () => {
    const membership = fakeMembership({ role: "VIEWER" });
    try {
      requirePermission(membership, "workspace.delete");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorizationError);
      expect((error as AuthorizationError).statusCode).toBe(403);
      expect((error as AuthorizationError).code).toBe("AUTHORIZATION_ERROR");
    }
  });
});

describe("requireResourceAccess (authorization.md §2/§3 — the IDOR/BOLA rule)", () => {
  it("returns the resource when its workspaceId matches the authorized workspace", () => {
    const resource = { id: "r1", workspaceId: "workspace-1" };
    expect(requireResourceAccess(resource, "workspace-1")).toBe(resource);
  });

  it("[IDOR/BOLA] throws 404 (never 403) when the resource belongs to a different workspace", () => {
    const resource = { id: "r1", workspaceId: "workspace-OTHER" };
    expect(() => requireResourceAccess(resource, "workspace-1")).toThrow(ResourceNotFoundError);
  });

  it("throws the same 404 for a null resource — a nonexistent resource and a cross-tenant one are indistinguishable", () => {
    expect(() => requireResourceAccess(null, "workspace-1")).toThrow(ResourceNotFoundError);

    let crossTenantError: unknown;
    let missingError: unknown;
    try {
      requireResourceAccess({ id: "r1", workspaceId: "workspace-OTHER" }, "workspace-1");
    } catch (error) {
      crossTenantError = error;
    }
    try {
      requireResourceAccess(null, "workspace-1");
    } catch (error) {
      missingError = error;
    }
    expect((crossTenantError as ResourceNotFoundError).statusCode).toBe(
      (missingError as ResourceNotFoundError).statusCode,
    );
    expect((crossTenantError as ResourceNotFoundError).message).toBe(
      (missingError as ResourceNotFoundError).message,
    );
  });

  it("[mismatched resource/workspace pair] a resource whose workspaceId exists but doesn't match any authorized workspace the caller could plausibly claim still 404s", () => {
    // A caller "spoofing" workspace-2 (a real workspace elsewhere in the system) to reach a
    // resource that actually belongs to workspace-1 — the mismatch direction doesn't matter,
    // only whether resource.workspaceId equals the one AUTHORIZED value ever does.
    const resource = { id: "r1", workspaceId: "workspace-1" };
    expect(() => requireResourceAccess(resource, "workspace-2")).toThrow(ResourceNotFoundError);
  });

  it("workspace scope is the only thing checked — a resource's own lifecycle/status is a separate, caller-side concern", () => {
    // requireResourceAccess() is deliberately generic: it doesn't know about `status`,
    // `deletedAt`, or any other business field a specific resource type might carry. A
    // REMOVED membership still "belongs" to its workspace for this check's purposes —
    // callers that care whether a resource is soft-deleted/inactive must check that
    // separately (Phase 2.3's requireWorkspaceMembership() does this for Workspace.status,
    // for example). This test documents that boundary, not a gap.
    const removedMembership = fakeMembership({ status: "REMOVED" });
    expect(requireResourceAccess(removedMembership, "workspace-1")).toBe(removedMembership);
  });
});
