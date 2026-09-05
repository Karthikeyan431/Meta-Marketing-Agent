import type { FastifyInstance, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { verifyToken } from "@clerk/backend";
import type { ApiEnv } from "../env.js";

/**
 * The authenticated Clerk identity for a request — nothing more. No workspace, membership,
 * role, or permission fields exist yet (docs/identity/phase-2-implementation-sequence.md
 * defers those to later Phase 2 steps); this is Phase 2.2's authentication boundary only.
 */
export interface AuthenticatedIdentity {
  userId: string;
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
    return { userId: claims.sub };
  } catch {
    // Invalid signature, expired, malformed — all treated identically as "no identity."
    // Never logged with the token itself (SEC-008 / CLAUDE.md "never expose secrets").
    return null;
  }
}

/** The seed of a future requireAuth() — see docs/identity/authorization.md §1. */
export function requireAuthenticatedIdentity(request: FastifyRequest): AuthenticatedIdentity {
  if (!request.authenticatedIdentity) {
    throw new AuthenticationRequiredError();
  }
  return request.authenticatedIdentity;
}
