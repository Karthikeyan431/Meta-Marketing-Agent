import { auth } from "@clerk/nextjs/server";

/**
 * The authenticated Clerk identity for the current request — server-side only. This
 * proves *who* is asking; it never decides *what* they may do (identity-architecture.md
 * §1: "Clerk proves who is asking. Our database decides what they may do."). Phase 2.3+
 * builds the requireWorkspace()/requireMembership()/requirePermission()/
 * requireResourceAccess() chain on top of this — see
 * docs/identity/phase-2-implementation-sequence.md.
 */
export interface AuthenticatedIdentity {
  userId: string;
  /** Fetches a fresh session JWT, e.g. to forward as `Authorization: Bearer` to apps/api. */
  getToken: () => Promise<string | null>;
}

export async function getAuthenticatedIdentity(): Promise<AuthenticatedIdentity | null> {
  const { userId, getToken } = await auth();
  if (!userId) return null;
  return { userId, getToken };
}
