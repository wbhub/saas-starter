import { expect, test } from "@playwright/test";
import { authStatePaths, hasSeededOwner } from "./fixtures/seeded";

const ownerStorageState = hasSeededOwner() ? authStatePaths.owner : undefined;

test.describe("@smoke ai chat streaming", () => {
  test.use({ storageState: ownerStorageState });

  test("sends a message and renders a streamed assistant response", async ({ page }) => {
    test.skip(!hasSeededOwner(), "Missing seeded owner credentials.");

    await page.route("**/api/ai/chat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/plain; charset=utf-8",
        body: "Mock streamed response from assistant.",
      });
    });

    await page.goto("/dashboard/ai");
    await page.getByPlaceholder("Ask anything about your product, docs, or workflow...").fill("Hello assistant");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Hello assistant")).toBeVisible();
    await expect(page.getByText("Mock streamed response from assistant.")).toBeVisible();
  });
});
