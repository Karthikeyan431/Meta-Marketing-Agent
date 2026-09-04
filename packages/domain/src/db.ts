import { PrismaClient } from "@prisma/client";

let client: PrismaClient | undefined;

/** Singleton PrismaClient — avoids exhausting Postgres connections via repeated instantiation
 *  (a common Node/hot-reload foot-gun). Callers should import `getPrismaClient()`, never `new PrismaClient()`. */
export function getPrismaClient(): PrismaClient {
  client ??= new PrismaClient();
  return client;
}

export interface DbHealthResult {
  ok: boolean;
  latencyMs: number;
  message?: string;
}

/** Cheap, safe liveness probe: no schema/tables required, works even with zero business models. */
export async function checkDatabaseHealth(): Promise<DbHealthResult> {
  const prisma = getPrismaClient();
  const startedAt = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: performance.now() - startedAt };
  } catch (error) {
    return {
      ok: false,
      latencyMs: performance.now() - startedAt,
      message: error instanceof Error ? error.message : "Unknown database error",
    };
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}
