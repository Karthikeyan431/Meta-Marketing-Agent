import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import { validateBody } from "./validation.js";

function fakeRequest(body: unknown): FastifyRequest {
  return { body, requestId: "test-request-id" } as unknown as FastifyRequest;
}

function fakeReply() {
  const send = vi.fn();
  const code = vi.fn().mockReturnValue({ send });
  return { code, send, reply: { code } as unknown as FastifyReply };
}

describe("validateBody", () => {
  const schema = z.object({ message: z.string().min(1) });

  it("returns the parsed body when validation succeeds", async () => {
    const { reply } = fakeReply();
    const result = await validateBody(schema, fakeRequest({ message: "hi" }), reply);
    expect(result).toEqual({ message: "hi" });
  });

  it("sends a 400 VALIDATION_ERROR envelope and returns undefined on failure", async () => {
    const { code, send, reply } = fakeReply();
    const result = await validateBody(schema, fakeRequest({ message: "" }), reply);

    expect(result).toBeUndefined();
    expect(code).toHaveBeenCalledWith(400);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: "VALIDATION_ERROR",
          requestId: "test-request-id",
        }),
      }),
    );
  });

  it("reports every failing field, not just the first", async () => {
    const multiFieldSchema = z.object({ a: z.string().min(1), b: z.number() });
    const { send, reply } = fakeReply();
    await validateBody(multiFieldSchema, fakeRequest({ a: "", b: "not-a-number" }), reply);

    const sentEnvelope = send.mock.calls[0]?.[0] as { error: { message: string } };
    expect(sentEnvelope.error.message).toContain("a:");
    expect(sentEnvelope.error.message).toContain("b:");
  });
});
