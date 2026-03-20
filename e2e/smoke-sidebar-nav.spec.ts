import { expect, test } from "@playwright/test";
import { authStatePaths, hasSeededOwner } from "./fixtures/seeded";

test.describe("@smoke sidebar navigation state", () => {
  test.use({ storageState: authStatePaths.owner });

  test("tracks active section while navigating dashboard pages", async ({ page }) => {
    test.skip(!hasSeededOwner(), "Missing seeded owner credentials.");

    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");

    await page.getByRole("link", { name: "Billing" }).click();
    await expect(page).toHaveURL(/\/dashboard\/billing$/);
    await expect(page.getByRole("link", { name: "Billing" })).toHaveAttribute("aria-current", "page");

    await page.getByRole("link", { name: "Team" }).click();
    await expect(page).toHaveURL(/\/dashboard\/team$/);
    await expect(page.getByRole("link", { name: "Team" })).toHaveAttribute("aria-current", "page");
  });
});
