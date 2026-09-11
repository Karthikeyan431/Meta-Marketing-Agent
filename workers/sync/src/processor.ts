import type { Job, Processor } from "bullmq";
import type { Logger } from "@ai-marketing-manager/config";
import {
  getPrismaClient,
  findMembership,
  findActiveOwnerMembership,
  findMetaConnectionByWorkspace,
  findAdAccountByWorkspace,
  listAllActiveAdAccountsForScheduledSync,
  decryptMetaConnectionCredential,
  recordConnectionHealthFailure,
  recordConnectionHealthSuccess,
  tryStartSyncRun,
  completeSyncRun,
  failSyncRun,
  syncAdAccountCampaignHierarchy,
  recordAuditEvent,
  roleHasPermission,
  assertSystemActorProvisioned,
  MetaApiError,
  type RoleName,
  type SystemActorContext,
} from "@ai-marketing-manager/domain";
import {
  META_SYNC_JOB_NAME,
  META_SYNC_SCHEDULER_JOB_NAME,
  metaSyncJobPayloadSchema,
  metaSyncSchedulerPayloadSchema,
  createQueue,
  type MetaSyncJobPayload,
} from "@ai-marketing-manager/queue";

export interface SyncProcessorDeps {
  logger: Logger;
  redisUrl: string;
  metaApiVersion: string;
  metaCredentialEncryptionKey: string | undefined;
}

/** `meta-error-model.md` §1 — the same classification `apps/api/src/routes/meta.ts` already
 *  uses for the callback, restated here since the worker has no route handler to share it
 *  with directly (both ultimately read the same `MetaApiError` shape). */
function classifySyncFailure(error: unknown): { kind: "auth" | "transient"; reason: string } {
  if (error instanceof MetaApiError) {
    if (error.httpStatus === 401 || error.metaErrorCode === 190) {
      return { kind: "auth", reason: "authentication_failed" };
    }
    if (error.httpStatus === 403) return { kind: "auth", reason: "authorization_failed" };
    if (error.httpStatus === 429) return { kind: "transient", reason: "rate_limited" };
    if (error.httpStatus >= 500) return { kind: "transient", reason: "provider_unavailable" };
    return { kind: "transient", reason: "invalid_parameter" };
  }
  return { kind: "transient", reason: "unknown_provider_failure" };
}

/**
 * The real per-ad-account sync job (docs/identity/worker-authorization-contract.md §3 —
 * every step below re-derives authorization fresh; nothing from the enqueue-time payload is
 * trusted beyond `workspaceId`/`adAccountId` as claims to be re-verified).
 */
