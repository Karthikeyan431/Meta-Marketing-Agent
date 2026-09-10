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
