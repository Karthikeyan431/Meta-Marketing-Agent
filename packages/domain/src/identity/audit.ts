import type {
  AuditActorType,
  AuditOutcome,
  Prisma,
  PrismaClient,
  AuditEvent,
} from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export interface RecordAuditEventInput {
  workspaceId?: string | null;
  actorType: AuditActorType;
  /** Our internal User.id for USER actors; a stable descriptive string for
   *  SYSTEM/WEBHOOK/RECONCILIATION actors (e.g. "clerk-webhook"). */
  actorId?: string | null;
  eventType: string;
  resourceType?: string | null;
  resourceId?: string | null;
  action: string;
  outcome: AuditOutcome;
  correlationId?: string | null;
  /** Safe metadata only — never tokens, secrets, or full request/response payloads
   *  (AUDIT_LOGGING.md/SEC-012 "Never Log"). */
  metadata?: Record<string, unknown>;
}

/**
 * Identity/workspace lifecycle audit trail (identity-api-contracts.md §3, SEC-012's
 * required metadata) — the ONLY audit system this project has in Phase 2.3, scoped
 * deliberately to identity/workspace events; not a generic business-event audit log
 * (identity-data-model.md §3 defers that to whichever phase owns each resource type).
 */
export async function recordAuditEvent(db: Db, input: RecordAuditEventInput): Promise<AuditEvent> {
  return db.auditEvent.create({
    data: {
      workspaceId: input.workspaceId ?? null,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      eventType: input.eventType,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      action: input.action,
      outcome: input.outcome,
      correlationId: input.correlationId ?? null,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}
