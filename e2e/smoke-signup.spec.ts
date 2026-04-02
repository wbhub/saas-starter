import { expect, test } from "@playwright/test";

test.describe("@smoke signup flow", () => {
  test("submits signup and shows account-created confirmation", async ({ page }) => {
    // Deterministic: JSON mocks cannot set Supabase cookies, so we assert the no-session success path
    // (typical when email confirmation is enabled). For a real dashboard redirect, use `E2E_LIVE_SIGNUP`.
    await page.route("**/api/auth/signup", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          sessionCreated: false,
          message: "Account created. Check your inbox to verify email if confirmation is enabled.",
        }),
      });
    });

    await page.goto("/signup");
    const passwordField = page.getByLabel("Password");
    if (!(await passwordField.isVisible())) {
      const usePasswordButton = page.getByRole("button", { name: "Use password instead" });
      test.skip(!(await usePasswordButton.isVisible()), "Password signup is not available.");
      await usePasswordButton.click();
    }
    await page.getByLabel("Email").fill(`e2e+${Date.now()}@example.com`);
    await passwordField.fill("supersecurepass123");
    await page.getByRole("button", { name: "Create Account" }).click();

    await expect(page.locator("#signup-auth-message")).toBeVisible();
    await expect(page.locator("#signup-auth-message")).toContainText(
      /Account created|inbox|verify/i,
    );
  });

  test("live signup reaches dashboard when Supabase returns a session", async ({ page }) => {
    test.skip(
      process.env.E2E_LIVE_SIGNUP !== "true",
      "Set E2E_LIVE_SIGNUP=true with a working Supabase project to run this test.",
    );

    await page.goto("/signup");
    const passwordField = page.getByLabel("Password");
    if (!(await passwordField.isVisible())) {
      const usePasswordButton = page.getByRole("button", { name: "Use password instead" });
      test.skip(!(await usePasswordButton.isVisible()), "Password signup is not available.");
      await usePasswordButton.click();
    }
    await page.getByLabel("Email").fill(`e2e+${Date.now()}@example.com`);
    await passwordField.fill("supersecurepass123");
    await page.getByRole("button", { name: "Create Account" }).click();

    await page.waitForURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /Welcome,/ })).toBeVisible();
  });
});
