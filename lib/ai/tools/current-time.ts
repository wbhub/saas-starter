import { tool } from "ai";
import { z } from "zod";

const currentTimeParams = z.object({
  timezone: z
    .string()
    .optional()
    .describe("IANA timezone identifier (e.g. America/New_York). Defaults to UTC."),
});

export const currentTimeTool = tool({
  description: "Returns the current date and time in ISO 8601 format.",
  inputSchema: currentTimeParams,
  execute: async ({ timezone }) => {
    const now = new Date();
    const tz = timezone ?? "UTC";
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      fractionalSecondDigits: 3,
    });
    const parts = Object.fromEntries(
      formatter.formatToParts(now).map((p) => [p.type, p.value]),
    ) as Record<string, string>;
    const formatted = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${parts.fractionalSecond}`;
    return { now: formatted, timezone: tz };
  },
});
