import { Prisma } from "@prisma/client";

/**
 * Detects a Postgres unique-constraint violation (P2002), optionally scoped to a specific
 * column — used throughout identity/ to make the database's own unique constraint the
 * final, race-safe protection against duplicate provisioning (never a pre-check-then-insert
 * race alone).
 */
export function isUniqueConstraintViolation(error: unknown, field?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;
  if (!field) return true;

  const target = error.meta?.["target"];
  if (Array.isArray(target)) return target.includes(field);
  if (typeof target === "string") return target.includes(field);
  return true;
}

/** True for a Prisma error a concurrent-transaction retry can resolve: `P2002` (unique-
 *  constraint violation) or `P2034` (write conflict/deadlock — Postgres's own serialization-
 *  failure signal, which can surface at any point during or at commit of an interactive
 *  transaction, not only at the exact statement that logically raced — Prisma's own
 *  documented mitigation for P2034 is to retry the whole transaction). */
export function isRetryableConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

/**
 * Retries an entire transaction attempt on a concurrency conflict (see
 * `isRetryableConflict`) — each retry re-reads state fresh inside `attempt()`, so it
 * naturally converges once the other concurrent writer has committed, rather than assuming
 * which specific statement raced. Bounded so a genuine, non-transient failure still surfaces.
 * First introduced for Phase 3.2's `selectAdAccounts` (a real CI-caught concurrency defect —
 * see `phase-3-2-implementation-report.md` §11); centralized here for reuse by Phase 4.1's
 * sync writes and any future concurrent-write path, rather than re-duplicating it again.
 */
export async function withConflictRetry<T>(attempt: () => Promise<T>, maxAttempts = 5): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await attempt();
    } catch (error) {
      if (!isRetryableConflict(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}
