import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { REQUEST_ID_HEADER, generateRequestId } from "@ai-marketing-manager/config";

declare module "fastify" {
  interface FastifyRequest {
    requestId: string;
  }
}

/**
 * Every request gets a correlation ID — reused from the caller's header if present
 * (so a client-supplied trace ID chains through), generated otherwise. Echoed back
 * on the response so clients/tests can correlate. Per API_OBSERVABILITY.md.
 */
export default fp(function requestIdPlugin(app: FastifyInstance, _opts, done) {
  app.addHook("onRequest", (request, reply, hookDone) => {
    const incoming = request.headers[REQUEST_ID_HEADER];
    const requestId =
      typeof incoming === "string" && incoming.length > 0 ? incoming : generateRequestId();
    request.requestId = requestId;
    reply.header(REQUEST_ID_HEADER, requestId);
    hookDone();
  });
  done();
});
