import { expect, test } from "@playwright/test";
import { authStatePaths, hasSeededOwner } from "./fixtures/seeded";

test.describe("@smoke dashboard rendering", () => {
  test.use({ storageState: authStatePaths.owner });

  test("renders overview content for seeded owner", async ({ page }) => {
    test.skip(!hasSeededOwner(), "Missing seeded owner credentials.");
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /Welcome,/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Subscription snapshot" })).toBeVisible();
  });
});
