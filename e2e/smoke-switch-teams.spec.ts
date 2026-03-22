import { expect, test } from "@playwright/test";
import { authStatePaths, hasSeededOwner } from "./fixtures/seeded";

const ownerStorageState = hasSeededOwner() ? authStatePaths.owner : undefined;

test.describe("@smoke switch teams", () => {
  test.use({ storageState: ownerStorageState });

  test("switches active teams and updates dashboard context", async ({ page }) => {
    test.skip(!hasSeededOwner(), "Missing seeded owner credentials.");

    await page.goto("/dashboard");
    const teamSelect = page.locator("#active-team-select");
    const optionCount = await teamSelect.locator("option").count();
    test.skip(optionCount < 2, "Seeded owner needs at least two team memberships.");

    const targetOption = teamSelect.locator("option").nth(1);
    const targetTeamName = (await targetOption.textContent())?.trim() ?? "";
    const targetTeamId = await targetOption.getAttribute("value");

    await teamSelect.selectOption(targetTeamId ?? "");
    await page.getByRole("button", { name: "Switch" }).click();

    await expect(teamSelect).toHaveValue(targetTeamId ?? "");
    await expect(page.getByText(targetTeamName, { exact: false }).first()).toBeVisible();
  });
});
