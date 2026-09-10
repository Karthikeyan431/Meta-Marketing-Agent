import type { FastifyInstance } from "fastify";
import {
  metaOAuthInitiationResponseSchema,
  listMetaConnectionsResponseSchema,
  disconnectMetaConnectionResponseSchema,
  listMetaBusinessesResponseSchema,
  listMetaAdAccountDiscoveryResponseSchema,
  listAdAccountsResponseSchema,
  selectAdAccountsRequestSchema,
  selectAdAccountsResponseSchema,
  deselectAdAccountResponseSchema,
  successEnvelope,
  errorEnvelope,
  type MetaConnectionSummary,
  type AdAccountSummary,
} from "@ai-marketing-manager/contracts";
import {
  getPrismaClient,
  findMembership,
  findMetaConnectionByWorkspace,
  upsertMetaConnection,
  disconnectMetaConnection,
  listAdAccountsByWorkspace,
  findAdAccountByWorkspace,
  selectAdAccounts,
  deselectAdAccount,
  decryptMetaConnectionCredential,
  recordAuditEvent,
  roleHasPermission,
  MetaConnectionNotFoundError,
  AdAccountNotFoundError,
  AdAccountNotDiscoverableError,
  type MetaConnection,
  type AdAccount,
  type RoleName,
} from "@ai-marketing-manager/domain";
import {
  requireAuth,
  requireWorkspaceMembership,
  requirePermission,
} from "../plugins/authorization.js";
import { validateBody } from "../plugins/validation.js";
import {
  buildMetaAuthorizationUrl,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  validateMetaToken,
  getMetaIdentity,
  listBusinesses,
  listAdAccounts,
  MetaApiError,
} from "../plugins/meta-client.js";
import { createOAuthState, consumeOAuthState } from "../plugins/meta-oauth-state.js";
import type { ApiEnv } from "../env.js";

export interface MetaRouteOptions {
  env: ApiEnv;
}

function toMetaConnectionSummary(connection: MetaConnection): MetaConnectionSummary {
  return {
    id: connection.id,
    status: connection.status,
    externalUserId: connection.externalUserId,
    scopes: connection.scopes,
    lastValidatedAt: connection.lastValidatedAt?.toISOString() ?? null,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
    disconnectedAt: connection.disconnectedAt?.toISOString() ?? null,
  };
}

function toAdAccountSummary(account: AdAccount): AdAccountSummary {
  return {
    id: account.id,
    externalId: account.externalId,
    name: account.name,
    currency: account.currency,
    timezone: account.timezone,
    accountStatus: account.accountStatus,
    businessExternalId: account.businessExternalId,
    businessName: account.businessName,
    status: account.status,
    selectedAt: account.selectedAt.toISOString(),
    deselectedAt: account.deselectedAt?.toISOString() ?? null,
    lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
  };
}

/** Every field Meta OAuth requires — never a real credential in CI (Hard Restriction).
 *  When any is absent, every Meta route responds 503 rather than falling back to any other
 *  trust mechanism. */
function metaOAuthConfig(env: ApiEnv):
  | {
      appId: string;
      appSecret: string;
      redirectUri: string;
      encryptionKey: string;
      apiVersion: string;
    }
  | undefined {
  if (
    !env.META_APP_ID ||
    !env.META_APP_SECRET ||
    !env.META_OAUTH_REDIRECT_URI ||
    !env.META_CREDENTIAL_ENCRYPTION_KEY
  ) {
    return undefined;
  }
  return {
    appId: env.META_APP_ID,
    appSecret: env.META_APP_SECRET,
    redirectUri: env.META_OAUTH_REDIRECT_URI,
    encryptionKey: env.META_CREDENTIAL_ENCRYPTION_KEY,
    apiVersion: env.META_API_VERSION,
  };
}

function sendNotConfigured(
  reply: { code: (n: number) => { send: (b: unknown) => void } },
  requestId: string,
) {
  reply
    .code(503)
    .send(errorEnvelope("PROVIDER_UNAVAILABLE", "Meta integration is not configured.", requestId));
}

/** `meta-error-model.md` §1 — maps a `MetaApiError` (or any unrecognized error) to an
 *  audited, normalized failure reason string. Never the raw Meta error body. */
