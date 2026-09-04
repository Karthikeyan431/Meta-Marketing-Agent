import { randomUUID } from "node:crypto";

/** Header used to propagate a request/correlation ID across services, per API_OBSERVABILITY.md. */
export const REQUEST_ID_HEADER = "x-request-id";

export function generateRequestId(): string {
  return randomUUID();
}
