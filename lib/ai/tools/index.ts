import { type ToolSet } from "ai";
import { currentTimeTool } from "./current-time";

export const AI_TOOL_MAP: ToolSet = {
  currentTime: currentTimeTool,
};
