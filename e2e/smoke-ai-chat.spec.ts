import { expect, test } from "@playwright/test";
import { authStatePaths, hasSeededOwner } from "./fixtures/seeded";

const ownerStorageState = hasSeededOwner() ? authStatePaths.owner : undefined;
const aiScenario = process.env.E2E_AI_SCENARIO ?? "eligible";

test.describe("@smoke ai chat streaming", () => {
  test.use({ storageState: ownerStorageState });

  test("AI disabled globally hides chat UI and shows unavailable state", async ({ page }) => {
    test.skip(!hasSeededOwner(), "Missing seeded owner credentials.");
    test.skip(aiScenario !== "disabled", "Run with E2E_AI_SCENARIO=disabled.");

    await page.goto("/dashboard/ai");
    await expect(page.getByText("AI chat is unavailable")).toBeVisible();
    await expect(page.getByText("AI is not configured for this app yet.")).toBeVisible();
    await expect(
      page.getByPlaceholder("Ask anything about your product, docs, or workflow..."),
    ).toHaveCount(0);
  });

  test("AI ineligible plan shows unavailable state with billing CTA", async ({ page }) => {
    test.skip(!hasSeededOwner(), "Missing seeded owner credentials.");
    test.skip(aiScenario !== "ineligible", "Run with E2E_AI_SCENARIO=ineligible.");

    await page.goto("/dashboard/ai");
    await expect(page.getByText("AI chat is unavailable")).toBeVisible();
    await expect(page.getByText("AI access requires an eligible paid plan.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to billing" })).toBeVisible();
  });

  test("sends a message and renders a streamed assistant response", async ({ page }) => {
    test.skip(!hasSeededOwner(), "Missing seeded owner credentials.");
    test.skip(aiScenario !== "eligible", "Run with E2E_AI_SCENARIO=eligible.");

    await page.route("**/api/ai/chat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/plain; charset=utf-8",
        body: "Mock streamed response from assistant.",
      });
    });

    await page.goto("/dashboard/ai");
    await page
      .getByPlaceholder("Ask anything about your product, docs, or workflow...")
      .fill("Hello assistant");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Hello assistant")).toBeVisible();
    await expect(page.getByText("Mock streamed response from assistant.")).toBeVisible();
  });
});
