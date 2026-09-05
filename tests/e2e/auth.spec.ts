import { test, expect } from "./fixtures.js";

test.describe("authentication boundary", () => {
  test("unauthenticated user visiting the protected app route is redirected to sign-in", async ({
    page,
  }) => {
    await page.goto("/app");

    // A longer timeout than the default 5s: the redirect target (/sign-in) itself takes
    // longer to settle in this test environment's fixture setup (see fixtures.ts) than a
    // real Clerk-backed instance would.
    await expect(page).toHaveURL(/\/sign-in/, { timeout: 15_000 });
  });

  test("sign-in page renders", async ({ page }) => {
    await page.goto("/sign-in");

    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("sign-up page renders", async ({ page }) => {
    await page.goto("/sign-up");

    await expect(page.getByRole("heading", { name: "Sign up" })).toBeVisible();
  });
});
