import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OPTIONAL_TOOL_ENV_KEYS = [
  "E2B_API_KEY",
  "TAVILY_API_KEY",
  "FIRECRAWL_API_KEY",
  "COMPOSIO_API_KEY",
  "COMPOSIO_TOOLKITS",
  "COMPOSIO_AUTH_CONFIGS_JSON",
  "COMPOSIO_CONNECTED_ACCOUNTS_JSON",
] as const;

function clearOptionalToolEnv() {
  for (const key of OPTIONAL_TOOL_ENV_KEYS) {
    vi.stubEnv(key, "");
  }
}

describe("AI_TOOL_MAP", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    clearOptionalToolEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("includes only the always-on tool when optional integrations are not configured", async () => {
    const { AI_TOOL_MAP } = await import("./index");

    expect(AI_TOOL_MAP).toHaveProperty("currentTime");
    expect(AI_TOOL_MAP).not.toHaveProperty("e2bRunCode");
    expect(AI_TOOL_MAP).not.toHaveProperty("tavilySearch");
    expect(AI_TOOL_MAP).not.toHaveProperty("firecrawlScrape");
    expect(AI_TOOL_MAP).not.toHaveProperty("composioAction");
  });

  it("registers the E2B tool when E2B_API_KEY is configured", async () => {
    vi.stubEnv("E2B_API_KEY", "e2b_test_key");

    const { AI_TOOL_MAP } = await import("./index");

    expect(AI_TOOL_MAP).toHaveProperty("currentTime");
    expect(AI_TOOL_MAP).toHaveProperty("e2bRunCode");
  });

  it("loads Composio session tools per user instead of registering a static Composio tool", async () => {
    vi.stubEnv("COMPOSIO_API_KEY", "composio_test_key");
    vi.doMock("./composio-session", () => ({
      hasComposioSessionToolsConfigured: vi.fn().mockReturnValue(true),
      buildComposioSessionToolMap: vi.fn().mockResolvedValue({
        COMPOSIO_SEARCH_TOOLS: { description: "Search Composio tools." },
      }),
    }));

    const { AI_TOOL_MAP, buildAiToolMapForUser } = await import("./index");
    const tools = await buildAiToolMapForUser({ userId: "user_123" });

    expect(AI_TOOL_MAP).toHaveProperty("currentTime");
    expect(AI_TOOL_MAP).not.toHaveProperty("composioAction");
    expect(tools).toHaveProperty("currentTime");
    expect(tools).toHaveProperty("COMPOSIO_SEARCH_TOOLS");
  });
});
