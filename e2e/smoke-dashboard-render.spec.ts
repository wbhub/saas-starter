import { expect, test } from "@playwright/test";
import { authStatePaths, hasSeededOwner } from "./fixtures/seeded";

const ownerStorageState = hasSeededOwner() ? authStatePaths.owner : undefined;

test.describe("@smoke dashboard rendering", () => {
  test.use({ storageState: ownerStorageState });

  test("renders overview content for seeded owner", async ({ page }) => {
    test.skip(!hasSeededOwner(), "Missing seeded owner credentials.");
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /Welcome,/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Subscription snapshot" })).toBeVisible();
  });

  test("uses the broader dashboard shell width on large laptop screens", async ({ page }) => {
    test.skip(!hasSeededOwner(), "Missing seeded owner credentials.");

    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto("/dashboard");

    const shellWidth = await page
      .locator("main > div")
      .evaluate((element) => Math.round(element.getBoundingClientRect().width));

    expect(shellWidth).toBeGreaterThan(1500);
  });
});
