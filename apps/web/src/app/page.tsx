import { apiRequest } from "../lib/api-client";
import type { HealthResponse } from "@ai-marketing-manager/contracts";

async function getApiStatus(): Promise<
  { ok: true; data: HealthResponse } | { ok: false; message: string }
> {
  try {
    // Bounded: an unreachable/down API must fail fast, never hang page rendering.
    const data = await apiRequest<HealthResponse>("/health", {
      signal: AbortSignal.timeout(5_000),
    });
    return { ok: true, data };
  } catch (error) {
    // Truthful failure display (UI_STATES_AND_ERRORS.md): never claim the API is healthy
    // when the request actually failed.
    return { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
  }
}

export default async function HomePage() {
  const status = await getApiStatus();

  return (
    <section aria-labelledby="page-heading">
      <h1 id="page-heading">AI Marketing Manager</h1>
      <p>Foundation phase — application shell only. Campaign management lands in a later phase.</p>

      <h2>API status</h2>
      {status.ok ? (
        <p role="status">
          API reachable — service <strong>{status.data.service}</strong> reported{" "}
          <strong>{status.data.status}</strong> at {status.data.timestamp}.
        </p>
      ) : (
        <p role="alert">API unreachable: {status.message}</p>
      )}
    </section>
  );
}
