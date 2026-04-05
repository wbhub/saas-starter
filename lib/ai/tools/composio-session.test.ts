import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const composioMockState = vi.hoisted(() => ({
  composioCtor: vi.fn(),
  providerCtor: vi.fn(),
  create: vi.fn(),
  tools: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock("@composio/core", () => ({
  Composio: class {
    constructor(config: unknown) {
      composioMockState.composioCtor(config);
    }

    create = composioMockState.create;
  },
}));

vi.mock("@composio/vercel", () => ({
  VercelProvider: class {
    constructor(config?: unknown) {
      composioMockState.providerCtor(config);
    }
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: composioMockState.loggerError,
    warn: composioMockState.loggerWarn,
  },
}));

describe("buildComposioSessionToolMap", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    composioMockState.composioCtor.mockReset();
    composioMockState.providerCtor.mockReset();
    composioMockState.create.mockReset();
    composioMockState.tools.mockReset();
    composioMockState.loggerError.mockReset();
    composioMockState.loggerWarn.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates a Composio session with toolkit and auth configuration and returns session tools", async () => {
    vi.stubEnv("COMPOSIO_API_KEY", "composio_test_key");
    vi.stubEnv("COMPOSIO_TOOLKITS", "github, gmail");
    vi.stubEnv("COMPOSIO_AUTH_CONFIGS_JSON", '{"github":"ac_123"}');
    vi.stubEnv("COMPOSIO_CONNECTED_ACCOUNTS_JSON", '{"gmail":"con_123"}');
    composioMockState.tools.mockResolvedValue({
      COMPOSIO_SEARCH_TOOLS: { description: "Search tools" },
    });
    composioMockState.create.mockResolvedValue({
      tools: composioMockState.tools,
    });

    const { buildComposioSessionToolMap } = await import("./composio-session");
    const tools = await buildComposioSessionToolMap({ userId: "user_123" });

    expect(composioMockState.providerCtor).toHaveBeenCalledWith(undefined);
    expect(composioMockState.composioCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "composio_test_key",
        provider: expect.any(Object),
      }),
    );
    expect(composioMockState.create).toHaveBeenCalledWith("user_123", {
      manageConnections: true,
      workbench: { enable: false },
      toolkits: ["github", "gmail"],
      authConfigs: { github: "ac_123" },
      connectedAccounts: { gmail: "con_123" },
    });
    expect(composioMockState.tools).toHaveBeenCalledWith();
    expect(tools).toHaveProperty("COMPOSIO_SEARCH_TOOLS");
  });

  it("falls back to an empty tool map when session initialization fails", async () => {
    vi.stubEnv("COMPOSIO_API_KEY", "composio_test_key");
    composioMockState.create.mockRejectedValue(new Error("boom"));

    const { buildComposioSessionToolMap } = await import("./composio-session");
    const tools = await buildComposioSessionToolMap({ userId: "user_123" });

    expect(tools).toEqual({});
    expect(composioMockState.loggerError).toHaveBeenCalledWith(
      "Failed to initialize Composio session tools",
      expect.any(Error),
      expect.objectContaining({ userId: "user_123" }),
    );
  });
});
