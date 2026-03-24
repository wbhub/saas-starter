import { expect, test } from "@playwright/test";
import { authStatePaths, hasSeededOwner } from "./fixtures/seeded";

const ownerStorageState = hasSeededOwner() ? authStatePaths.owner : undefined;

test.describe("@smoke billing checkout", () => {
  test.use({ storageState: ownerStorageState });

  test("starts upgrade checkout and navigates to Stripe", async ({ page }) => {
    test.skip(!hasSeededOwner(), "Missing seeded owner credentials.");

    await page.addInitScript(() => {
      window.open = () => null;
    });

    await page.route("**/api/stripe/checkout", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: "https://checkout.stripe.com/c/pay_test_checkout" }),
      });
    });

    await page.goto("/dashboard/billing");
    const subscribeButton = page.getByRole("button", { name: /Subscribe /i }).first();
    test.skip(
      !(await subscribeButton.isVisible()),
      "No checkout action available for current billing state.",
    );

    await subscribeButton.click();
    await expect(page).toHaveURL(/https:\/\/checkout\.stripe\.com\//);
  });
});
