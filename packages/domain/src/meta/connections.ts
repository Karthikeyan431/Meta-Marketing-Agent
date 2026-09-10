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
