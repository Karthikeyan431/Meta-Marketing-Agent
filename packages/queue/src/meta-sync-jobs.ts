import { z } from "zod";

/**
 * Job definitions for the "sync" queue's Meta campaign-hierarchy sync jobs (Phase 4.1) —
 * shared between the producer (apps/api's POST /workspaces/:id/meta/sync route, and the
 * scheduled-sync registration in workers/sync) and the consumer (workers/sync), so job name/
 * payload shape can never drift between the two processes. Mirrors clerk-jobs.ts's exact
 * pattern, not a new job-definition mechanism.
 */

export const META_SYNC_JOB_NAME = "meta-sync";

/**
 * The canonical worker-authorization-context payload (docs/identity/
 * worker-authorization-contract.md §2) — `initiatingActor` is either a human `userId` (a
 * manual `POST .../meta/sync` trigger) or `"system"` (the scheduled trigger; the worker
 * constructs the real `SystemActorContext` itself at execution time per §6, rather than
 * trusting a payload-supplied one — never accepted, per §2's "never accepted: a payload
 * field asserting ... already authorized").
 */
export const metaSyncJobPayloadSchema = z.object({
  workspaceId: z.string().min(1),
  adAccountId: z.string().min(1),
  initiatingActor: z.union([
    z.object({ kind: z.literal("user"), userId: z.string().min(1) }),
    z.object({ kind: z.literal("system") }),
  ]),
  triggerType: z.enum(["MANUAL", "SCHEDULED"]),
  correlationId: z.string().min(1).nullable().optional(),
});
export type MetaSyncJobPayload = z.infer<typeof metaSyncJobPayloadSchema>;

export const META_SYNC_SCHEDULER_JOB_NAME = "meta-sync-scheduler";

export const metaSyncSchedulerPayloadSchema = z.object({}).strict();
export type MetaSyncSchedulerPayload = z.infer<typeof metaSyncSchedulerPayloadSchema>;

/** Owner-decided default (OD-3A-06, `meta-sync.md` §3): 30 minutes, configurable. */
export const DEFAULT_META_SYNC_INTERVAL_MS = 30 * 60 * 1000;

/** BullMQ repeatable-job key — kept stable so re-registering at every worker boot never
 *  creates a duplicate schedule (mirrors CLERK_RECONCILIATION_REPEAT_JOB_ID exactly). */
export const META_SYNC_SCHEDULER_REPEAT_JOB_ID = "meta-sync-scheduler-schedule";
