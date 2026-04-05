import "server-only";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { type ToolSet } from "ai";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

type BuildComposioSessionToolMapOptions = {
  userId: string;
  userTimezone?: string | null;
};

function parseToolkitList(rawValue: string | undefined) {
  if (!rawValue) {
    return [];
  }

  return Array.from(
    new Set(
      rawValue
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function parseToolkitRecord(rawValue: string | undefined, envKey: string) {
  if (!rawValue) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue);
  } catch (error) {
    logger.warn(`Invalid ${envKey}; expected a JSON object of toolkit -> id mappings.`, {
      envKey,
      fallbackBehavior: "ignored",
      error,
    });
    return {};
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    logger.warn(`Invalid ${envKey}; expected a JSON object of toolkit -> id mappings.`, {
      envKey,
      fallbackBehavior: "ignored",
    });
    return {};
  }

  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>)
      .map(([toolkit, value]) => [toolkit.trim().toLowerCase(), typeof value === "string" ? value.trim() : ""])
      .filter(([toolkit, value]) => toolkit.length > 0 && value.length > 0),
  );
}

function buildComposioSessionConfig(userTimezone?: string | null) {
  const toolkits = parseToolkitList(env.COMPOSIO_TOOLKITS);
  const authConfigs = parseToolkitRecord(
    env.COMPOSIO_AUTH_CONFIGS_JSON,
    "COMPOSIO_AUTH_CONFIGS_JSON",
  );
  const connectedAccounts = parseToolkitRecord(
    env.COMPOSIO_CONNECTED_ACCOUNTS_JSON,
    "COMPOSIO_CONNECTED_ACCOUNTS_JSON",
  );

  return {
    manageConnections: true,
    // Keep Composio's remote workbench/code-execution tools out of this app by default.
    workbench: { enable: false },
    ...(toolkits.length > 0 ? { toolkits } : {}),
    ...(Object.keys(authConfigs).length > 0 ? { authConfigs } : {}),
    ...(Object.keys(connectedAccounts).length > 0 ? { connectedAccounts } : {}),
    ...(userTimezone
      ? { experimental: { assistivePrompt: { userTimezone } } }
      : {}),
  };
}

export function hasComposioSessionToolsConfigured() {
  return Boolean(env.COMPOSIO_API_KEY);
}

export async function buildComposioSessionToolMap({
  userId,
  userTimezone,
}: BuildComposioSessionToolMapOptions): Promise<ToolSet> {
  const apiKey = env.COMPOSIO_API_KEY;
  if (!apiKey) {
    return {};
  }

  try {
    const composio = new Composio({
      apiKey,
      provider: new VercelProvider(),
    });
    const session = await composio.create(userId, buildComposioSessionConfig(userTimezone));
    return await session.tools();
  } catch (error) {
    logger.error("Failed to initialize Composio session tools", error, {
      userId,
      configuredToolkits: parseToolkitList(env.COMPOSIO_TOOLKITS),
    });
    return {};
  }
}
