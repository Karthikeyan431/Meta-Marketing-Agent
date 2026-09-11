import type { PrismaClient, MetaConnection } from "@prisma/client";
import { recordAuditEvent } from "../identity/audit.js";
import { encryptCredential, decryptCredential } from "./crypto.js";
import { MetaConnectionNotFoundError } from "./errors.js";

/**
 * `GET /workspaces/:id/meta/connections` / resource-authorization lookups
 * (meta-api-contracts.md §2). One connection per workspace (OD-3A-04).
 */
export async function findMetaConnectionByWorkspace(
  prisma: PrismaClient,
  workspaceId: string,
): Promise<MetaConnection | null> {
  return prisma.metaConnection.findUnique({ where: { workspaceId } });
}

export interface UpsertMetaConnectionInput {
  workspaceId: string;
  externalUserId: string;
  /** Plaintext long-lived Meta access token — encrypted inside this function, never
   *  persisted or logged in plaintext (meta-token-security.md §2). */
  accessToken: string;
  scopes: string[];
  tokenExpiresAt: Date | null;
  encryptionKey: string | undefined;
  actorUserId: string;
  correlationId?: string | null;
}

/**
 * Create-or-update-in-place (meta-connection-model.md §1/§4 — one row per workspace,
 * `connectionVersion` increments on every reconnection rather than creating a second row).
 * Writes the `meta_connection.connected`/`meta_connection.reconnected` audit event inside
 * the same transaction as the mutation (identical pattern to
 * `packages/domain/src/identity/memberships.ts`'s `changeMembershipRoleTx`).
 */
export async function upsertMetaConnection(
  prisma: PrismaClient,
  input: UpsertMetaConnectionInput,
): Promise<MetaConnection> {
  const encrypted = encryptCredential(input.accessToken, input.encryptionKey);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.metaConnection.findUnique({
      where: { workspaceId: input.workspaceId },
    });

    const connection = existing
      ? await tx.metaConnection.update({
          where: { workspaceId: input.workspaceId },
          data: {
            externalUserId: input.externalUserId,
            credentialCiphertext: encrypted.ciphertext,
            credentialIv: encrypted.iv,
            credentialAuthTag: encrypted.authTag,
            scopes: input.scopes,
            tokenExpiresAt: input.tokenExpiresAt,
            status: "CONNECTED",
            lastValidatedAt: new Date(),
            errorState: null,
            connectionVersion: { increment: 1 },
            disconnectedAt: null,
          },
        })
      : await tx.metaConnection.create({
          data: {
            workspaceId: input.workspaceId,
            externalUserId: input.externalUserId,
            credentialCiphertext: encrypted.ciphertext,
            credentialIv: encrypted.iv,
            credentialAuthTag: encrypted.authTag,
            scopes: input.scopes,
            tokenExpiresAt: input.tokenExpiresAt,
            status: "CONNECTED",
            lastValidatedAt: new Date(),
          },
        });

    await recordAuditEvent(tx, {
      workspaceId: input.workspaceId,
      actorType: "USER",
      actorId: input.actorUserId,
      eventType: existing ? "meta_connection.reconnected" : "meta_connection.connected",
      resourceType: "meta_connection",
      resourceId: connection.id,
      action: existing ? "reconnect" : "connect",
      outcome: "SUCCESS",
      correlationId: input.correlationId ?? null,
      metadata: { scopes: input.scopes, connectionVersion: connection.connectionVersion },
    });

    return connection;
  });
}

export interface DisconnectMetaConnectionInput {
  workspaceId: string;
  actorUserId: string;
  correlationId?: string | null;
}

/**
 * Human-initiated disconnect (meta-oauth.md §6). Credential material is actually deleted
 * (columns set to `null`), not merely marked inactive — OD-3A-05's binding engineering
 * rule ("credential material must be revoked/deleted promptly on disconnect"). The
 * connection row itself is preserved, never hard-deleted, so audit history and the
 * workspace's one-connection identity survive (BR-018).
 */
export async function disconnectMetaConnection(
  prisma: PrismaClient,
  input: DisconnectMetaConnectionInput,
): Promise<MetaConnection> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.metaConnection.findUnique({
      where: { workspaceId: input.workspaceId },
    });
    if (!existing) {
      throw new MetaConnectionNotFoundError();
    }

    const connection = await tx.metaConnection.update({
      where: { workspaceId: input.workspaceId },
      data: {
        status: "DISCONNECTED",
        disconnectedAt: new Date(),
        credentialCiphertext: null,
        credentialIv: null,
        credentialAuthTag: null,
      },
    });

    await recordAuditEvent(tx, {
      workspaceId: input.workspaceId,
      actorType: "USER",
      actorId: input.actorUserId,
      eventType: "meta_connection.disconnected",
      resourceType: "meta_connection",
      resourceId: connection.id,
      action: "disconnect",
      outcome: "SUCCESS",
      correlationId: input.correlationId ?? null,
    });

    return connection;
  });
}

