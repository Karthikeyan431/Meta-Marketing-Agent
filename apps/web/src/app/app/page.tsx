import { redirect } from "next/navigation";
import { getAuthenticatedIdentity } from "../../lib/auth";
import { apiRequest, ApiClientError } from "../../lib/api-client";
import type { MeResponse } from "@ai-marketing-manager/contracts";

/**
 * Proves the authentication boundary end-to-end (Phase 2.2 scope) — not the product
 * dashboard. Blocks unauthenticated access server-side, then demonstrates the identity
 * reaching apps/api safely via a forwarded, server-obtained session token.
 */
export default async function ProtectedAppPage() {
  const identity = await getAuthenticatedIdentity();
  if (!identity) {
    redirect("/sign-in");
  }

  const apiIdentity = await getApiIdentity(identity);

  return (
    <section aria-labelledby="app-heading">
      <h1 id="app-heading">Authenticated application entry</h1>
      <p role="status">Signed in as Clerk user {identity.userId}.</p>

      <h2>API identity check</h2>
      {apiIdentity.ok ? (
        <p role="status">
          apps/api independently resolved the same identity:{" "}
          <strong>{apiIdentity.data.userId}</strong>.
        </p>
      ) : (
        <p role="alert">apps/api identity check failed: {apiIdentity.message}</p>
      )}
    </section>
  );
}

async function getApiIdentity(
  identity: NonNullable<Awaited<ReturnType<typeof getAuthenticatedIdentity>>>,
): Promise<{ ok: true; data: MeResponse } | { ok: false; message: string }> {
  try {
    const token = await identity.getToken();
    const data = await apiRequest<MeResponse>("/me", {
      token,
      signal: AbortSignal.timeout(5_000),
    });
    return { ok: true, data };
  } catch (error) {
    const message =
      error instanceof ApiClientError
        ? `${error.code}: ${error.message}`
        : error instanceof Error
          ? error.message
          : "Unknown error";
    return { ok: false, message };
  }
}
