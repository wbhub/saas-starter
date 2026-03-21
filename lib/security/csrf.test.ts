import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("csrf helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/env", () => ({
      getAppUrl: () => "https://app.example.com",
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("verifies server action CSRF token from form data", async () => {
    const { verifyCsrfProtectionForServerAction } = await import("./csrf");
    const requestHeaders = new Headers({
      origin: "https://app.example.com",
      host: "app.example.com",
      cookie: "csrf_token=abcdefghijklmnopqrstuvwx",
    });
    const formData = new FormData();
    formData.set("csrf_token", "abcdefghijklmnopqrstuvwx");

    const result = verifyCsrfProtectionForServerAction(requestHeaders, formData);

    expect(result).toBeNull();
  });

  it("rejects server action when token is missing", async () => {
    const { verifyCsrfProtectionForServerAction } = await import("./csrf");
    const requestHeaders = new Headers({
      origin: "https://app.example.com",
      host: "app.example.com",
      cookie: "csrf_token=abcdefghijklmnopqrstuvwx",
    });

    const result = verifyCsrfProtectionForServerAction(requestHeaders);

    expect(result).toEqual({
      status: "error",
      message: "Missing CSRF token.",
    });
  });

  it("enforces API csrf checks even in test env", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const { verifyCsrfProtection } = await import("./csrf");
    const request = new Request("https://app.example.com/api/ai/chat", {
      method: "POST",
      headers: {
        origin: "https://app.example.com",
      },
    });

    const result = verifyCsrfProtection(request);

    expect(result).not.toBeNull();
    expect(result?.status).toBe(403);
  });
});
