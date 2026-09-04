import { test, expect } from "@playwright/test";

test.describe("application shell", () => {
  test("home page renders the app shell with a skip link and main landmark", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/AI Marketing Manager/);
    await expect(page.locator(".skip-link")).toHaveText("Skip to main content");
    await expect(page.locator("main#main-content")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("AI Marketing Manager");
  });

  test("skip link is keyboard-focusable and jumps to main content", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.locator(".skip-link")).toBeFocused();
  });

  test("an unknown route renders the not-found page instead of a raw 404", async ({ page }) => {
    await page.goto("/this-route-does-not-exist");

    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Return home" })).toBeVisible();
  });
});
