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

  it("accepts api request when csrf cookie and header match with allowed origin", async () => {
    const { verifyCsrfProtection } = await import("./csrf");
    const token = "abcdefghijklmnopqrstuvwx";
    const request = new Request("https://app.example.com/api/ai/chat", {
      method: "POST",
      headers: {
        origin: "https://app.example.com",
        cookie: `csrf_token=${token}`,
        "x-csrf-token": token,
      },
    });

    expect(verifyCsrfProtection(request)).toBeNull();
  });

  it("rejects api request when csrf cookie is missing", async () => {
    const { verifyCsrfProtection } = await import("./csrf");
    const request = new Request("https://app.example.com/api/ai/chat", {
      method: "POST",
      headers: {
        origin: "https://app.example.com",
        "x-csrf-token": "abcdefghijklmnopqrstuvwx",
      },
    });

    const response = verifyCsrfProtection(request);
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({ ok: false, error: "Missing CSRF token." });
  });

  it("rejects api request when csrf header is missing", async () => {
    const { verifyCsrfProtection } = await import("./csrf");
    const request = new Request("https://app.example.com/api/ai/chat", {
      method: "POST",
      headers: {
        origin: "https://app.example.com",
        cookie: "csrf_token=abcdefghijklmnopqrstuvwx",
      },
    });

    const response = verifyCsrfProtection(request);
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({ ok: false, error: "Missing CSRF token." });
  });

  it("rejects api request when csrf cookie and header tokens mismatch", async () => {
    const { verifyCsrfProtection } = await import("./csrf");
    const request = new Request("https://app.example.com/api/ai/chat", {
      method: "POST",
      headers: {
        origin: "https://app.example.com",
        cookie: "csrf_token=abcdefghijklmnopqrstuvwx",
        "x-csrf-token": "zyxwvutsrqponmlkjihgfedc",
      },
    });

    const response = verifyCsrfProtection(request);
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({ ok: false, error: "Invalid CSRF token." });
  });

  it("rejects api request from mismatched origin", async () => {
    const { verifyCsrfProtection } = await import("./csrf");
    const token = "abcdefghijklmnopqrstuvwx";
    const request = new Request("https://app.example.com/api/ai/chat", {
      method: "POST",
      headers: {
        origin: "https://malicious.example.net",
        cookie: `csrf_token=${token}`,
        "x-csrf-token": token,
      },
    });

    const response = verifyCsrfProtection(request);
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({
      ok: false,
      error: "Invalid request origin.",
    });
  });

  it("rejects malformed csrf token shapes before token comparison", async () => {
    const { verifyCsrfProtection, ensureTokenShape } = await import("./csrf");
    expect(ensureTokenShape("short-token")).toBe(false);
    expect(ensureTokenShape("abc def ghijklmnopqrstuvwxyz")).toBe(false);

    const request = new Request("https://app.example.com/api/ai/chat", {
      method: "POST",
      headers: {
        origin: "https://app.example.com",
        cookie: "csrf_token=short-token",
        "x-csrf-token": "short-token",
      },
    });

    const response = verifyCsrfProtection(request);
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({ ok: false, error: "Missing CSRF token." });
  });

  it("verifies server action csrf token from form data", async () => {
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

  it("rejects server action requests with missing origin", async () => {
    const { verifyCsrfProtectionForServerAction } = await import("./csrf");
    const requestHeaders = new Headers({
      host: "app.example.com",
      cookie: "csrf_token=abcdefghijklmnopqrstuvwx",
      "x-csrf-token": "abcdefghijklmnopqrstuvwx",
    });

    const result = verifyCsrfProtectionForServerAction(requestHeaders);

    expect(result).toEqual({
      status: "error",
      message: "Invalid request origin.",
    });
  });

  it("accepts server action request when forwarded origin matches", async () => {
    const { verifyCsrfProtectionForServerAction } = await import("./csrf");
    const token = "abcdefghijklmnopqrstuvwx";
    const requestHeaders = new Headers({
      origin: "https://proxy.example.com",
      "x-forwarded-host": "proxy.example.com",
      "x-forwarded-proto": "https",
      cookie: `csrf_token=${token}`,
      "x-csrf-token": token,
    });

    expect(verifyCsrfProtectionForServerAction(requestHeaders)).toBeNull();
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

  it("rejects server action when submitted token does not match cookie token", async () => {
    const { verifyCsrfProtectionForServerAction } = await import("./csrf");
    const requestHeaders = new Headers({
      origin: "https://app.example.com",
      host: "app.example.com",
      cookie: "csrf_token=abcdefghijklmnopqrstuvwx",
      "x-csrf-token": "zyxwvutsrqponmlkjihgfedc",
    });

    const result = verifyCsrfProtectionForServerAction(requestHeaders);

    expect(result).toEqual({
      status: "error",
      message: "Invalid CSRF token.",
    });
  });
});
