import { PrismaClient } from "@prisma/client";
import { PERMISSION_CATALOG } from "../src/rbac-catalog.js";

/**
 * Seeds the `permissions`/`role_permissions` tables from the single-source-of-truth
 * catalog in src/rbac-catalog.ts (which itself mirrors docs/identity/rbac.md §3).
 * Idempotent — safe to run against a database that already has these rows (every write is
 * an upsert), so it can run on every fresh CI database and every local `prisma migrate dev`.
 *
 * Never touches `users`/`workspaces`/`workspace_memberships` — no fixture identity data is
 * seeded, since Phase 2.3 creates those exclusively via real provisioning/sync flows.
 */
const prisma = new PrismaClient();

async function main() {
  for (const permission of PERMISSION_CATALOG) {
    const row = await prisma.permission.upsert({
      where: { key: permission.key },
      update: { resourceGroup: permission.resourceGroup },
      create: { key: permission.key, resourceGroup: permission.resourceGroup },
    });

    for (const role of permission.roles) {
      await prisma.rolePermission.upsert({
        where: { role_permissionId: { role, permissionId: row.id } },
        update: {},
        create: { role, permissionId: row.id },
      });
    }
  }

  // Prune role_permissions/permissions rows that no longer appear in the catalog, so a
  // permission removed from rbac.md doesn't linger as stale, queryable-but-wrong data.
  const catalogKeys = PERMISSION_CATALOG.map((p) => p.key);
  await prisma.permission.deleteMany({ where: { key: { notIn: catalogKeys } } });

  const permissionCount = await prisma.permission.count();
  const rolePermissionCount = await prisma.rolePermission.count();
  console.warn(
    `Seeded RBAC catalog: ${permissionCount} permissions, ${rolePermissionCount} role_permission rows.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error("RBAC catalog seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
