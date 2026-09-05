import { config as loadDotenv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

// Local dev convenience only — loads the repo-root .env so Clerk's fixture-shaped test
// keys (never real credentials; see .env.example) reach the spawned `next dev` process
// below. No-op if the file doesn't exist (e.g. CI, which injects env vars directly).
loadDotenv();

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
      // next dev actually executes clerkMiddleware() per live request (unlike `next
      // build`, which never runs it) — it fails fast if the publishable key is entirely
      // absent. Fixture-only fallback values, never real credentials; see .env.example.
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
        process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] ??
        "replace-with-real-clerk-publishable-key",
      CLERK_SECRET_KEY: process.env["CLERK_SECRET_KEY"] ?? "replace-with-real-clerk-secret-key",
    },
  },
});
