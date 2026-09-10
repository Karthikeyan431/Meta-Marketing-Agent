import { Prisma, type PrismaClient, type AdAccount } from "@prisma/client";
import { recordAuditEvent } from "../identity/audit.js";
import { AdAccountNotFoundError, AdAccountNotDiscoverableError } from "./errors.js";

/** True for Prisma's unique-constraint-violation error (P2002) — the concurrency guard for
 *  two simultaneous first-time selections of the same external account racing each other. */
function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

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

  return prisma.$transaction(async (tx) => {
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

      let row: AdAccount;
      if (existing) {
        row = await tx.adAccount.update({
          where: { id: existing.id },
          data: {
            ...updateData,
            ...(existing.status === "DESELECTED" ? { selectedAt: new Date() } : {}),
          },
        });
      } else {
        try {
          row = await tx.adAccount.create({
            data: { workspaceId: input.workspaceId, externalId, ...updateData },
          });
        } catch (error) {
          // A concurrent request won the race and created this row first (unique constraint
          // on workspaceId+externalId) — converge to updating that row rather than erroring,
          // so neither concurrent caller sees a spurious failure (test-matrix "Concurrency:
          // simultaneous selection of same account").
          if (!isUniqueConstraintViolation(error)) throw error;
          const winner = await tx.adAccount.findUniqueOrThrow({
            where: { workspaceId_externalId: { workspaceId: input.workspaceId, externalId } },
          });
          row = await tx.adAccount.update({ where: { id: winner.id }, data: updateData });
        }
      }

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
  });
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
