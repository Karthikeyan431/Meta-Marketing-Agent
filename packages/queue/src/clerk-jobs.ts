import { z } from "zod";

/**
 * Job definitions for the "webhook" queue's Clerk identity-sync jobs — shared between the
 * producer (apps/api's POST /webhooks/clerk route) and the consumer (workers/webhook), so
 * job name/payload shape can never drift between the two processes. Mirrors the existing
 * example-job.ts pattern; not a new job-definition mechanism.
 */

export const CLERK_WEBHOOK_EVENT_JOB_NAME = "clerk-webhook-event";

export const clerkWebhookEventPayloadSchema = z.object({
  /** Clerk's own event ID (the `svix-id` header) — the idempotency key throughout
   *  identity-sync.md. Also used as the BullMQ jobId for a second layer of dedup. */
  eventId: z.string().min(1),
  eventType: z.string().min(1),
  /** The verified webhook payload's `data` field — shape varies by eventType; the worker
   *  narrows it per handler. Already signature-verified before this job is ever enqueued. */
  data: z.unknown(),
  correlationId: z.string().min(1).nullable().optional(),
});
export type ClerkWebhookEventPayload = z.infer<typeof clerkWebhookEventPayloadSchema>;

export const CLERK_RECONCILIATION_JOB_NAME = "clerk-reconciliation";

export const clerkReconciliationPayloadSchema = z.object({}).strict();
export type ClerkReconciliationPayload = z.infer<typeof clerkReconciliationPayloadSchema>;

/** Default reconciliation cadence — identity-sync.md §4 / ADR-021: every 30 minutes,
 *  configurable. */
export const DEFAULT_RECONCILIATION_INTERVAL_MS = 30 * 60 * 1000;

/** BullMQ repeatable-job key used to register/de-register the reconciliation schedule —
 *  kept stable so re-registering at every worker boot never creates a duplicate schedule. */
export const CLERK_RECONCILIATION_REPEAT_JOB_ID = "clerk-reconciliation-schedule";
