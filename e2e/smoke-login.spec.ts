import { expect, test } from "@playwright/test";
import { hasSeededOwner, seededUsers } from "./fixtures/seeded";

test.describe("@smoke login flow", () => {
  test("logs in with seeded owner and lands on dashboard team context", async ({ page }) => {
    test.skip(!hasSeededOwner(), "Missing seeded owner credentials.");

    await page.goto("/login");
    const passwordField = page.getByLabel("Password");
    if (!(await passwordField.isVisible())) {
      const usePasswordButton = page.getByRole("button", { name: "Use password instead" });
      test.skip(!(await usePasswordButton.isVisible()), "Password login is not available.");
      await usePasswordButton.click();
    }
    await page.getByLabel("Email").fill(seededUsers.owner.email);
    await passwordField.fill(seededUsers.owner.password);
    await page.getByRole("button", { name: "Log In" }).click();

    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
    await expect(page.getByText("App Dashboard")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Welcome,/ })).toBeVisible();
  });
});
