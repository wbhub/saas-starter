import { expect, test } from "@playwright/test";
import { authStatePaths, hasSeededMember } from "./fixtures/seeded";

test.describe("@smoke billing permissions", () => {
  test.use({ storageState: authStatePaths.member });

  test("member role cannot access billing actions", async ({ page }) => {
    test.skip(!hasSeededMember(), "Missing seeded member credentials.");

    await page.goto("/dashboard/billing");
    await expect(page.getByText("Only team owners and admins can manage billing.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Manage billing/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Subscribe|Switch to/i })).toHaveCount(0);
  });
});