export type ConnectionHealthFailureKind = "auth" | "transient";

/**
 * Reactive connection-health transition (meta-connection-health.md §2's "Reactive" path,
 * §3's DEGRADED-vs-REAUTH_REQUIRED distinction) — Phase 4.1's sync worker is the first real
 * caller. An auth-shaped failure (`kind: "auth"`) moves the connection to
 * `REAUTH_REQUIRED`; a transient failure (`kind: "transient"`) moves it to `DEGRADED` only
 * (never immediately to `REAUTH_REQUIRED`, per §3 — avoids notification noise for ordinary
 * provider hiccups). A `DISCONNECTED` connection is never resurrected by a failure (a human
 * must reconnect); a no-op transition (already at the target status) writes no redundant
 * audit event. Only the proactive scheduled health check (§2's other path) and user
 * notification (§4, product/UI scope) remain unbuilt — out of Phase 4.1's own scope.
 */
export async function recordConnectionHealthFailure(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    kind: ConnectionHealthFailureKind;
    /** A normalized failure category (`classifyMetaApiFailure`'s output) — never a raw Meta
     *  error body (meta-error-model.md §5). */
    reason: string;
    correlationId?: string | null;
  },
): Promise<MetaConnection | null> {
  const existing = await prisma.metaConnection.findUnique({
    where: { workspaceId: input.workspaceId },
  });
  if (!existing || existing.status === "DISCONNECTED") return existing;

  const newStatus = input.kind === "auth" ? "REAUTH_REQUIRED" : "DEGRADED";
  if (existing.status === newStatus) return existing;

  const connection = await prisma.metaConnection.update({
    where: { workspaceId: input.workspaceId },
    data: { status: newStatus, errorState: input.reason },
  });

  await recordAuditEvent(prisma, {
    workspaceId: input.workspaceId,
    actorType: "SYSTEM",
    actorId: "meta-sync-worker",
    eventType: "meta_connection.health_degraded",
    resourceType: "meta_connection",
    resourceId: connection.id,
    action: "health_transition",
    outcome: "SUCCESS",
    correlationId: input.correlationId ?? null,
    metadata: { previousStatus: existing.status, newStatus, reason: input.reason },
  });

  return connection;
}

/**
 * Records a successful real Meta API call (`lastSuccessfulApiCallAt`, distinct from
 * `lastValidatedAt` — a real operation, not just a health probe) and auto-recovers a
 * `DEGRADED` connection back to `CONNECTED` (meta-connection-health.md §7 — "recovery is
 * automatic... requiring no user action"). Never auto-recovers `REAUTH_REQUIRED` (a real
 * auth failure needs a real reconnect) or `DISCONNECTED`.
 */
export async function recordConnectionHealthSuccess(
  prisma: PrismaClient,
  workspaceId: string,
): Promise<MetaConnection | null> {
  const existing = await prisma.metaConnection.findUnique({ where: { workspaceId } });
  if (!existing || existing.status === "DISCONNECTED") return existing;

  const wasDegraded = existing.status === "DEGRADED";
  const connection = await prisma.metaConnection.update({
    where: { workspaceId },
    data: {
      lastSuccessfulApiCallAt: new Date(),
      ...(wasDegraded ? { status: "CONNECTED" as const, errorState: null } : {}),
    },
  });

  if (wasDegraded) {
    await recordAuditEvent(prisma, {
      workspaceId,
      actorType: "SYSTEM",
      actorId: "meta-sync-worker",
      eventType: "meta_connection.health_recovered",
      resourceType: "meta_connection",
      resourceId: connection.id,
      action: "health_transition",
      outcome: "SUCCESS",
      metadata: { previousStatus: "DEGRADED", newStatus: "CONNECTED" },
    });
  }

  return connection;
}

/**
 * Decrypts a connection's stored credential — only ever called from the Meta adapter layer
 * (meta-token-security.md §2's "only the Meta integration service" rule). Throws if the
 * connection has no stored credential (already disconnected).
 */
export function decryptMetaConnectionCredential(
  connection: Pick<MetaConnection, "credentialCiphertext" | "credentialIv" | "credentialAuthTag">,
  encryptionKey: string | undefined,
): string {
  if (
    !connection.credentialCiphertext ||
    !connection.credentialIv ||
    !connection.credentialAuthTag
  ) {
    throw new MetaConnectionNotFoundError(
      "This connection has no stored credential (already disconnected).",
    );
  }
  return decryptCredential(
    {
      ciphertext: connection.credentialCiphertext,
      iv: connection.credentialIv,
      authTag: connection.credentialAuthTag,
    },
    encryptionKey,
  );
}
