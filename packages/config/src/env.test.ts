import { describe, expect, it } from "vitest";
import { z } from "zod";
import { baseEnvSchema, loadEnv, EnvValidationError } from "./env.js";

describe("loadEnv", () => {
  it("parses valid environment variables and applies defaults", () => {
    const result = loadEnv("test-service", baseEnvSchema, {});
    expect(result.NODE_ENV).toBe("development");
    expect(result.APP_ENV).toBe("local");
    expect(result.LOG_LEVEL).toBe("info");
  });

  it("honors explicitly provided values", () => {
    const result = loadEnv("test-service", baseEnvSchema, {
      NODE_ENV: "production",
      LOG_LEVEL: "warn",
    });
    expect(result.NODE_ENV).toBe("production");
    expect(result.LOG_LEVEL).toBe("warn");
  });

  it("throws EnvValidationError naming the invalid field, without ever including its value", () => {
    const schema = baseEnvSchema.extend({ DATABASE_URL: z.string().min(1) });

    let caught: unknown;
    try {
      loadEnv("test-service", schema, { DATABASE_URL: "" });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(EnvValidationError);
    const error = caught as EnvValidationError;
    expect(error.message).toContain("DATABASE_URL");
    expect(error.message).toContain("test-service");
  });

  it("rejects an unrecognized NODE_ENV rather than silently accepting it", () => {
    expect(() => loadEnv("test-service", baseEnvSchema, { NODE_ENV: "production-ish" })).toThrow(
      EnvValidationError,
    );
  });
});