function classifyMetaApiFailure(error: unknown): string {
  if (error instanceof MetaApiError) {
    if (error.httpStatus === 401 || error.metaErrorCode === 190) return "authentication_failed";
    if (error.httpStatus === 403) return "authorization_failed";
    if (error.httpStatus === 429) return "rate_limited";
    if (error.httpStatus >= 500) return "provider_unavailable";
    return "invalid_parameter";
  }
  return "unknown_provider_failure";
}

type DiscoveryPrereqFailure =
  { kind: "no_connection" } | { kind: "connection_not_usable"; status: string };

/** Resolves the workspace's own `MetaConnection` and decrypts its credential for a live
 *  discovery call — never accepts a client-supplied connection reference or token
 *  (meta-account-discovery.md §5, meta-threat-model.md #7). A missing or non-`CONNECTED`
 *  connection is reported, never silently substituted or retried against a stale token. */
async function resolveDiscoveryConnection(
  prisma: ReturnType<typeof getPrismaClient>,
  workspaceId: string,
  encryptionKey: string,
): Promise<{ connection: MetaConnection; accessToken: string } | DiscoveryPrereqFailure> {
  const connection = await findMetaConnectionByWorkspace(prisma, workspaceId);
  if (!connection) return { kind: "no_connection" };
  if (connection.status !== "CONNECTED") {
    return { kind: "connection_not_usable", status: connection.status };
  }
  const accessToken = decryptMetaConnectionCredential(connection, encryptionKey);
  return { connection, accessToken };
}

function sendDiscoveryPrereqFailure(
  reply: { code: (n: number) => { send: (b: unknown) => void } },
  requestId: string,
  failure: DiscoveryPrereqFailure,
) {
  if (failure.kind === "no_connection") {
    reply
      .code(404)
      .send(errorEnvelope("NOT_FOUND", "No Meta connection exists for this workspace.", requestId));
    return;
  }
  reply
    .code(409)
    .send(
      errorEnvelope(
        "CONFLICT",
        `The Meta connection is not currently usable (status: ${failure.status}).`,
        requestId,
      ),
    );
}

/** Maps a normalized Meta failure reason (`classifyMetaApiFailure`) to the client-facing
 *  status/envelope (meta-error-model.md §5 — never the raw Meta error body). */
function sendMetaApiFailure(
  reply: { code: (n: number) => { send: (b: unknown) => void } },
  requestId: string,
  reason: string,
) {
  if (reason === "rate_limited") {
    reply
      .code(429)
      .send(
        errorEnvelope("RATE_LIMITED", "Meta rate limit reached. Try again shortly.", requestId),
      );
    return;
  }
  reply
    .code(502)
    .send(errorEnvelope("PROVIDER_UNAVAILABLE", "The Meta discovery request failed.", requestId));
}

/**
 * Meta OAuth & connection lifecycle (Phase 3.1) + Business/Ad Account discovery and
 * selection (Phase 3.2, meta-api-contracts.md §1–2, meta-account-discovery.md). Every route
 * reuses the existing `requireAuth → requireWorkspaceMembership → requirePermission →
 * requireResourceAccess` chain unchanged — no competing authorization path. No campaign
 * sync, Insights, or webhook code (Phase 4/Phase 5) — see this file's own discovery routes'
 * doc comments for the exact Phase 3.2 boundary.
 */
