import { type Tool } from "ai";
import { currentTimeTool } from "./current-time";

export const AI_TOOL_MAP: Record<string, Tool> = {
  currentTime: currentTimeTool,
};
