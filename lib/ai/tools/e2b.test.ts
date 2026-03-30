import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  });

  afterEach(() => {
    vi.doUnmock("@e2b/code-interpreter");
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("creates a sandbox with outbound internet disabled and kills it after successful execution", async () => {
    const runCode = vi.fn().mockResolvedValue({
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
    const kill = vi.fn().mockResolvedValue(undefined);
    const create = vi.fn().mockResolvedValue({
      runCode,
      kill,
    });

    vi.doMock("@e2b/code-interpreter", () => ({
      Sandbox: { create },
    }));

    const { e2bRunCodeTool } = await import("./e2b");
    const execute = getExecute(e2bRunCodeTool as { execute?: (input: unknown) => Promise<unknown> });

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

    expect(create).toHaveBeenCalledWith({
      allowInternetAccess: false,
      timeoutMs: 12000,
      requestTimeoutMs: 2500,
    });
    expect(runCode).toHaveBeenCalledWith("print(1 + 1)", {
      language: "python",
      timeoutMs: 1500,
      requestTimeoutMs: 2500,
    });
    expect(kill).toHaveBeenCalledWith({ requestTimeoutMs: 2500 });
    expect(result).toMatchObject({
      success: true,
      text: "2",
      stdout: ["hello"],
    });
    expect(result.results[0]?.formats).toEqual(["text"]);
  });

  it("kills the sandbox when execution throws", async () => {
    const runCode = vi.fn().mockRejectedValue(new Error("boom"));
    const kill = vi.fn().mockResolvedValue(undefined);
    const create = vi.fn().mockResolvedValue({
      runCode,
      kill,
    });

    vi.doMock("@e2b/code-interpreter", () => ({
      Sandbox: { create },
    }));

    const { e2bRunCodeTool } = await import("./e2b");
    const execute = getExecute(e2bRunCodeTool as { execute?: (input: unknown) => Promise<unknown> });

    const result = (await execute({
      code: "print('x')",
      requestTimeoutMs: 2200,
    })) as {
      success: boolean;
      error: { name: string; value: string };
    };

    expect(kill).toHaveBeenCalledWith({ requestTimeoutMs: 2200 });
    expect(result).toMatchObject({
      success: false,
      error: {
        name: "Error",
        value: "boom",
      },
    });
  });
});
