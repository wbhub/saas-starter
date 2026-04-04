import { expect, test } from "@playwright/test";

test.describe("@smoke public layout widths", () => {
  test("landing page uses the narrower public shell on laptop-sized screens", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto("/");

    const mainWidth = await page
      .locator("main")
      .evaluate((element) => Math.round(element.getBoundingClientRect().width));

    expect(mainWidth).toBeGreaterThan(1380);
    expect(mainWidth).toBeLessThanOrEqual(1440);
  });

  test("legal pages keep readable text width inside the narrower public shell", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1800, height: 1000 });
    await page.goto("/privacy-policy");

    const mainWidth = await page
      .locator("main")
      .evaluate((element) => Math.round(element.getBoundingClientRect().width));
    const articleWidth = await page
      .locator("main > div")
      .evaluate((element) => Math.round(element.getBoundingClientRect().width));

    expect(mainWidth).toBeGreaterThan(1380);
    expect(mainWidth).toBeLessThanOrEqual(1440);
    expect(articleWidth).toBeLessThanOrEqual(920);
  });
});
