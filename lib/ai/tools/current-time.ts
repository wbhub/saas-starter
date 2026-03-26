import { type Tool, zodSchema } from "ai";
import { z } from "zod";

const currentTimeParams = z.object({
  timezone: z
    .string()
    .optional()
    .describe("IANA timezone identifier (e.g. America/New_York). Defaults to UTC."),
});

type CurrentTimeInput = z.infer<typeof currentTimeParams>;
type CurrentTimeOutput = { now: string; timezone: string };

export const currentTimeTool: Tool<CurrentTimeInput, CurrentTimeOutput> = {
  description: "Returns the current date and time in ISO 8601 format.",
  inputSchema: zodSchema(currentTimeParams),
  execute: async ({ timezone }) => {
    const now = new Date();
    const formatted = timezone
      ? now.toLocaleString("en-US", { timeZone: timezone })
      : now.toISOString();
    return { now: formatted, timezone: timezone ?? "UTC" };
  },
};
