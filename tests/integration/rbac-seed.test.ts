import { describe, expect, it } from "vitest";
import { getPrismaClient, PERMISSION_CATALOG } from "@ai-marketing-manager/domain";

const prisma = getPrismaClient();

/**
 * Verifies the seeded `permissions`/`role_permissions` tables (prisma/seed.ts) exactly
 * match the in-code catalog (rbac-catalog.ts) — the drift-detection test
 * identity-data-model.md §1 calls for: "keeping code and documentation from drifting
 * apart." Requires `pnpm run db:seed` to have run against this database (CI does this
 * after migrate:deploy; local dev via `prisma migrate dev`'s auto-seed).
 */
describe("RBAC catalog ↔ database (rbac.md §3)", () => {
  it("the database's permission catalog matches PERMISSION_CATALOG exactly", async () => {
    const dbPermissions = await prisma.permission.findMany({
      select: { key: true, resourceGroup: true },
    });
    const dbKeys = new Set(dbPermissions.map((p) => p.key));
    const catalogKeys = new Set(PERMISSION_CATALOG.map((p) => p.key));

    expect(dbKeys).toEqual(catalogKeys);

    for (const permission of PERMISSION_CATALOG) {
      const dbRow = dbPermissions.find((p) => p.key === permission.key);
      expect(dbRow?.resourceGroup).toBe(permission.resourceGroup);
    }
  });

  it("the database's role→permission matrix matches PERMISSION_CATALOG exactly", async () => {
    for (const permission of PERMISSION_CATALOG) {
      const dbRow = await prisma.permission.findUnique({
        where: { key: permission.key },
        include: { rolePermissions: { select: { role: true } } },
      });
      expect(dbRow).not.toBeNull();

      const dbRoles = new Set(dbRow!.rolePermissions.map((rp) => rp.role));
      const catalogRoles = new Set(permission.roles);
      expect(dbRoles).toEqual(catalogRoles);
    }
  });
});
