import type { FastifyInstance, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { verifyToken } from "@clerk/backend";
import type { ApiEnv } from "../env.js";

/**
 * The authenticated Clerk identity for a request. `orgId` is the *claimed* active
 * organization from the verified session JWT itself (never a client-supplied field) — the
 * server-derived input `requireWorkspace()` (Phase 2.3, authorization.ts) resolves against
 * real membership data; workspace/membership/role/permission are never decided here.
 */
export interface AuthenticatedIdentity {
  userId: string;
  /** The active-organization claim from the verified session token, or null if none is
   *  active for this session. */
  orgId: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    /** null means unauthenticated — never guess, never trust a client-supplied identity. */
    authenticatedIdentity: AuthenticatedIdentity | null;
  }
}

/**
 * Thrown by `requireAuthenticatedIdentity()` — maps to 401 via the existing error-handler
 * plugin's statusToErrorCode(401) === "AUTHENTICATION_ERROR". This is deliberately narrower
 * than an authorization failure: it only ever means "no verified Clerk identity was
 * presented," never "identity verified but not permitted" (that distinction, and the full
 * requireAuth()/requireWorkspace()/requireMembership()/requirePermission()/
 * requireResourceAccess() chain, is out of scope for Phase 2.2 — see
 * docs/identity/authorization.md).
 */
export class AuthenticationRequiredError extends Error {
  code = "AUTHENTICATION_REQUIRED";
  statusCode = 401;

  constructor() {
    super("Authentication required.");
    this.name = "AuthenticationRequiredError";
  }
}

export interface AuthPluginOptions {
  env: ApiEnv;
}

/**
 * Resolves the Clerk-authenticated identity for every request onto
 * `request.authenticatedIdentity` — and only that. This hook never rejects a request and
 * never redirects; it only ever *resolves* who (if anyone) is asking, exactly like
 * clerkMiddleware() on the Next.js side (docs/identity/clerk-integration.md finding #3:
 * "Clerk middleware is authentication/session context only"). Route handlers decide what
 * to do with an absent identity via `requireAuthenticatedIdentity()` below.
 *
 * The identity is derived exclusively from a verified Clerk session token in the
 * `Authorization: Bearer <token>` header — never from any client-supplied user ID, header,
 * or body field. An invalid, expired, or missing token always resolves to `null`, never to
 * a guessed or partially-trusted identity.
 */
export default fp(function authPlugin(app: FastifyInstance, opts: AuthPluginOptions, done) {
  app.addHook("onRequest", async (request) => {
    request.authenticatedIdentity = await resolveAuthenticatedIdentity(request, opts.env);
  });
  done();
});

async function resolveAuthenticatedIdentity(
  request: FastifyRequest,
  env: ApiEnv,
): Promise<AuthenticatedIdentity | null> {
  if (!env.CLERK_SECRET_KEY) return null;

  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;

  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;

  try {
    const claims = await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY });
    return { userId: claims.sub, orgId: extractOrgId(claims) };
  } catch {
    // Invalid signature, expired, malformed — all treated identically as "no identity."
    // Never logged with the token itself (SEC-008 / CLAUDE.md "never expose secrets").
    return null;
  }
}

/**
 * Clerk's session token shape for the active-organization claim is version-dependent
 * (clerk-integration.md finding #2's "re-verify version-sensitive items" caveat, confirmed
 * again here against @clerk/backend@3.17.1's own JwtPayload type): the classic token shape
 * carries `org_id` at the top level, while the newer `v: 2` shape nests it under `o.id`.
 * Checking both defensively means this doesn't silently stop resolving org context if the
 * Clerk instance's token version changes.
 */
function extractOrgId(claims: Record<string, unknown>): string | null {
  const flat = claims["org_id"];
  if (typeof flat === "string" && flat.length > 0) return flat;

  const nested = claims["o"];
  if (nested && typeof nested === "object" && "id" in nested) {
    const id = (nested as { id?: unknown }).id;
    if (typeof id === "string" && id.length > 0) return id;
  }

  return null;
}

/** The seed of a future requireAuth() — see docs/identity/authorization.md §1. */
export function requireAuthenticatedIdentity(request: FastifyRequest): AuthenticatedIdentity {
  if (!request.authenticatedIdentity) {
    throw new AuthenticationRequiredError();
  }
  return request.authenticatedIdentity;
}
