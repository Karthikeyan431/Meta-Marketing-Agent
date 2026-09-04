import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Runs against `next dev` rather than a production build — keeps the E2E baseline
  // independent of the separately-verified "frontend builds" check, and avoids paying
  // for a full production build just to run a smoke test.
  webServer: {
    // Next.js reads PORT from the environment directly (set below) — passing --port
    // through `pnpm --filter ... run dev --` was mis-parsed by pnpm/next's arg handling
    // and is unnecessary anyway.
    command: "pnpm --filter @ai-marketing-manager/web run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env["CI"],
    timeout: 60_000,
    env: {
      NEXT_PUBLIC_API_URL: process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000",
      PORT: String(PORT),
    },
  },
});
