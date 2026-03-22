import { expect, test } from "@playwright/test";
import { authStatePaths, hasSeededOwner } from "./fixtures/seeded";

const ownerStorageState = hasSeededOwner() ? authStatePaths.owner : undefined;

test.describe("@smoke settings profile updates", () => {
  test.use({ storageState: ownerStorageState });

  test("updates display name and persists the change", async ({ page }) => {
    test.skip(!hasSeededOwner(), "Missing seeded owner credentials.");

    const updatedName = `E2E Name ${Date.now()}`;

    await page.goto("/dashboard/settings");
    const nameInput = page.getByLabel("Display name");
    await nameInput.fill(updatedName);
    await page.getByRole("button", { name: "Save settings" }).click();

    await expect(page.getByText("Settings saved.")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Display name")).toHaveValue(updatedName);
  });
});
