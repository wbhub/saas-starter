import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { expect, type Page, test as setup } from "@playwright/test";
import {
  authStatePaths,
  hasSeededMember,
  hasSeededOwner,
  missingSeededAuthEnvVars,
  seededUsers,
} from "./fixtures/seeded";

async function loginAndSaveState(page: Page, email: string, password: string, outputPath: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log In" }).click();
  await page.waitForURL("**/dashboard**");
  await expect(page.getByText("Overview")).toBeVisible();
  await mkdir(dirname(outputPath), { recursive: true });
  await page.context().storageState({ path: outputPath });
}

setup("seeded owner auth state", async ({ page }) => {
  setup.skip(!hasSeededOwner(), "Missing seeded owner credentials.");
  await loginAndSaveState(
    page,
    seededUsers.owner.email,
    seededUsers.owner.password,
    authStatePaths.owner,
  );
});

setup("seeded member auth state", async ({ page }) => {
  setup.skip(!hasSeededMember(), "Missing seeded member credentials.");
  await loginAndSaveState(
    page,
    seededUsers.member.email,
    seededUsers.member.password,
    authStatePaths.member,
  );
});

setup("validate seeded auth environment in CI", async () => {
  const isCI = process.env.CI === "true";
  if (!isCI) {
    return;
  }

  const missing = missingSeededAuthEnvVars();
  if (missing.length > 0) {
    throw new Error(
      `Missing required seeded E2E env vars: ${missing.join(", ")}. ` +
        "Set these in CI secrets to keep smoke coverage reliable.",
    );
  }
});
