import { type ToolSet } from "ai";
import { currentTimeTool } from "./current-time";
import { tavilySearchTool } from "./tavily";
import { firecrawlScrapeTool } from "./firecrawl";
import { composioActionTool } from "./composio";

function buildToolMap(): ToolSet {
  const tools: ToolSet = {
    currentTime: currentTimeTool,
  };

  if (process.env.TAVILY_API_KEY) {
    tools.tavilySearch = tavilySearchTool;
  }

  if (process.env.FIRECRAWL_API_KEY) {
    tools.firecrawlScrape = firecrawlScrapeTool;
  }

  if (process.env.COMPOSIO_API_KEY) {
    tools.composioAction = composioActionTool;
  }

  return tools;
}

export const AI_TOOL_MAP: ToolSet = buildToolMap();
