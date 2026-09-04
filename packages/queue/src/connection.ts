import { Redis } from "ioredis";

let sharedConnection: Redis | undefined;

/**
 * Shared ioredis connection for all BullMQ Queues/Workers in a process.
 * `maxRetriesPerRequest: null` is required by BullMQ when a connection is shared
 * (see BullMQ docs — otherwise blocking commands used internally can time out queue jobs).
 *
 * Imported via ioredis's named `Redis` export (not the default export) — this file gets
 * typechecked under two different module resolution modes depending on which package's
 * tsconfig processes it (this package's own "Bundler" mode, and "NodeNext" from apps/
 * workers that depend on it), and the default-export interop for ioredis's CJS `export =`
 * typings behaves inconsistently between the two. The named export is resolution-mode-
 * agnostic and works identically under both.
 */
export function getRedisConnection(redisUrl: string): Redis {
  sharedConnection ??= new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  return sharedConnection;
}

export interface RedisHealthResult {
  ok: boolean;
  latencyMs: number;
  message?: string;
}

export async function checkRedisHealth(redisUrl: string): Promise<RedisHealthResult> {
  const connection = getRedisConnection(redisUrl);
  const startedAt = performance.now();
  try {
    const pong = await connection.ping();
    if (pong !== "PONG") {
      return {
        ok: false,
        latencyMs: performance.now() - startedAt,
        message: `Unexpected PING reply: ${pong}`,
      };
    }
    return { ok: true, latencyMs: performance.now() - startedAt };
  } catch (error) {
    return {
      ok: false,
      latencyMs: performance.now() - startedAt,
      message: error instanceof Error ? error.message : "Unknown Redis error",
    };
  }
}

export async function closeRedisConnection(): Promise<void> {
  if (sharedConnection) {
    await sharedConnection.quit();
    sharedConnection = undefined;
  }
}
