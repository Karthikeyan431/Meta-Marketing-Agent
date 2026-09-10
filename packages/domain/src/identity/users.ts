import type { Prisma, PrismaClient, User } from "@prisma/client";
import { isUniqueConstraintViolation } from "../prisma-errors.js";

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
 * tries `create`, and on a unique-constraint race with another concurrent first request,
 * refetches the row the other request just committed instead of erroring. The database's
 * own unique constraint on `clerk_user_id` is the final protection, not a pre-check.
 */
export async function provisionUser(db: Db, input: ProvisionUserInput): Promise<User> {
  const existing = await findUserByClerkId(db, input.clerkUserId);
  if (existing) return existing;

  try {
    return await db.user.create({ data: { clerkUserId: input.clerkUserId } });
  } catch (error) {
    if (isUniqueConstraintViolation(error, "clerk_user_id")) {
      const raced = await findUserByClerkId(db, input.clerkUserId);
      if (raced) return raced;
    }
    throw error;
  }
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
