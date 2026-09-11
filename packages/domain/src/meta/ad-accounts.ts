import type { PrismaClient, AdAccount } from "@prisma/client";
import { recordAuditEvent } from "../identity/audit.js";
import { withConflictRetry } from "../prisma-errors.js";
import { AdAccountNotFoundError, AdAccountNotDiscoverableError } from "./errors.js";

/**
 * `GET /workspaces/:id/ad-accounts` (meta-api-contracts.md §1) — the persisted, previously-
 * selected accounts. Defaults to `ACTIVE` only (a deselected account is preserved for audit
 * history, not shown as currently authorized — meta-account-discovery.md §4).
 */
export async function listAdAccountsByWorkspace(
  prisma: PrismaClient,
  workspaceId: string,
  opts: { includeDeselected?: boolean } = {},
): Promise<AdAccount[]> {
  return prisma.adAccount.findMany({
    where: {
      workspaceId,
      ...(opts.includeDeselected ? {} : { status: "ACTIVE" }),
    },
    orderBy: { selectedAt: "asc" },
  });
}

/**
 * Every currently-`ACTIVE` selected Ad Account across every workspace — the one deliberate
 * workspace-independent enumeration in this module, used only by the scheduled sync's own
 * enumeration step (worker-authorization-contract.md §5's "workspace-independent job
 * exception": enumerating is itself workspace-independent by nature; each *resulting* sync
 * job is still individually workspace-scoped, never a global mutation). Never used to
 * authorize or scope an actual sync — each job re-derives its own `workspaceId` boundary.
 */
export async function listAllActiveAdAccountsForScheduledSync(
  prisma: PrismaClient,
): Promise<AdAccount[]> {
  return prisma.adAccount.findMany({ where: { status: "ACTIVE" } });
}

/** Resource-authorization lookup — `id` AND `workspaceId` in the same query
 * (authorization.md §2's mechanical IDOR/BOLA rule), never `id` alone. */
export async function findAdAccountByWorkspace(
  prisma: PrismaClient,
  workspaceId: string,
  adAccountId: string,
): Promise<AdAccount | null> {
  return prisma.adAccount.findFirst({ where: { id: adAccountId, workspaceId } });
}

export interface DiscoveredAdAccount {
  externalId: string;
  name: string;
  currency: string;
  timezone: string;
  accountStatus: string;
  businessExternalId: string | null;
  businessName: string | null;
}

export interface SelectAdAccountsInput {
  workspaceId: string;
  metaConnectionId: string;
  actorUserId: string;
  correlationId?: string | null;
  /** External IDs the client is requesting to select. */
  requestedExternalIds: string[];
  /** A FRESH discovery result set from the workspace's own authorized connection
   * (`meta-client.ts`'s `listAdAccounts`, called immediately before this) — the only trusted
   * source of account metadata; client-supplied name/currency/etc. is never accepted. */
  discovered: DiscoveredAdAccount[];
}

/**
 * Persists one or more selected Ad Accounts (meta-account-discovery.md §4, OD-3A-04's
 * multiple-accounts-per-connection decision). Re-selecting an already-`ACTIVE` account is
 * idempotent (metadata refreshed, no duplicate); re-selecting a previously-`DESELECTED`
 * account reactivates the same row (meta-account-discovery.md §3's "updates the existing
 * row... rather than creating a duplicate", applied to selection the same way it already
 * applies to reconnection). Throws `AdAccountNotDiscoverableError` if any requested external
 * ID was not present in the fresh `discovered` set — the mechanical defense against a
 * malicious/foreign external ID (meta-threat-model.md #7), checked before any row is
 * touched, atomically for the whole batch (BR-008: never report a partial success as
 * complete).
 */
export async function selectAdAccounts(
  prisma: PrismaClient,
  input: SelectAdAccountsInput,
): Promise<AdAccount[]> {
  const discoveredById = new Map(input.discovered.map((account) => [account.externalId, account]));
  const missing = input.requestedExternalIds.filter((id) => !discoveredById.has(id));
  if (missing.length > 0) {
    throw new AdAccountNotDiscoverableError(missing);
  }

  return withConflictRetry(() =>
    prisma.$transaction(async (tx) => {
      const results: AdAccount[] = [];

      for (const externalId of input.requestedExternalIds) {
        const account = discoveredById.get(externalId)!;
        const existing = await tx.adAccount.findUnique({
          where: { workspaceId_externalId: { workspaceId: input.workspaceId, externalId } },
        });

        const updateData = {
          metaConnectionId: input.metaConnectionId,
          name: account.name,
          currency: account.currency,
          timezone: account.timezone,
          accountStatus: account.accountStatus,
          businessExternalId: account.businessExternalId,
          businessName: account.businessName,
          status: "ACTIVE" as const,
          deselectedAt: null,
        };

        // Re-reading `existing` fresh at the top of every attempt (including retries — see
        // `withConflictRetry`) means a concurrent request that won the create-race is simply
        // found as `existing` on retry and updated cleanly, with no special-cased catch here.
        const row = existing
          ? await tx.adAccount.update({
              where: { id: existing.id },
              data: {
                ...updateData,
                ...(existing.status === "DESELECTED" ? { selectedAt: new Date() } : {}),
              },
            })
          : await tx.adAccount.create({
              data: { workspaceId: input.workspaceId, externalId, ...updateData },
            });

        await recordAuditEvent(tx, {
          workspaceId: input.workspaceId,
          actorType: "USER",
          actorId: input.actorUserId,
          eventType: "ad_account.selected",
          resourceType: "ad_account",
          resourceId: row.id,
          action: "select",
          outcome: "SUCCESS",
          correlationId: input.correlationId ?? null,
          metadata: { externalId },
        });

        results.push(row);
      }

      return results;
    }),
  );
}

export interface DeselectAdAccountInput {
  workspaceId: string;
  adAccountId: string;
  actorUserId: string;
  correlationId?: string | null;
}

/**
 * Human-initiated deselection (meta-account-discovery.md §4) — marks the row `DESELECTED`,
 * never deletes it, preserving audit/history (BR-018/OD-3A-05, the same rule already applied
 * to connection disconnect).
 */
export async function deselectAdAccount(
  prisma: PrismaClient,
  input: DeselectAdAccountInput,
): Promise<AdAccount> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.adAccount.findFirst({
      where: { id: input.adAccountId, workspaceId: input.workspaceId },
    });
    if (!existing) {
      throw new AdAccountNotFoundError();
    }

    const row = await tx.adAccount.update({
      where: { id: existing.id },
      data: { status: "DESELECTED", deselectedAt: new Date() },
    });

    await recordAuditEvent(tx, {
      workspaceId: input.workspaceId,
      actorType: "USER",
      actorId: input.actorUserId,
      eventType: "ad_account.deselected",
      resourceType: "ad_account",
      resourceId: row.id,
      action: "deselect",
      outcome: "SUCCESS",
      correlationId: input.correlationId ?? null,
    });

    return row;
  });
}
