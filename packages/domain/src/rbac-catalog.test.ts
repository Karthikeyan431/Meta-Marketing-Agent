import { describe, expect, it } from "vitest";
import { PERMISSION_CATALOG, ROLES, roleHasPermission } from "./rbac-catalog.js";

describe("rbac-catalog", () => {
  it("has exactly the 27 permissions defined in rbac.md §3", () => {
    expect(PERMISSION_CATALOG).toHaveLength(27);
    const keys = new Set(PERMISSION_CATALOG.map((p) => p.key));
    expect(keys.size).toBe(PERMISSION_CATALOG.length); // no duplicate keys
  });

  it("grants workspace.read to every role", () => {
    for (const role of ROLES) {
      expect(roleHasPermission(role, "workspace.read")).toBe(true);
    }
  });

  it("grants workspace.delete to OWNER only", () => {
    expect(roleHasPermission("OWNER", "workspace.delete")).toBe(true);
    for (const role of ROLES.filter((r) => r !== "OWNER")) {
      expect(roleHasPermission(role, "workspace.delete")).toBe(false);
    }
  });

  it("denies VIEWER every mutation permission", () => {
    const mutationPermissions = PERMISSION_CATALOG.filter((p) => !p.key.endsWith(".read"));
    for (const permission of mutationPermissions) {
      expect(roleHasPermission("VIEWER", permission.key)).toBe(false);
    }
  });

  it("returns false for an unknown permission key rather than throwing", () => {
    expect(roleHasPermission("OWNER", "not.a.real.permission")).toBe(false);
  });

  describe("rbac.md §4 — the financial separation rule", () => {
    it("never implies budget.* from holding campaign.* (MANAGER holds campaign.update but not budget.approve/execute)", () => {
      expect(roleHasPermission("MANAGER", "campaign.update")).toBe(true);
      expect(roleHasPermission("MANAGER", "budget.approve")).toBe(false);
      expect(roleHasPermission("MANAGER", "budget.execute")).toBe(false);
    });

    it("ai.execute is deliberately narrower than campaign.update — MANAGER holds one but not the other", () => {
      expect(roleHasPermission("MANAGER", "campaign.update")).toBe(true);
      expect(roleHasPermission("MANAGER", "ai.execute")).toBe(false);
    });

    it("budget.approve/budget.execute are held only by OWNER and ADMIN", () => {
      for (const role of ["OWNER", "ADMIN"] as const) {
        expect(roleHasPermission(role, "budget.approve")).toBe(true);
        expect(roleHasPermission(role, "budget.execute")).toBe(true);
      }
      for (const role of ["MANAGER", "ANALYST", "VIEWER"] as const) {
        expect(roleHasPermission(role, "budget.approve")).toBe(false);
        expect(roleHasPermission(role, "budget.execute")).toBe(false);
      }
    });
  });
});
