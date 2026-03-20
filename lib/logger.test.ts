import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

async function loadLogger() {
  vi.resetModules();
  const mod = await import("./logger");
  return mod.logger;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  if (ORIGINAL_NODE_ENV === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  }

  if (ORIGINAL_SENTRY_DSN === undefined) {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  } else {
    process.env.NEXT_PUBLIC_SENTRY_DSN = ORIGINAL_SENTRY_DSN;
  }
});

describe("logger redaction", () => {
  it("redacts secrets from production structured error logs", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = await loadLogger();

    logger.error(
      "Stripe failed for sk_test_secret123",
      new Error("Invalid key sk_test_secret123"),
      {
        authorization: "Bearer very-secret-token",
        providerPayload: {
          apiKey: "pk_test_publicsecret",
          webhookSecret: "whsec_supersecret",
        },
      },
    );

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [serializedEntry] = errorSpy.mock.calls[0] ?? [];
    expect(typeof serializedEntry).toBe("string");

    const entry = JSON.parse(String(serializedEntry)) as Record<string, unknown>;
    expect(entry.msg).toBe("Stripe failed for [Redacted]");
    expect(entry.authorization).toBe("[Redacted]");

    const providerPayload = entry.providerPayload as Record<string, unknown>;
    expect(providerPayload.apiKey).toBe("[Redacted]");
    expect(providerPayload.webhookSecret).toBe("[Redacted]");

    const err = entry.err as Record<string, unknown>;
    expect(err.message).toBe("Invalid key [Redacted]");
    expect(String(err.stack)).not.toContain("sk_test_secret123");
  });

  it("treats second plain object as context in production", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = await loadLogger();

    logger.error("Team sync failed", { teamId: "team_123", token: "abc" });

    const [serializedEntry] = errorSpy.mock.calls[0] ?? [];
    const entry = JSON.parse(String(serializedEntry)) as Record<string, unknown>;

    expect(entry.err).toBeUndefined();
    expect(entry.teamId).toBe("team_123");
    expect(entry.token).toBe("[Redacted]");
  });

  it("redacts secrets in non-production console output", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = await loadLogger();

    logger.error("Provider failed with sk_test_abcdef", new Error("token=sk_test_abcdef"), {
      authorization: "Bearer super-secret-token",
      nested: {
        apiKey: "pk_test_nestedsecret",
      },
    });

    const [messageArg, errorArg, contextArg] = errorSpy.mock.calls[0] ?? [];
    expect(messageArg).toBe("Provider failed with [Redacted]");

    const err = errorArg as Error;
    expect(err.message).toContain("[Redacted]");
    expect(err.message).not.toContain("sk_test_abcdef");

    const context = contextArg as Record<string, unknown>;
    expect(context.authorization).toBe("[Redacted]");
    expect((context.nested as Record<string, unknown>).apiKey).toBe("[Redacted]");
  });
});
