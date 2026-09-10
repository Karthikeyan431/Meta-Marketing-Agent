import type { FastifyInstance } from "fastify";
import {
  metaOAuthInitiationResponseSchema,
  listMetaConnectionsResponseSchema,
  disconnectMetaConnectionResponseSchema,
  successEnvelope,
  errorEnvelope,
  type MetaConnectionSummary,
} from "@ai-marketing-manager/contracts";
import {
  getPrismaClient,
  findMembership,
  findMetaConnectionByWorkspace,
  upsertMetaConnection,
  disconnectMetaConnection,
  recordAuditEvent,
  roleHasPermission,
  MetaConnectionNotFoundError,
  type MetaConnection,
  type RoleName,
} from "@ai-marketing-manager/domain";
import {
  requireAuth,
  requireWorkspaceMembership,
  requirePermission,
} from "../plugins/authorization.js";
import {
  buildMetaAuthorizationUrl,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  validateMetaToken,
  getMetaIdentity,
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

/**
 * Meta OAuth & connection lifecycle (Phase 3.1, meta-api-contracts.md §1–2). Every route
 * reuses the existing `requireAuth → requireWorkspaceMembership → requirePermission →
 * requireResourceAccess` chain unchanged — no competing authorization path. Only Phase 3.1
 * scope: OAuth initiation/callback, connection list/reconnect/disconnect. No campaign,
 * ad-account discovery, Insights, or webhook code (Phase 3.3+/Phase 4/Phase 5).
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
   * OAuth callback (meta-oauth.md §2). No client-provided workspace/user/Meta-account ID is
   * ever trusted — the workspace and user come only from the server-held state payload,
   * re-verified fresh against the database (never trusted merely because the state lookup
   * succeeded). `requireAuth()` runs here too (this is a real browser redirect, carrying the
   * user's live session, unlike the Clerk webhook's server-to-server exception) — the
   * currently-authenticated user is compared against the state's stored `userId`,
   * rejecting a "wrong user" completion (meta-threat-model.md, test-matrix OAuth: wrong
   * user).
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
    let currentUser;
    try {
      currentUser = await requireAuth(request);
    } catch {
      await auditFailure(
        "unauthenticated_at_callback",
        statePayload.workspaceId,
        statePayload.userId,
      );
      redirectResult("error", "session_expired");
      return;
    }
    if (currentUser.id !== statePayload.userId) {
      await auditFailure("wrong_user", statePayload.workspaceId, statePayload.userId);
      redirectResult("error", "wrong_user");
      return;
    }

    const freshMembership = await findMembership(prisma, {
      userId: currentUser.id,
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
        currentUser.id,
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
        currentUser.id,
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
        currentUser.id,
      );
      redirectResult("error", "token_validation_failed");
      return;
    }
    if (!debugInfo.isValid || debugInfo.appId !== config.appId) {
      await auditFailure(
        "token_validation_failed:invalid_token",
        statePayload.workspaceId,
        currentUser.id,
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
        currentUser.id,
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
        currentUser.id,
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
      actorUserId: currentUser.id,
      correlationId: request.requestId,
    });

    redirectResult("success");
  });
}
