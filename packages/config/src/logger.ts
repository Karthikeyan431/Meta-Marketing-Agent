import pino, { type Logger, type LoggerOptions } from "pino";

/**
 * Field paths pino will replace with "[REDACTED]" instead of logging.
 * Covers common secret shapes: bearer tokens, Meta/AI provider credentials,
 * session/cookie material, and anything explicitly named secret/password/apiKey.
 * Extend per-service via `createLogger({ redact: [...] })`, never remove from this base list.
 */
export const BASE_REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "*.password",
  "*.secret",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.apiKey",
  "*.api_key",
  "*.clientSecret",
  "*.client_secret",
];

export interface CreateLoggerOptions {
  serviceName: string;
  level: string;
  redact?: string[];
  pretty?: boolean;
}

export function createLogger(options: CreateLoggerOptions): Logger {
  const { serviceName, level, redact = [], pretty = false } = options;

  const config: LoggerOptions = {
    name: serviceName,
    level,
    redact: {
      paths: [...BASE_REDACT_PATHS, ...redact],
      censor: "[REDACTED]",
    },
    base: { service: serviceName },
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: pretty
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } }
      : undefined,
  };

  return pino(config);
}

export type { Logger };
