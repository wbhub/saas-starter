import { expect, test } from "@playwright/test";
import { authStatePaths, hasSeededOwner, seededInvite } from "./fixtures/seeded";

const ownerStorageState = hasSeededOwner() ? authStatePaths.owner : undefined;

test.describe("@smoke invite acceptance flow", () => {
  test.use({ storageState: ownerStorageState });

  test("accepts invite with fixture response and lands on dashboard", async ({ page }) => {
    test.skip(!hasSeededOwner(), "Missing seeded owner credentials.");

    await page.route("**/api/team/invites/accept", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, teamName: "Seeded Team" }),
      });
    });

    await page.goto(`/invite/${seededInvite.token}`);
    await expect(page.getByRole("heading", { name: "Team invite" })).toBeVisible();
    await page.getByRole("button", { name: "Accept invite" }).click();
    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
  });
});
