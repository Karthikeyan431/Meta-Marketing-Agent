import type { Prisma, PrismaClient, User } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export interface ProvisionUserInput {
  clerkUserId: string;
}

export interface SyncUserProfileInput {
  clerkUserId: string;
  email: string | null;
  displayName: string | null;
  syncedAt: Date;
}

export async function findUserByClerkId(db: Db, clerkUserId: string): Promise<User | null> {
  return db.user.findUnique({ where: { clerkUserId } });
}

export async function findUserById(db: Db, id: string): Promise<User | null> {
  return db.user.findUnique({ where: { id } });
}

/**
 * Application-user provisioning (Phase 2.3 Step 3): verify Clerk identity happens upstream
 * (apps/api's requireAuth()); this only ever resolves-or-creates our own `users` row keyed
 * by the verified `clerkUserId`. Idempotent and race-safe for concurrent first requests —
 * including when nested inside a caller's own transaction (`createWorkspaceWithOwner()`
 * calls `provisionUser(tx, ...)`).
 *
 * **Fixed twice during Phase 2.4** (found via real, intermittently-failing concurrency
 * tests, not just inspection — both fixes are load-bearing, neither alone was sufficient):
 *
 * 1. The original implementation used a `create()` + catch-unique-violation + refetch
 *    pattern. That is race-safe when `db` is the top-level `PrismaClient` (each statement is
 *    its own implicit transaction) — but not when `db` is a `Prisma.TransactionClient`
 *    nested inside a caller's own `$transaction`: Postgres aborts the *entire* transaction
 *    on the first statement error and refuses every subsequent command (`25P02`) until an
 *    explicit ROLLBACK, so the "refetch after catching the violation" query itself failed.
 * 2. Switching to Prisma's `upsert()` did not fully fix this either — under genuine
 *    concurrent load it was still observed to surface a raw, uncaught unique-constraint
 *    error rather than resolving silently (Prisma does not guarantee `upsert()` compiles to
 *    a single atomic `INSERT ... ON CONFLICT` statement in every case/version).
 *
 * The fix that actually holds under real concurrent load: a raw `INSERT ... ON CONFLICT
 * (clerk_user_id) DO NOTHING` — a single statement Postgres itself guarantees never raises a
 * client-visible constraint-violation error, safe both standalone and nested in any
 * transaction — followed by a normal typed fetch of the now-guaranteed-to-exist row. The
 * database's unique constraint remains the actual mechanism preventing a duplicate row;
 * `updated_at` is set explicitly since it has no database-level default (`@updatedAt` is
 * Prisma-client-managed only, invisible to raw SQL).
 */
export async function provisionUser(db: Db, input: ProvisionUserInput): Promise<User> {
  await db.$executeRaw`
    INSERT INTO users (clerk_user_id, updated_at)
    VALUES (${input.clerkUserId}, CURRENT_TIMESTAMP)
    ON CONFLICT (clerk_user_id) DO NOTHING
  `;
  return db.user.findUniqueOrThrow({ where: { clerkUserId: input.clerkUserId } });
}

/**
 * `user.updated`/`user.created` webhook + reconciliation sync (identity-sync.md §1) —
 * mirrors Clerk-sourced profile fields only, timestamp-guarded against out-of-order
 * delivery (identity-sync.md §3), and never overwrites application-only fields (none exist
 * yet in Phase 2.3, but this shape is what keeps that true later).
 */
export async function syncUserProfile(db: Db, input: SyncUserProfileInput): Promise<User> {
  const existing = await findUserByClerkId(db, input.clerkUserId);
  if (!existing) {
    return db.user.create({
      data: {
        clerkUserId: input.clerkUserId,
        email: input.email,
        displayName: input.displayName,
        clerkSyncedAt: input.syncedAt,
      },
    });
  }

  if (existing.clerkSyncedAt && input.syncedAt <= existing.clerkSyncedAt) {
    return existing; // stale/out-of-order event — no-op (identity-sync.md §3)
  }

  return db.user.update({
    where: { id: existing.id },
    data: { email: input.email, displayName: input.displayName, clerkSyncedAt: input.syncedAt },
  });
}

/**
 * `user.deleted` handling (identity-sync.md §5): soft-delete/anonymize the Clerk-sourced
 * profile fields while retaining the row and its ID, so historical audit/action
 * attribution referencing this user never becomes an orphaned/unattributable ghost.
 */
export async function softDeleteUser(db: Db, clerkUserId: string): Promise<User | null> {
  const existing = await findUserByClerkId(db, clerkUserId);
  if (!existing || existing.deletedAt) return existing;

  return db.user.update({
    where: { id: existing.id },
    data: { email: null, displayName: null, deletedAt: new Date() },
  });
}
