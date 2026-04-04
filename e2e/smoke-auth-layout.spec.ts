import { expect, test } from "@playwright/test";

test.describe("@smoke auth layout widths", () => {
  test("login uses the shared public shell with a centered auth rail", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto("/login");

    const mainWidth = await page
      .locator("main")
      .evaluate((element) => Math.round(element.getBoundingClientRect().width));
    const contentWidth = await page
      .locator("main > div")
      .evaluate((element) => Math.round(element.getBoundingClientRect().width));

    expect(mainWidth).toBeGreaterThan(1380);
    expect(mainWidth).toBeLessThanOrEqual(1440);
    expect(contentWidth).toBeLessThanOrEqual(448);
  });

  test("signup uses the shared public shell with a centered auth rail", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto("/signup?plan=starter");

    const mainWidth = await page
      .locator("main")
      .evaluate((element) => Math.round(element.getBoundingClientRect().width));
    const contentWidth = await page
      .locator("main > div")
      .evaluate((element) => Math.round(element.getBoundingClientRect().width));

    expect(mainWidth).toBeGreaterThan(1380);
    expect(mainWidth).toBeLessThanOrEqual(1440);
    expect(contentWidth).toBeLessThanOrEqual(448);
  });
});
