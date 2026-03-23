import { defineConfig } from "@trigger.dev/sdk/v3";

const triggerProjectRef = process.env.TRIGGER_PROJECT_REF?.trim() || "proj_placeholder";

export default defineConfig({
  project: triggerProjectRef,
  maxDuration: 300,
  dirs: ["./lib/trigger/jobs"],
});
