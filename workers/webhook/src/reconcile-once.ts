import { createClerkClient } from "@clerk/backend";
import { createLogger } from "@ai-marketing-manager/config";
import { disconnectDatabase, getPrismaClient } from "@ai-marketing-manager/domain";
import { loadWorkerEnv } from "./env.js";
import { reconcileIdentity } from "./reconcile.js";

/**
 * Manual, one-shot reconciliation trigger for local development / real-Clerk UAT (Step 13)
 * — runs the exact same `reconcileIdentity()` the scheduled BullMQ job runs, without
 * waiting for the configured interval or standing up a public webhook tunnel. Never run in
 * CI (requires a real CLERK_SECRET_KEY, per the Hard Restrictions).
 *
 * Usage: pnpm --filter @ai-marketing-manager/worker-webhook exec tsx src/reconcile-once.ts
 */
async function main() {
  const env = loadWorkerEnv();
  const logger = createLogger({
    serviceName: "worker-webhook-reconcile-once",
    level: env.LOG_LEVEL,
    pretty: true,
  });

  if (!env.CLERK_SECRET_KEY) {
    logger.error("CLERK_SECRET_KEY is not configured — nothing to reconcile against.");
    process.exitCode = 1;
    return;
  }

  const clerkClient = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
  const summary = await reconcileIdentity({ prisma: getPrismaClient(), clerkClient, logger });
  logger.info({ ...summary }, "manual clerk identity reconciliation completed");
}

main()
  .catch((error: unknown) => {
    console.error("Manual reconciliation failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
