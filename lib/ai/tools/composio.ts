import { tool } from "ai";
import { z } from "zod";

const composioActionParams = z.object({
  action: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Z0-9_]+$/, "Action must be uppercase alphanumeric with underscores.")
    .describe(
      "The Composio action to execute (e.g. 'GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER', 'SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL').",
    ),
  params: z
    .record(z.string().max(200), z.unknown())
    .optional()
    .refine((val) => !val || Object.keys(val).length <= 20, "Too many parameters.")
    .describe("Parameters for the Composio action as a key-value object."),
});

export const composioActionTool = tool({
  description:
    "Execute an action on a connected third-party service via Composio. Supports integrations like GitHub, Slack, Google, Notion, and more. Use this when the user wants to interact with an external service.",
  inputSchema: composioActionParams,
  execute: async ({ action, params }) => {
    const apiKey = process.env.COMPOSIO_API_KEY;
    if (!apiKey) {
      return { error: "Composio API key is not configured." };
    }

    const response = await fetch(
      `https://backend.composio.dev/api/v2/actions/${encodeURIComponent(action)}/execute`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          input: params ?? {},
        }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      return {
        error: `Composio action failed with status ${response.status}.`,
        details: errorBody.slice(0, 500) || undefined,
      };
    }

    const data = await response.json();
    return {
      success: true,
      action,
      data: data.data ?? data.response_data ?? data,
    };
  },
});