async function processSyncJob(
  payload: MetaSyncJobPayload,
  deps: SyncProcessorDeps,
  correlationId: string,
): Promise<void> {
  const prisma = getPrismaClient();
  const logContext = { workspaceId: payload.workspaceId, adAccountId: payload.adAccountId };

  // Never a real credential in CI (Hard Restriction) — without it, no credential can ever be
  // decrypted, so this must be a hard no-op (never a retried failure — retrying a config
  // problem indefinitely, rather than skipping it, would just burn BullMQ attempts on
  // something no retry can fix), mirroring apps/api's metaOAuthConfig() gate.
  if (!deps.metaCredentialEncryptionKey) {
    deps.logger.warn(
      logContext,
      "meta sync job: META_CREDENTIAL_ENCRYPTION_KEY not configured — skipping",
    );
    return;
  }

  // Step 1 (worker-authorization-contract.md §3.1-2): re-resolve the initiating actor and
  // re-verify workspace membership/permission fresh — never trust the enqueue-time snapshot.
  if (payload.initiatingActor.kind === "user") {
    const membership = await findMembership(prisma, {
      userId: payload.initiatingActor.userId,
      workspaceId: payload.workspaceId,
    });
    if (
      !membership ||
      membership.status !== "ACTIVE" ||
      !roleHasPermission(membership.role as RoleName, "meta_connection.read")
    ) {
      deps.logger.warn(logContext, "meta sync job: authorization no longer holds — skipping");
      return;
    }
  } else {
    const owner = await findActiveOwnerMembership(prisma, payload.workspaceId);
    if (!owner) {
      deps.logger.warn(logContext, "meta sync job: workspace has no active OWNER — skipping");
      return;
    }
    // worker-authorization-contract.md §6: a system-triggered job's initiatingActor is a
    // SystemActorContext, fail-closed-checked, never implicit/ambient authority.
    const systemActorContext: SystemActorContext = {
      workspaceId: payload.workspaceId,
      systemActorId: "meta-sync-scheduler",
      configuredByUserId: owner.userId,
      grantedPermissions: ["meta_connection.read"],
    };
    assertSystemActorProvisioned(systemActorContext);
  }

  // Step 2 (worker-authorization-contract.md §3.3): re-verify the resources in scope still
  // belong to this workspace and are usable — never a bespoke "worker context is trusted"
  // shortcut.
  const adAccount = await findAdAccountByWorkspace(
    prisma,
    payload.workspaceId,
    payload.adAccountId,
  );
  if (!adAccount || adAccount.status !== "ACTIVE") {
    deps.logger.info(logContext, "meta sync job: ad account no longer active — skipping");
    return;
  }
  const connection = await findMetaConnectionByWorkspace(prisma, payload.workspaceId);
  // DEGRADED is deliberately still attempted, not skipped — meta-connection-health.md §7:
  // "recovery is automatic once ... a subsequent ... real call succeeds, requiring no user
  // action." A DEGRADED connection can only ever recover by a real call being attempted and
  // succeeding; skipping it here would make recovery impossible. REAUTH_REQUIRED and
  // DISCONNECTED genuinely cannot succeed without a human reconnecting first, so those are
  // still skipped rather than wastefully attempted.
  if (!connection || (connection.status !== "CONNECTED" && connection.status !== "DEGRADED")) {
    deps.logger.info(logContext, "meta sync job: connection not usable — skipping");
    return;
  }

  // Step 3: the concurrency guard (meta-sync.md §6) — never two concurrent passes over the
  // same ad account.
  const syncRun = await tryStartSyncRun(prisma, {
    workspaceId: payload.workspaceId,
    adAccountId: payload.adAccountId,
    triggerType: payload.triggerType,
    correlationId,
  });
  if (!syncRun) {
    deps.logger.info(
      logContext,
      "meta sync job: a sync is already running for this account — skipping",
    );
    return;
  }

  try {
    const accessToken = decryptMetaConnectionCredential(
      connection,
      deps.metaCredentialEncryptionKey,
    );
    const syncResult = await syncAdAccountCampaignHierarchy(prisma, {
      accessToken,
      apiVersion: deps.metaApiVersion,
      workspaceId: payload.workspaceId,
      adAccountId: payload.adAccountId,
      externalAdAccountId: adAccount.externalId,
    });

    await completeSyncRun(prisma, {
      syncRunId: syncRun.id,
      campaignsSynced: syncResult.campaignsSynced,
      adSetsSynced: syncResult.adSetsSynced,
      adsSynced: syncResult.adsSynced,
      itemsFailed: syncResult.itemsFailed,
    });
    await recordConnectionHealthSuccess(prisma, payload.workspaceId);

    if (syncResult.itemsFailed > 0) {
      await recordAuditEvent(prisma, {
        workspaceId: payload.workspaceId,
        actorType: "SYSTEM",
        actorId: "meta-sync-worker",
        eventType: "meta_sync.partial_failure",
        resourceType: "meta_sync_run",
        resourceId: syncRun.id,
        action: "sync",
        outcome: "FAILURE",
        correlationId,
        metadata: { itemsFailed: syncResult.itemsFailed },
      });
    }

    deps.logger.info({ ...logContext, ...syncResult }, "meta sync job completed");
  } catch (error) {
    const { kind, reason } = classifySyncFailure(error);
    await failSyncRun(prisma, syncRun.id, reason);
    await recordConnectionHealthFailure(prisma, {
      workspaceId: payload.workspaceId,
      kind,
      reason,
      correlationId,
    });
    await recordAuditEvent(prisma, {
      workspaceId: payload.workspaceId,
      actorType: "SYSTEM",
      actorId: "meta-sync-worker",
      eventType: "meta_sync.failed",
      resourceType: "meta_sync_run",
      resourceId: syncRun.id,
      action: "sync",
      outcome: "FAILURE",
      correlationId,
      metadata: { reason },
    });

    // Never blindly retry an authentication/permission failure (meta-adapter-contract.md §3,
    // meta-sync.md §4) — it will not succeed on retry until the connection is fixed.
    // Transient failures propagate so BullMQ's own backoff retries the whole (idempotent) job.
    if (kind === "auth") {
      deps.logger.warn(
        { ...logContext, reason },
        "meta sync job: auth-shaped failure, not retrying",
      );
      return;
    }
    throw error;
  }
}

/**
 * The workspace-independent enumeration step (worker-authorization-contract.md §5's
 * exception — enumerating is itself workspace-independent by nature; each *resulting*
 * `meta-sync` job is individually workspace-scoped, never a global mutation).
 */
async function processSchedulerJob(deps: SyncProcessorDeps): Promise<void> {
  const prisma = getPrismaClient();
  const accounts = await listAllActiveAdAccountsForScheduledSync(prisma);
  const queue = createQueue("sync", deps.redisUrl);

  for (const account of accounts) {
    const payload: MetaSyncJobPayload = {
      workspaceId: account.workspaceId,
      adAccountId: account.id,
      initiatingActor: { kind: "system" },
      triggerType: "SCHEDULED",
      correlationId: null,
    };
    await queue.add(META_SYNC_JOB_NAME, payload);
  }

  deps.logger.info(
    { count: accounts.length },
    "meta sync scheduler enqueued per-account sync jobs",
  );
}

/** Dispatches by job name (mirrors workers/webhook's pattern) — the "sync" queue carries
 *  both real per-account sync jobs and the scheduler's own enumeration pass. */
export function createSyncProcessor(deps: SyncProcessorDeps): Processor {
  return async (job: Job) => {
    if (job.name === META_SYNC_JOB_NAME) {
      const payload = metaSyncJobPayloadSchema.parse(job.data);
      return processSyncJob(payload, deps, job.id ?? "unknown");
    }

    if (job.name === META_SYNC_SCHEDULER_JOB_NAME) {
      metaSyncSchedulerPayloadSchema.parse(job.data);
      return processSchedulerJob(deps);
    }

    deps.logger.error(
      { queue: "sync", jobId: job.id, jobName: job.name },
      "unrecognized job name on sync worker",
    );
    throw new Error(`Unknown job name "${job.name}" for sync worker.`);
  };
}
