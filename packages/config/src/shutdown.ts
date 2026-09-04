import type { Logger } from "pino";

export interface RunShutdownHandlersOptions {
  logger: Logger;
  handlers: Array<() => Promise<void>>;
  timeoutMs?: number;
}

export interface ShutdownResult {
  ok: boolean;
  timedOut: boolean;
  failureCount: number;
}

/**
 * Runs every shutdown handler concurrently, with a hard timeout so one hung handler can't
 * block shutdown forever. Pure orchestration logic with no process/signal side effects,
 * so it's directly unit-testable — see shutdown.test.ts. `registerGracefulShutdown` below
 * is the thin wrapper that actually hooks OS signals and calls `process.exit`.
 */
export async function runShutdownHandlers(
  options: RunShutdownHandlersOptions,
): Promise<ShutdownResult> {
  const { logger, handlers, timeoutMs = 10_000 } = options;

  const handlersSettled = Promise.allSettled(handlers.map((handler) => handler()));
  const timeoutMarker = Symbol("shutdown-timeout");
  const timeoutPromise = new Promise<typeof timeoutMarker>((resolve) => {
    const timer = setTimeout(() => resolve(timeoutMarker), timeoutMs);
    timer.unref();
  });

  const result = await Promise.race([handlersSettled, timeoutPromise]);

  if (result === timeoutMarker) {
    logger.error({ timeoutMs }, "graceful shutdown timed out");
    return { ok: false, timedOut: true, failureCount: handlers.length };
  }

  const settled = result as PromiseSettledResult<void>[];
  const failures = settled.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  for (const failure of failures) {
    logger.error({ err: String(failure.reason) }, "shutdown handler failed");
  }

  return { ok: failures.length === 0, timedOut: false, failureCount: failures.length };
}

export interface GracefulShutdownOptions {
  logger: Logger;
  handlers: Array<() => Promise<void>>;
  timeoutMs?: number;
  signals?: NodeJS.Signals[];
}

/**
 * Registers SIGTERM/SIGINT handlers that run all shutdown handlers before exiting.
 * Required by every long-running process (API, each worker) per
 * docs/ai-marketing-manager-gate-10-devops-docs/docs/11-devops/DEPLOYMENT_STRATEGY.md's
 * "graceful worker draining" / zero-downtime deployment requirement.
 */
export function registerGracefulShutdown(options: GracefulShutdownOptions): void {
  const { logger, handlers, timeoutMs, signals = ["SIGTERM", "SIGINT"] } = options;
  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "graceful shutdown starting");

    runShutdownHandlers({ logger, handlers, timeoutMs })
      .then((result) => {
        logger.info({ signal, ...result }, "graceful shutdown complete");
        process.exit(result.ok ? 0 : 1);
      })
      .catch((error: unknown) => {
        logger.error({ err: String(error) }, "unexpected error during shutdown");
        process.exit(1);
      });
  };

  for (const signal of signals) {
    process.on(signal, () => shutdown(signal));
  }
}
