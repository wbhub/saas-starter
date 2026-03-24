import { defineConfig, devices } from "@playwright/test";

const hasExternalBaseUrl = Boolean(process.env.PLAYWRIGHT_BASE_URL);
const isCI = process.env.CI === "true";

if (isCI && !hasExternalBaseUrl) {
  throw new Error(
    "PLAYWRIGHT_BASE_URL is required in CI. Configure this secret to run smoke E2E reliably.",
  );
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "smoke",
      testIgnore: /.*\.setup\.ts/,
      grep: /@smoke/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
    {
      name: "full",
      testIgnore: /.*\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
  webServer:
    hasExternalBaseUrl || isCI
      ? undefined
      : {
          command: "npm run dev",
          url: "http://127.0.0.1:3000",
          // Turbopack + first compile can exceed the default 60s on cold machines.
          timeout: 180_000,
          // By default do not attach to whatever happens to be listening on :3000 (stuck/zombie
          // processes caused "hung" Playwright runs). Opt in with PLAYWRIGHT_REUSE_DEV_SERVER=true
          // when you already have a healthy `npm run dev` running.
          reuseExistingServer: !isCI && process.env.PLAYWRIGHT_REUSE_DEV_SERVER === "true",
        },
});
