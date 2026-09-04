import { defineConfig } from "vitest/config";

const ignore = ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.next/**", "**/e2e/**"];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: [
            "apps/**/*.test.ts",
            "packages/**/*.test.ts",
            "workers/**/*.test.ts",
            "tests/unit/**/*.test.ts",
          ],
          exclude: ignore,
          globals: false,
          setupFiles: ["./vitest.setup.ts"],
        },
      },
      {
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          exclude: ignore,
          globals: false,
          setupFiles: ["./vitest.setup.ts"],
          testTimeout: 30_000,
          hookTimeout: 30_000,
          // Integration tests require a real Postgres + Redis reachable via
          // DATABASE_URL / REDIS_URL (see docs/implementation/local-development.md).
          // They are intentionally excluded from `test:unit` / CI's fast unit stage.
        },
      },
    ],
  },
});
