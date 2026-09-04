/**
 * The six logical workers defined in
 * docs/ai-marketing-manager-gate-2-docs/docs/03-architecture/WORKER_ARCHITECTURE.md
 * and confirmed by ADR-003-QUEUE-WORKERS.md. Phase 1 only stands up the queue
 * infrastructure and lifecycle pattern for each — real job processors (Meta sync,
 * insights ingestion, autonomous optimization, report generation, webhook
 * processing) are implemented in their respective later phases.
 */
export const QUEUE_NAMES = [
  "sync",
  "insights",
  "optimization",
  "report",
  "webhook",
  "maintenance",
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

export function isQueueName(value: string): value is QueueName {
  return (QUEUE_NAMES as readonly string[]).includes(value);
}
