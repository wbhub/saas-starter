import { env } from "@/lib/env";
import { tool } from "ai";
import { z } from "zod";

const E2B_LANGUAGE_ALIASES = {
  python: "python",
  py: "python",
  javascript: "javascript",
  js: "javascript",
  typescript: "typescript",
  ts: "typescript",
  bash: "bash",
  sh: "bash",
  shell: "bash",
  r: "r",
  java: "java",
} as const;

const e2bRunCodeParams = z.object({
  code: z
    .string()
    .min(1)
    .max(20000)
    .describe("Code to execute inside an isolated E2B sandbox."),
  language: z
    .enum(["python", "py", "javascript", "js", "typescript", "ts", "bash", "sh", "shell", "r", "java"])
    .optional()
    .describe(
      "Execution language. Defaults to python. Short aliases like py, js, ts, and sh are accepted.",
    ),
  timeoutMs: z
    .number()
    .int()
    .min(1000)
    .max(120000)
    .optional()
    .describe("Code execution timeout in milliseconds. Defaults to 30000."),
  requestTimeoutMs: z
    .number()
    .int()
    .min(1000)
    .max(120000)
    .optional()
    .describe("E2B API request timeout in milliseconds. Defaults to 30000."),
  sandboxTimeoutMs: z
    .number()
    .int()
    .min(10000)
    .max(600000)
    .optional()
    .describe(
      "Maximum sandbox lifetime in milliseconds. Defaults to 120000 so each call gets a short-lived sandbox.",
    ),
});

type E2bLanguageAlias = keyof typeof E2B_LANGUAGE_ALIASES;

function normalizeLanguage(language?: E2bLanguageAlias) {
  if (!language) {
    return "python";
  }

  return E2B_LANGUAGE_ALIASES[language];
}

function truncate(value: string | undefined, maxLength: number) {
  if (!value) {
    return undefined;
  }

  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

export const e2bRunCodeTool = tool({
  description:
    "Run code inside a short-lived E2B cloud sandbox with outbound internet access disabled by default. Use this for calculations, data analysis, small scripts, debugging code snippets, or when you need isolated code execution.",
  inputSchema: e2bRunCodeParams,
  execute: async ({ code, language, timeoutMs, requestTimeoutMs, sandboxTimeoutMs }) => {
    const apiKey = env.E2B_API_KEY;
    if (!apiKey) {
      return { success: false, error: "E2B API key is not configured." };
    }

    const { Sandbox } = await import("@e2b/code-interpreter");
    const normalizedLanguage = normalizeLanguage(language);
    const effectiveRequestTimeoutMs = requestTimeoutMs ?? 30000;
    const effectiveTimeoutMs = timeoutMs ?? 30000;
    const effectiveSandboxTimeoutMs =
      sandboxTimeoutMs ?? Math.max(120000, effectiveTimeoutMs + 30000);

    let sandbox: InstanceType<typeof Sandbox> | null = null;

    try {
      sandbox = await Sandbox.create({
        allowInternetAccess: false,
        timeoutMs: effectiveSandboxTimeoutMs,
        requestTimeoutMs: effectiveRequestTimeoutMs,
      });

      const execution = await sandbox.runCode(code, {
        language: normalizedLanguage,
        timeoutMs: effectiveTimeoutMs,
        requestTimeoutMs: effectiveRequestTimeoutMs,
      });

      return {
        success: !execution.error,
        language: normalizedLanguage,
        text: truncate(execution.text, 4000) ?? null,
        stdout: execution.logs.stdout.slice(0, 50).map((line) => truncate(line, 2000) ?? ""),
        stderr: execution.logs.stderr.slice(0, 50).map((line) => truncate(line, 2000) ?? ""),
        results: execution.results.slice(0, 10).map((result) => ({
          isMainResult: result.isMainResult,
          text: truncate(result.text, 4000) ?? null,
          markdown: truncate(result.markdown, 4000) ?? null,
          json: truncate(result.json, 4000) ?? null,
          formats: result.formats(),
          hasChart: Boolean(result.chart),
          hasData: Boolean(result.data),
        })),
        error: execution.error
          ? {
              name: execution.error.name,
              value: truncate(execution.error.value, 2000) ?? "",
              traceback: truncate(execution.error.traceback, 6000) ?? "",
            }
          : null,
      };
    } catch (error) {
      return {
        success: false,
        language: normalizedLanguage,
        error:
          error instanceof Error
            ? {
                name: error.name,
                value: truncate(error.message, 2000) ?? "Unknown E2B error.",
              }
            : {
                name: "E2BExecutionError",
                value: "Unknown E2B error.",
              },
      };
    } finally {
      if (sandbox) {
        await sandbox.kill({ requestTimeoutMs: effectiveRequestTimeoutMs }).catch(() => undefined);
      }
    }
  },
});
