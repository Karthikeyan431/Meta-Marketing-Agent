import { test as base, expect } from "@playwright/test";

/**
 * No real Clerk application exists in this environment (governing task: "Do not make CI
 * depend on a real production Clerk account") — `.env`'s NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
 * is a shape-valid but 100% fake fixture whose decoded Frontend API domain does not exist.
 * Left unblocked, Clerk's client bundle still attempts real network requests to that
 * domain to bootstrap (even for a page that renders no Clerk UI at all), which hang until
 * DNS/connection failure and make every E2E test flaky. Aborting those specific requests
 * makes the failure immediate and deterministic instead of a slow, flaky hang — this does
 * not mask a real defect, since the fake domain could never resolve in any environment.
 */
const FAKE_CLERK_DOMAIN = /fake-live-test\.example\.com/;

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route(FAKE_CLERK_DOMAIN, (route) => route.abort());
    await use(page);
  },
});

export { expect };
