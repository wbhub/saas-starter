import { expect, test } from "@playwright/test";
import { hasSeededOwner, seededUsers } from "./fixtures/seeded";

test.describe("@smoke login flow", () => {
  test("logs in with seeded owner and lands on dashboard team context", async ({ page }) => {
    test.skip(!hasSeededOwner(), "Missing seeded owner credentials.");

    await page.goto("/login");
    await page.getByLabel("Email").fill(seededUsers.owner.email);
    await page.getByLabel("Password").fill(seededUsers.owner.password);
    await page.getByRole("button", { name: "Log In" }).click();

    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
    await expect(page.getByText("App Dashboard")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Welcome,/ })).toBeVisible();
  });
});
