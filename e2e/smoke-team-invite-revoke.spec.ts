import { expect, test } from "@playwright/test";
import { authStatePaths, hasSeededOwner } from "./fixtures/seeded";

const ownerStorageState = hasSeededOwner() ? authStatePaths.owner : undefined;

test.describe("@smoke team invite management", () => {
  test.use({ storageState: ownerStorageState });

  test("invites a member and revokes the pending invite", async ({ page }) => {
    test.skip(!hasSeededOwner(), "Missing seeded owner credentials.");

    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    const inviteEmail = `invite+${Date.now()}@example.com`;

    await page.goto("/dashboard/team");
    await page.getByLabel("Invite email").fill(inviteEmail);
    await page.getByRole("button", { name: "Send invite" }).click();

    await expect(
      page.getByText(/Invite email sent\.|Invite created, but email delivery failed\./),
    ).toBeVisible();
    await expect(page.getByText(inviteEmail)).toBeVisible();

    const inviteRow = page.locator("div", { hasText: inviteEmail }).first();
    await inviteRow.getByRole("button", { name: "Revoke" }).click();

    await expect(page.getByText("Invite revoked.")).toBeVisible();
    await expect(page.getByText(inviteEmail)).toHaveCount(0);
  });
});