export default async function metaRoute(app: FastifyInstance, opts: MetaRouteOptions) {
  app.post<{ Params: { id: string } }>("/workspaces/:id/meta/connect", async (request, reply) => {
    const user = await requireAuth(request);
    const { workspace, membership } = await requireWorkspaceMembership(user, request.params.id);
    requirePermission(membership, "meta_connection.connect");

    const config = metaOAuthConfig(opts.env);
    if (!config) return sendNotConfigured(reply, request.requestId);

    const prisma = getPrismaClient();
    const existing = await findMetaConnectionByWorkspace(prisma, workspace.id);
    if (existing && existing.status !== "DISCONNECTED") {
      reply
        .code(409)
        .send(
          errorEnvelope(
            "CONFLICT",
            "This workspace already has an active Meta connection. Use reconnect instead.",
            request.requestId,
          ),
        );
      return;
    }

    const state = await createOAuthState(opts.env.REDIS_URL, {
      userId: user.id,
      workspaceId: workspace.id,
    });
    const authorizationUrl = buildMetaAuthorizationUrl({
      appId: config.appId,
      redirectUri: config.redirectUri,
      state,
      apiVersion: config.apiVersion,
    });

    await recordAuditEvent(prisma, {
      workspaceId: workspace.id,
      actorType: "USER",
      actorId: user.id,
      eventType: "meta_connection.oauth_started",
      resourceType: "meta_connection",
      action: "connect",
      outcome: "SUCCESS",
      correlationId: request.requestId,
    });

    const body = metaOAuthInitiationResponseSchema.parse({ authorizationUrl });
    reply.code(200).send(successEnvelope(body, { requestId: request.requestId }));
  });

  app.get<{ Params: { id: string } }>(
    "/workspaces/:id/meta/connections",
    async (request, reply) => {
      const user = await requireAuth(request);
      const { workspace, membership } = await requireWorkspaceMembership(user, request.params.id);
      requirePermission(membership, "meta_connection.read");

      const prisma = getPrismaClient();
      const connection = await findMetaConnectionByWorkspace(prisma, workspace.id);
      const body = listMetaConnectionsResponseSchema.parse({
        connections: connection ? [toMetaConnectionSummary(connection)] : [],
      });
      reply.code(200).send(successEnvelope(body, { requestId: request.requestId }));
    },
  );

  app.post<{ Params: { id: string; connectionId: string } }>(
    "/workspaces/:id/meta/connections/:connectionId/reconnect",
    async (request, reply) => {
      const user = await requireAuth(request);
      const { workspace, membership } = await requireWorkspaceMembership(user, request.params.id);
      requirePermission(membership, "meta_connection.reconnect");

      const config = metaOAuthConfig(opts.env);
      if (!config) return sendNotConfigured(reply, request.requestId);

      const prisma = getPrismaClient();
      const existing = await findMetaConnectionByWorkspace(prisma, workspace.id);
      if (!existing || existing.id !== request.params.connectionId) {
        reply.code(404).send(errorEnvelope("NOT_FOUND", "Resource not found.", request.requestId));
        return;
      }

      const state = await createOAuthState(opts.env.REDIS_URL, {
        userId: user.id,
        workspaceId: workspace.id,
      });
      const authorizationUrl = buildMetaAuthorizationUrl({
        appId: config.appId,
        redirectUri: config.redirectUri,
        state,
        apiVersion: config.apiVersion,
      });

      await recordAuditEvent(prisma, {
        workspaceId: workspace.id,
        actorType: "USER",
        actorId: user.id,
        eventType: "meta_connection.oauth_started",
        resourceType: "meta_connection",
        resourceId: existing.id,
        action: "reconnect",
        outcome: "SUCCESS",
        correlationId: request.requestId,
      });

      const body = metaOAuthInitiationResponseSchema.parse({ authorizationUrl });
      reply.code(200).send(successEnvelope(body, { requestId: request.requestId }));
    },
  );

  app.delete<{ Params: { id: string; connectionId: string } }>(
    "/workspaces/:id/meta/connections/:connectionId",
    async (request, reply) => {
      const user = await requireAuth(request);
      const { workspace, membership } = await requireWorkspaceMembership(user, request.params.id);
      requirePermission(membership, "meta_connection.disconnect");

      const prisma = getPrismaClient();
      const existing = await findMetaConnectionByWorkspace(prisma, workspace.id);
      if (!existing || existing.id !== request.params.connectionId) {
        reply.code(404).send(errorEnvelope("NOT_FOUND", "Resource not found.", request.requestId));
        return;
      }
      if (existing.status === "DISCONNECTED") {
        reply
          .code(409)
          .send(
            errorEnvelope(
              "CONFLICT",
              "This connection is already disconnected.",
              request.requestId,
            ),
          );
        return;
      }

      try {
        const disconnected = await disconnectMetaConnection(prisma, {
          workspaceId: workspace.id,
          actorUserId: user.id,
          correlationId: request.requestId,
        });
        const body = disconnectMetaConnectionResponseSchema.parse({
          connection: toMetaConnectionSummary(disconnected),
        });
        reply.code(200).send(successEnvelope(body, { requestId: request.requestId }));
      } catch (error) {
        if (error instanceof MetaConnectionNotFoundError) {
          reply
            .code(404)
            .send(errorEnvelope("NOT_FOUND", "Resource not found.", request.requestId));
          return;
        }
        throw error;
      }
    },
  );

  /**
   * OAuth callback (meta-oauth.md §2, meta-api-contracts.md's authorization-chain table).
   * Deliberately **no `requireAuth()` chain** — this is a top-level browser redirect
   * initiated by Meta's server, not a same-origin fetch(), so it can never carry an
   * `Authorization: Bearer` header; requiring one here is unreachable by any real browser
   * and was a Phase 3.1 implementation defect caught only by real UAT (docs/meta/phase-3-1
   * -implementation-report.md's UAT addendum). Identical exception pattern to the
   * already-shipped `POST /webhooks/clerk`. The state payload — unpredictable, single-use,
   * short-TTL, bound to the initiating user+workspace at issuance (meta-oauth.md §3) — is
   * itself the authentication. No client-provided workspace/user/Meta-account ID is ever
   * trusted — the workspace and user come only from the server-held state payload, and the
   * membership/permission that authorized state issuance is re-verified fresh against the
   * database at callback time (ADR-028 "never trust a prior check, re-derive fresh"),
   * rejecting a membership revoked or downgraded between initiation and completion.
   */
  app.get<{
    Querystring: { state?: string; code?: string; error?: string };
  }>("/meta/oauth/callback", async (request, reply) => {
    const prisma = getPrismaClient();
    const { state, code, error } = request.query;

    async function auditFailure(reason: string, workspaceId?: string, actorUserId?: string) {
      await recordAuditEvent(prisma, {
        workspaceId: workspaceId ?? null,
        actorType: "USER",
        actorId: actorUserId ?? null,
        eventType: "meta_connection.oauth_failed",
        resourceType: "meta_connection",
        action: "connect",
        outcome: "FAILURE",
        correlationId: request.requestId,
        metadata: { reason },
      });
    }

    function redirectResult(status: "success" | "error", reason?: string) {
      const url = new URL("/app/meta/connect-result", opts.env.CORS_ORIGIN);
      url.searchParams.set("status", status);
      if (reason) url.searchParams.set("reason", reason);
      reply.redirect(url.toString());
    }

    if (error) {
      await auditFailure("oauth_denied_or_cancelled");
      redirectResult("error", "oauth_cancelled");
      return;
    }
    if (!state || !code) {
      await auditFailure("missing_state_or_code");
      redirectResult("error", "invalid_request");
      return;
    }

    const config = metaOAuthConfig(opts.env);
    if (!config) {
      await auditFailure("not_configured");
      redirectResult("error", "provider_unavailable");
      return;
    }

    // Single-use, short-lived, bound to the original user+workspace (meta-oauth.md §3).
    const statePayload = await consumeOAuthState(opts.env.REDIS_URL, state);
    if (!statePayload) {
      await auditFailure("invalid_or_expired_or_replayed_state");
      redirectResult("error", "invalid_state");
      return;
    }

    // Never trust the state payload alone as still-authorized — re-derive fresh, exactly
    // like every other mutation in this codebase (ADR-028's "never trust a prior check").
    // There is no request-time identity to compare against (see doc comment above); the
    // state payload's own `userId`/`workspaceId` — captured at issuance, when the caller
    // *was* freshly authenticated and authorized by `POST .../meta/connect` — is the only
    // identity this endpoint ever has, and re-verifying its membership/permission is still
    // live protects against it having been revoked since.
    const currentUserId = statePayload.userId;
    const freshMembership = await findMembership(prisma, {
      userId: currentUserId,
      workspaceId: statePayload.workspaceId,
    });
    if (
      !freshMembership ||
      freshMembership.status !== "ACTIVE" ||
      !roleHasPermission(freshMembership.role as RoleName, "meta_connection.connect")
    ) {
      await auditFailure(
        "wrong_workspace_or_insufficient_permission",
        statePayload.workspaceId,
        currentUserId,
      );
      redirectResult("error", "wrong_workspace");
      return;
    }

    let accessToken: string;
    let expiresInSeconds: number | undefined;
    try {
      const shortLived = await exchangeCodeForToken({
        appId: config.appId,
        appSecret: config.appSecret,
        redirectUri: config.redirectUri,
        code,
        apiVersion: config.apiVersion,
      });
      const longLived = await exchangeForLongLivedToken({
        appId: config.appId,
        appSecret: config.appSecret,
        shortLivedToken: shortLived.accessToken,
        apiVersion: config.apiVersion,
      });
      accessToken = longLived.accessToken;
      expiresInSeconds = longLived.expiresInSeconds;
    } catch (tokenError) {
      await auditFailure(
        `token_exchange_failed:${classifyMetaApiFailure(tokenError)}`,
        statePayload.workspaceId,
        currentUserId,
      );
      redirectResult("error", "token_exchange_failed");
      return;
    }

    let debugInfo;
    try {
      debugInfo = await validateMetaToken({
        inputToken: accessToken,
        appId: config.appId,
        appSecret: config.appSecret,
        apiVersion: config.apiVersion,
      });
    } catch (validationError) {
      await auditFailure(
        `token_validation_failed:${classifyMetaApiFailure(validationError)}`,
        statePayload.workspaceId,
        currentUserId,
      );
      redirectResult("error", "token_validation_failed");
      return;
    }
    if (!debugInfo.isValid || debugInfo.appId !== config.appId) {
      await auditFailure(
        "token_validation_failed:invalid_token",
        statePayload.workspaceId,
        currentUserId,
      );
      redirectResult("error", "token_validation_failed");
      return;
    }

    const requiredGrantedScopes = ["ads_read", "ads_management", "business_management"];
    const missingScopes = requiredGrantedScopes.filter((s) => !debugInfo.scopes.includes(s));
    if (missingScopes.length > 0) {
      await auditFailure(
        `insufficient_permission:${missingScopes.join(",")}`,
        statePayload.workspaceId,
        currentUserId,
      );
      redirectResult("error", "insufficient_permission");
      return;
    }

    let identity;
    try {
      identity = await getMetaIdentity({ accessToken, apiVersion: config.apiVersion });
    } catch (identityError) {
      await auditFailure(
        `identity_lookup_failed:${classifyMetaApiFailure(identityError)}`,
        statePayload.workspaceId,
        currentUserId,
      );
      redirectResult("error", "identity_lookup_failed");
      return;
    }

    await upsertMetaConnection(prisma, {
      workspaceId: statePayload.workspaceId,
      externalUserId: identity.id,
      accessToken,
      scopes: debugInfo.scopes,
      tokenExpiresAt: expiresInSeconds ? new Date(Date.now() + expiresInSeconds * 1000) : null,
      encryptionKey: config.encryptionKey,
      actorUserId: currentUserId,
      correlationId: request.requestId,
    });

    redirectResult("success");
  });

  /**
   * Business discovery (Phase 3.2, meta-account-discovery.md §2/§5). A live, ephemeral read
   * through the workspace's own authorized connection — never persisted (only a selected Ad
   * Account is ever written to the database). `meta_connection.read` (already seeded,
   * ALL_ROLES) — reuses the exact permission `meta-account-discovery.md` §5 specifies for
   * every `GET`-shaped discovery call, no new permission introduced.
   */
  app.get<{ Params: { id: string } }>("/workspaces/:id/meta/businesses", async (request, reply) => {
    const user = await requireAuth(request);
    const { workspace, membership } = await requireWorkspaceMembership(user, request.params.id);
    requirePermission(membership, "meta_connection.read");

    const config = metaOAuthConfig(opts.env);
    if (!config) return sendNotConfigured(reply, request.requestId);

    const prisma = getPrismaClient();
    const resolved = await resolveDiscoveryConnection(prisma, workspace.id, config.encryptionKey);
    if ("kind" in resolved) {
      sendDiscoveryPrereqFailure(reply, request.requestId, resolved);
      return;
    }

    try {
      const businesses = await listBusinesses({
        accessToken: resolved.accessToken,
        apiVersion: config.apiVersion,
      });
      const body = listMetaBusinessesResponseSchema.parse({
        businesses: businesses.map((b) => ({
          id: b.id,
          name: b.name,
          verificationStatus: b.verificationStatus,
        })),
      });
      reply.code(200).send(successEnvelope(body, { requestId: request.requestId }));
    } catch (error) {
      const reason = classifyMetaApiFailure(error);
      await recordAuditEvent(prisma, {
        workspaceId: workspace.id,
        actorType: "USER",
        actorId: user.id,
        eventType: "meta_business_discovery.failed",
        resourceType: "meta_connection",
        resourceId: resolved.connection.id,
        action: "discover_businesses",
        outcome: "FAILURE",
        correlationId: request.requestId,
        metadata: { reason },
      });
      sendMetaApiFailure(reply, request.requestId, reason);
    }
  });

  /**
   * Ad Account discovery (Phase 3.2, meta-account-discovery.md §2/§5) — same live/ephemeral
   * shape as business discovery above. `alreadySelected` is computed against this
   * workspace's own persisted `AdAccount` rows so the client can render current selection
   * state without a second round trip.
   */
  app.get<{ Params: { id: string } }>(
    "/workspaces/:id/meta/ad-accounts",
    async (request, reply) => {
      const user = await requireAuth(request);
      const { workspace, membership } = await requireWorkspaceMembership(user, request.params.id);
      requirePermission(membership, "meta_connection.read");

      const config = metaOAuthConfig(opts.env);
      if (!config) return sendNotConfigured(reply, request.requestId);

      const prisma = getPrismaClient();
      const resolved = await resolveDiscoveryConnection(prisma, workspace.id, config.encryptionKey);
      if ("kind" in resolved) {
        sendDiscoveryPrereqFailure(reply, request.requestId, resolved);
        return;
      }

      try {
        const [discovered, selected] = await Promise.all([
          listAdAccounts({ accessToken: resolved.accessToken, apiVersion: config.apiVersion }),
          listAdAccountsByWorkspace(prisma, workspace.id),
        ]);
        const selectedExternalIds = new Set(selected.map((a) => a.externalId));
        const body = listMetaAdAccountDiscoveryResponseSchema.parse({
          adAccounts: discovered.map((account) => ({
            externalId: account.id,
            name: account.name,
            currency: account.currency,
            timezone: account.timezoneName,
            accountStatus: account.accountStatus,
            businessExternalId: account.business?.id ?? null,
            businessName: account.business?.name ?? null,
            alreadySelected: selectedExternalIds.has(account.id),
          })),
        });
        reply.code(200).send(successEnvelope(body, { requestId: request.requestId }));
      } catch (error) {
        const reason = classifyMetaApiFailure(error);
        await recordAuditEvent(prisma, {
          workspaceId: workspace.id,
          actorType: "USER",
          actorId: user.id,
          eventType: "meta_ad_account_discovery.failed",
          resourceType: "meta_connection",
          resourceId: resolved.connection.id,
          action: "discover_ad_accounts",
          outcome: "FAILURE",
          correlationId: request.requestId,
          metadata: { reason },
        });
        sendMetaApiFailure(reply, request.requestId, reason);
      }
    },
  );

  /**
   * Ad Account selection (Phase 3.2, meta-account-discovery.md §4-5). A mutation — creating/
   * reactivating local `AdAccount` row(s) — so it requires `meta_connection.connect`
   * (OWNER/ADMIN only), exactly as `meta-account-discovery.md` §5 specifies ("part of the
   * connection-establishment flow, not a separate lesser-privileged action"; this does not
   * introduce a new permission). Every requested external ID is verified against a FRESH
   * discovery call through this workspace's own connection before anything is persisted
   * (meta-threat-model.md #7's malicious/foreign external ID defense) — client-supplied
   * name/currency/etc. is never trusted, only the external ID as an index into that fresh,
   * server-fetched result set.
   */
  app.post<{ Params: { id: string } }>(
    "/workspaces/:id/meta/ad-accounts/select",
    async (request, reply) => {
      const user = await requireAuth(request);
      const { workspace, membership } = await requireWorkspaceMembership(user, request.params.id);
      requirePermission(membership, "meta_connection.connect");

      const body = await validateBody(selectAdAccountsRequestSchema, request, reply);
      if (!body) return;

      const config = metaOAuthConfig(opts.env);
      if (!config) return sendNotConfigured(reply, request.requestId);

      const prisma = getPrismaClient();
      const resolved = await resolveDiscoveryConnection(prisma, workspace.id, config.encryptionKey);
      if ("kind" in resolved) {
        sendDiscoveryPrereqFailure(reply, request.requestId, resolved);
        return;
      }

      let discovered;
      try {
        discovered = await listAdAccounts({
          accessToken: resolved.accessToken,
          apiVersion: config.apiVersion,
        });
      } catch (error) {
        const reason = classifyMetaApiFailure(error);
        await recordAuditEvent(prisma, {
          workspaceId: workspace.id,
          actorType: "USER",
          actorId: user.id,
          eventType: "meta_ad_account_discovery.failed",
          resourceType: "meta_connection",
          resourceId: resolved.connection.id,
          action: "discover_ad_accounts",
          outcome: "FAILURE",
          correlationId: request.requestId,
          metadata: { reason },
        });
        sendMetaApiFailure(reply, request.requestId, reason);
        return;
      }

      try {
        const selected = await selectAdAccounts(prisma, {
          workspaceId: workspace.id,
          metaConnectionId: resolved.connection.id,
          actorUserId: user.id,
          correlationId: request.requestId,
          requestedExternalIds: body.externalIds,
          discovered: discovered.map((account) => ({
            externalId: account.id,
            name: account.name,
            currency: account.currency,
            timezone: account.timezoneName,
            accountStatus: account.accountStatus,
            businessExternalId: account.business?.id ?? null,
            businessName: account.business?.name ?? null,
          })),
        });
        const responseBody = selectAdAccountsResponseSchema.parse({
          adAccounts: selected.map(toAdAccountSummary),
        });
        reply.code(200).send(successEnvelope(responseBody, { requestId: request.requestId }));
      } catch (error) {
        if (error instanceof AdAccountNotDiscoverableError) {
          await recordAuditEvent(prisma, {
            workspaceId: workspace.id,
            actorType: "USER",
            actorId: user.id,
            eventType: "ad_account.selection_denied",
            resourceType: "meta_connection",
            resourceId: resolved.connection.id,
            action: "select",
            outcome: "FAILURE",
            correlationId: request.requestId,
            metadata: { reason: "not_discoverable", externalIds: error.externalIds },
          });
          reply.code(422).send(errorEnvelope("VALIDATION_ERROR", error.message, request.requestId));
          return;
        }
        throw error;
      }
    },
  );

  /**
   * `GET /workspaces/:id/ad-accounts` (meta-api-contracts.md §1 — already-approved naming,
   * unprefixed by `/meta/`, distinct from the live discovery reads above). The persisted,
   * currently-`ACTIVE` selected accounts only — a pure local read, no live Meta call, no
   * connection required to be `CONNECTED`.
   */
  app.get<{ Params: { id: string } }>("/workspaces/:id/ad-accounts", async (request, reply) => {
    const user = await requireAuth(request);
    const { workspace, membership } = await requireWorkspaceMembership(user, request.params.id);
    requirePermission(membership, "meta_connection.read");

    const prisma = getPrismaClient();
    const accounts = await listAdAccountsByWorkspace(prisma, workspace.id);
    const body = listAdAccountsResponseSchema.parse({
      adAccounts: accounts.map(toAdAccountSummary),
    });
    reply.code(200).send(successEnvelope(body, { requestId: request.requestId }));
  });

  /**
   * Ad Account deselection (meta-account-discovery.md §4) — the inverse of selection, so it
   * reuses `meta_connection.disconnect` (OWNER/ADMIN only), the same permission this file
   * already uses for the analogous connection-level operation. Marks the row `DESELECTED`,
   * never deletes it (BR-018/OD-3A-05). Resource-scoped via `findAdAccountByWorkspace`'s
   * `id` + `workspaceId` query (authorization.md §2) — an account ID from another workspace
   * is indistinguishable from one that does not exist (404, never 403).
   */
  app.delete<{ Params: { id: string; adAccountId: string } }>(
    "/workspaces/:id/ad-accounts/:adAccountId",
    async (request, reply) => {
      const user = await requireAuth(request);
      const { workspace, membership } = await requireWorkspaceMembership(user, request.params.id);
      requirePermission(membership, "meta_connection.disconnect");

      const prisma = getPrismaClient();
      const existing = await findAdAccountByWorkspace(
        prisma,
        workspace.id,
        request.params.adAccountId,
      );
      if (!existing) {
        reply.code(404).send(errorEnvelope("NOT_FOUND", "Resource not found.", request.requestId));
        return;
      }
      if (existing.status === "DESELECTED") {
        reply
          .code(409)
          .send(
            errorEnvelope("CONFLICT", "This ad account is already deselected.", request.requestId),
          );
        return;
      }

      try {
        const deselected = await deselectAdAccount(prisma, {
          workspaceId: workspace.id,
          adAccountId: existing.id,
          actorUserId: user.id,
          correlationId: request.requestId,
        });
        const body = deselectAdAccountResponseSchema.parse({
          adAccount: toAdAccountSummary(deselected),
        });
        reply.code(200).send(successEnvelope(body, { requestId: request.requestId }));
      } catch (error) {
        if (error instanceof AdAccountNotFoundError) {
          reply
            .code(404)
            .send(errorEnvelope("NOT_FOUND", "Resource not found.", request.requestId));
          return;
        }
        throw error;
      }
    },
  );
}
