import type { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { errorEnvelope, type ErrorCode } from "@ai-marketing-manager/contracts";

function statusToErrorCode(statusCode: number): ErrorCode {
  if (statusCode === 400) return "VALIDATION_ERROR";
  if (statusCode === 401) return "AUTHENTICATION_ERROR";
  if (statusCode === 403) return "AUTHORIZATION_ERROR";
  if (statusCode === 404) return "NOT_FOUND";
  if (statusCode === 409) return "CONFLICT";
  if (statusCode === 429) return "RATE_LIMITED";
  if (statusCode >= 500) return "INTERNAL_ERROR";
  return "VALIDATION_ERROR";
}

/**
 * Every error response uses the standard {error:{code,message,requestId}} envelope
 * (API_CONTRACTS.md) and never leaks stack traces, internal error details, or secrets
 * (API_SECURITY.md SEC-008) — production responses use a fixed safe message for 5xx.
 */
export default fp(function errorHandlerPlugin(app: FastifyInstance, _opts, done) {
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    reply.code(404).send(errorEnvelope("NOT_FOUND", "Resource not found.", request.requestId));
  });

  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const statusCode = error.statusCode ?? 500;
    const code = statusToErrorCode(statusCode);
    const isServerError = statusCode >= 500;
    const isProduction = process.env["NODE_ENV"] === "production";

    if (isServerError) {
      request.log.error({ err: error, requestId: request.requestId }, "unhandled request error");
    } else {
      request.log.warn({ err: error.message, requestId: request.requestId }, "request error");
    }

    const message =
      isServerError && isProduction
        ? "An unexpected error occurred. Please try again."
        : error.message;

    reply.code(statusCode).send(errorEnvelope(code, message, request.requestId));
  });

  done();
});
