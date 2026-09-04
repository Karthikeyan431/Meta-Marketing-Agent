import { describe, expect, it } from "vitest";
import { generateRequestId, REQUEST_ID_HEADER } from "./correlation.js";

describe("correlation", () => {
  it("generates a well-formed, unique UUID each call", () => {
    const a = generateRequestId();
    const b = generateRequestId();
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    expect(a).toMatch(uuidPattern);
    expect(b).toMatch(uuidPattern);
    expect(a).not.toBe(b);
  });

  it("uses the lowercase header name expected by HTTP/2 and Fastify", () => {
    expect(REQUEST_ID_HEADER).toBe("x-request-id");
  });
});
