import type { PrismaClient, MetaSyncRun, SyncTriggerType } from "@prisma/client";

/**
 * A durable, queryable record of one sync pass (meta-sync.md §4's "every item must have an
 * explicit outcome" — this is the summary-level record; individual item failures are
 * additionally audited via `recordAuditEvent`, not stored per-item here, matching this
 * codebase's existing "don't audit/store every harmless success" discipline). `errorSummary`
 * is a normalized category only, never a raw Meta error body (meta-error-model.md §5).
 *
 * Doubles as the workspace/ad-account-scoped concurrency guard (meta-sync.md §6) —
 * `tryStartSyncRun` locks and checks for an already-`RUNNING` row for this ad account inside
 * one short transaction, so a manual trigger racing the scheduled job serializes rather than
 * corrupts state. Deliberately NOT one giant transaction spanning the whole sync pass — that
 * would hold a pooled DB connection/lock for the duration of many slow external Meta API
 * calls, which is its own kind of concurrency bug (pool exhaustion under load); the lock only
 * needs to be held for the instant of deciding "is a sync already in progress," not for the
 * sync itself. This is the "exact mechanism [as] a Phase 4.1 implementation decision"
 * meta-sync.md §6 explicitly leaves open.
 */

export interface StartSyncRunInput {
  workspaceId: string;
  adAccountId: string;
  triggerType: SyncTriggerType;
  correlationId?: string | null;
}

/** `null` means a sync for this ad account is already `RUNNING` — the caller must skip this
 *  attempt (log/audit it, never start a second concurrent pass over the same account). */
export async function tryStartSyncRun(
  prisma: PrismaClient,
  input: StartSyncRunInput,
): Promise<MetaSyncRun | null> {
  return prisma.$transaction(async (tx) => {
    // A Postgres advisory lock, not a row lock — `SELECT ... FOR UPDATE` cannot protect a
    // check against zero matching rows (there is nothing yet to lock the first time this ad
    // account is ever synced), which would let two concurrent transactions both see "no
    // running row" and both insert one. The advisory lock blocks a second concurrent
    // transaction until the first commits, so its own check-then-insert always sees the
    // first transaction's row. Held for the transaction's lifetime, released automatically
    // on commit/rollback — no manual unlock, no lock leaked on a crash.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('meta_sync_run'), hashtext(${input.adAccountId}))`;

    const running = await tx.metaSyncRun.findFirst({
      where: { adAccountId: input.adAccountId, status: "RUNNING" },
    });
    if (running) return null;

    return tx.metaSyncRun.create({
      data: {
        workspaceId: input.workspaceId,
        adAccountId: input.adAccountId,
        triggerType: input.triggerType,
        correlationId: input.correlationId ?? null,
      },
    });
  });
}

export interface CompleteSyncRunInput {
  syncRunId: string;
  campaignsSynced: number;
  adSetsSynced: number;
  adsSynced: number;
  itemsFailed: number;
}

/** Marks a run `SUCCEEDED` (zero failed items) or `PARTIAL` (at least one item failed but the
 *  run itself completed — meta-sync.md §4: "never collapse partial execution into an
 *  undifferentiated success"). */
export async function completeSyncRun(
  prisma: PrismaClient,
  input: CompleteSyncRunInput,
): Promise<MetaSyncRun> {
  return prisma.metaSyncRun.update({
    where: { id: input.syncRunId },
    data: {
      status: input.itemsFailed > 0 ? "PARTIAL" : "SUCCEEDED",
      campaignsSynced: input.campaignsSynced,
      adSetsSynced: input.adSetsSynced,
      adsSynced: input.adsSynced,
      itemsFailed: input.itemsFailed,
      completedAt: new Date(),
    },
  });
}

export async function failSyncRun(
  prisma: PrismaClient,
  syncRunId: string,
  errorSummary: string,
): Promise<MetaSyncRun> {
  return prisma.metaSyncRun.update({
    where: { id: syncRunId },
    data: { status: "FAILED", errorSummary, completedAt: new Date() },
  });
}

export async function listSyncRunsByWorkspace(
  prisma: PrismaClient,
  workspaceId: string,
  opts: { adAccountId?: string; limit?: number } = {},
): Promise<MetaSyncRun[]> {
  return prisma.metaSyncRun.findMany({
    where: { workspaceId, ...(opts.adAccountId ? { adAccountId: opts.adAccountId } : {}) },
    orderBy: { startedAt: "desc" },
    take: opts.limit ?? 20,
  });
}
