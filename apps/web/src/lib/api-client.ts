import { generateRequestId, REQUEST_ID_HEADER } from "@ai-marketing-manager/config";
import type { ErrorEnvelope, SuccessEnvelope } from "@ai-marketing-manager/contracts";
import { clientEnv } from "./env";

/**
 * The one and only place this app talks to the backend. Per FRONTEND_ARCHITECTURE.md
 * (UI-014): no other module may call `fetch` against the API directly, and this client
 * NEVER calls Meta's API directly from the browser — all Meta access goes through the
 * application API, which is the only thing this client is allowed to reach.
 */
export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly requestId: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const requestId = generateRequestId();
  const response = await fetch(`${clientEnv.NEXT_PUBLIC_API_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "content-type": "application/json",
      [REQUEST_ID_HEADER]: requestId,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  const json: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const errorBody = json as ErrorEnvelope | undefined;
    throw new ApiClientError(
      errorBody?.error.code ?? "INTERNAL_ERROR",
      errorBody?.error.message ?? `Request to ${path} failed with status ${response.status}.`,
      errorBody?.error.requestId ?? requestId,
      response.status,
    );
  }

  return (json as SuccessEnvelope<T>).data;
}
