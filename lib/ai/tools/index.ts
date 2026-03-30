import { env } from "@/lib/env";
import { type ToolSet } from "ai";
import { currentTimeTool } from "./current-time";
import { tavilySearchTool } from "./tavily";
import { firecrawlScrapeTool } from "./firecrawl";
import { composioActionTool } from "./composio";
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

  if (env.COMPOSIO_API_KEY) {
    tools.composioAction = composioActionTool;
  }

  if (env.E2B_API_KEY) {
    tools.e2bRunCode = e2bRunCodeTool;
  }

  return tools;
}

export const AI_TOOL_MAP: ToolSet = buildToolMap();
