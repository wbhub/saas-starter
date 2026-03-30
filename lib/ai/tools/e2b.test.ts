import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const e2bMockState = vi.hoisted(() => ({
  create: vi.fn(),
  runCode: vi.fn(),
  kill: vi.fn(),
}));

vi.mock("@e2b/code-interpreter", () => ({
  Sandbox: {
    create: e2bMockState.create,
  },
}));

function getExecute(tool: { execute?: (input: unknown) => Promise<unknown> }) {
  if (!tool.execute) {
    throw new Error("Tool execute handler is not defined.");
  }

  return tool.execute;
}

describe("e2bRunCodeTool", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("E2B_API_KEY", "e2b_test_key");
    e2bMockState.runCode.mockReset();
    e2bMockState.kill.mockReset().mockResolvedValue(undefined);
    e2bMockState.create.mockReset().mockResolvedValue({
      runCode: e2bMockState.runCode,
      kill: e2bMockState.kill,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates a sandbox with outbound internet disabled and kills it after successful execution", async () => {
    e2bMockState.runCode.mockResolvedValue({
      error: undefined,
      text: "2",
      logs: { stdout: ["hello"], stderr: [] },
      results: [
        {
          isMainResult: true,
          text: "2",
          markdown: undefined,
          json: undefined,
          chart: undefined,
          data: undefined,
          formats: () => ["text"],
        },
      ],
    });

    const { e2bRunCodeTool } = await import("./e2b");
    const execute = getExecute(
      e2bRunCodeTool as { execute?: (input: unknown) => Promise<unknown> },
    );

    const result = (await execute({
      code: "print(1 + 1)",
      language: "python",
      timeoutMs: 1500,
      requestTimeoutMs: 2500,
      sandboxTimeoutMs: 12000,
    })) as {
      success: boolean;
      text: string | null;
      stdout: string[];
      results: Array<{ formats: string[] }>;
    };

    expect(e2bMockState.create).toHaveBeenCalledWith({
      allowInternetAccess: false,
      timeoutMs: 12000,
      requestTimeoutMs: 2500,
    });
    expect(e2bMockState.runCode).toHaveBeenCalledWith("print(1 + 1)", {
      language: "python",
      timeoutMs: 1500,
      requestTimeoutMs: 2500,
    });
    expect(e2bMockState.kill).toHaveBeenCalledWith({ requestTimeoutMs: 2500 });
    expect(result).toMatchObject({
      success: true,
      text: "2",
      stdout: ["hello"],
    });
    expect(result.results[0]?.formats).toEqual(["text"]);
  });

  it("kills the sandbox when execution throws", async () => {
    e2bMockState.runCode.mockRejectedValue(new Error("boom"));

    const { e2bRunCodeTool } = await import("./e2b");
    const execute = getExecute(
      e2bRunCodeTool as { execute?: (input: unknown) => Promise<unknown> },
    );

    const result = (await execute({
      code: "print('x')",
      requestTimeoutMs: 2200,
    })) as {
      success: boolean;
      error: { name: string; value: string };
    };

    expect(e2bMockState.kill).toHaveBeenCalledWith({ requestTimeoutMs: 2200 });
    expect(result).toMatchObject({
      success: false,
      error: {
        name: "Error",
        value: "boom",
      },
    });
  });
});
