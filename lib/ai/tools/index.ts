import { env } from "@/lib/env";
import { type ToolSet } from "ai";
import { currentTimeTool } from "./current-time";
import { tavilySearchTool } from "./tavily";
import { firecrawlScrapeTool } from "./firecrawl";
import { buildComposioSessionToolMap, hasComposioSessionToolsConfigured } from "./composio-session";
import { e2bRunCodeTool } from "./e2b";

function buildToolMap(): ToolSet {
  const tools: ToolSet = {
    currentTime: currentTimeTool,
  };

  if (env.TAVILY_API_KEY) {
    tools.tavilySearch = tavilySearchTool;
  }

  if (env.FIRECRAWL_API_KEY) {
    tools.firecrawlScrape = firecrawlScrapeTool;
  }

  if (env.E2B_API_KEY) {
    tools.e2bRunCode = e2bRunCodeTool;
  }

  return tools;
}

export const AI_TOOL_MAP: ToolSet = buildToolMap();

export async function buildAiToolMapForUser({
  userId,
  userTimezone,
}: {
  userId: string;
  userTimezone?: string | null;
}): Promise<ToolSet> {
  const tools: ToolSet = { ...AI_TOOL_MAP };

  if (hasComposioSessionToolsConfigured()) {
    Object.assign(
      tools,
      await buildComposioSessionToolMap({
        userId,
        userTimezone,
      }),
    );
  }

  return tools;
}
