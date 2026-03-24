import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type MockParseResult =
  | { success: true; data: Record<string, unknown> }
  | { success: false; error: z.ZodError; tooLarge?: boolean };

type LoadOptions = {
  csrfError?: Response | null;
  contentTypeError?: Response | null;
  user?: { id: string; email?: string } | null;
  parseResult?: MockParseResult;
  checkRateLimitImpl?: ReturnType<typeof vi.fn>;
};

describe("withAuthedRoute", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  async function loadWithAuthedRoute({
    csrfError = null,
    contentTypeError = null,
    user = { id: "user_1" },
    parseResult = { success: true, data: { name: "Test" } },
    checkRateLimitImpl = vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
  }: LoadOptions = {}) {
    const parseJsonWithSchema = vi.fn().mockResolvedValue(parseResult);

    vi.doMock("@/lib/security/csrf", () => ({
      verifyCsrfProtection: vi.fn().mockReturnValue(csrfError),
    }));
    vi.doMock("@/lib/http/content-type", () => ({
      requireJsonContentType: vi.fn().mockReturnValue(contentTypeError),
    }));
    vi.doMock("@/lib/http/request-validation", () => ({
      parseJsonWithSchema,
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: checkRateLimitImpl,
    }));
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({ data: { user } }),
        },
      }),
    }));

    const mod = await import("./authed-route");
    return { withAuthedRoute: mod.withAuthedRoute, parseJsonWithSchema, checkRateLimitImpl };
  }

  it("rejects requests that fail CSRF validation", async () => {
    const csrfError = new Response(JSON.stringify({ error: "Bad origin" }), { status: 403 });
    const { withAuthedRoute } = await loadWithAuthedRoute({ csrfError });

    const response = await withAuthedRoute({
      request: new Request("http://localhost/api/test", { method: "POST" }),
      handler: async () => jsonResponse({ ok: true }),
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it("rejects unauthenticated requests with 401", async () => {
    const { withAuthedRoute } = await loadWithAuthedRoute({ user: null });

    const response = await withAuthedRoute({
      request: new Request("http://localhost/api/test", { method: "POST" }),
      handler: async () => jsonResponse({ ok: true }),
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ ok: false, error: "Unauthorized" }));
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it("uses custom unauthorizedMessage", async () => {
    const { withAuthedRoute } = await loadWithAuthedRoute({ user: null });

    const response = await withAuthedRoute({
      request: new Request("http://localhost/api/test", { method: "POST" }),
      unauthorizedMessage: "Please log in.",
      handler: async () => jsonResponse({ ok: true }),
    });

    const body = await response.json();
    expect(body.error).toBe("Please log in.");
  });

  it("applies rate limits and denies when exceeded", async () => {
    const checkRateLimitImpl = vi
      .fn()
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 15 });
    const { withAuthedRoute } = await loadWithAuthedRoute({ checkRateLimitImpl });

    const response = await withAuthedRoute({
      request: new Request("http://localhost/api/test", { method: "POST" }),
      rateLimits: ({ userId }) => [
        { key: `action:${userId}`, limit: 1, windowMs: 1000, message: "Slow down" },
      ],
      handler: async () => jsonResponse({ ok: true }),
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("15");
    expect(response.headers.get("x-request-id")).toBeTruthy();
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ ok: false, error: "Slow down" }));
  });

  it("rejects oversized payloads with 413", async () => {
    const { withAuthedRoute } = await loadWithAuthedRoute({
      parseResult: { success: false, error: new z.ZodError([]), tooLarge: true },
    });

    const response = await withAuthedRoute({
      request: new Request("http://localhost/api/test", { method: "POST" }),
      schema: z.object({ name: z.string() }),
      handler: async () => jsonResponse({ ok: true }),
    });

    expect(response.status).toBe(413);
    expect(response.headers.get("x-request-id")).toBeTruthy();
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ ok: false, error: "Request payload is too large." }),
    );
  });

  it("returns 400 for schema validation failure and calls onInvalidPayload", async () => {
    const onInvalidPayload = vi.fn();
    const { withAuthedRoute } = await loadWithAuthedRoute({
      parseResult: { success: false, error: new z.ZodError([]) },
    });

    const response = await withAuthedRoute({
      request: new Request("http://localhost/api/test", { method: "POST" }),
      schema: z.object({ name: z.string() }),
      onInvalidPayload,
      handler: async () => jsonResponse({ ok: true }),
    });

    expect(response.status).toBe(400);
    expect(onInvalidPayload).toHaveBeenCalledWith({ userId: "user_1" });
  });

  it("passes validated body and user into the handler", async () => {
    const { withAuthedRoute } = await loadWithAuthedRoute({
      parseResult: { success: true, data: { token: "abc123" } },
    });
    const handler = vi.fn(async ({ body, user }) => {
      return jsonResponse({ userId: user.id, body });
    });

    const response = await withAuthedRoute({
      request: new Request("http://localhost/api/test", { method: "POST" }),
      schema: z.object({ token: z.string() }),
      handler,
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({
      userId: "user_1",
      body: { token: "abc123" },
    }));
  });

  it("attaches x-request-id to handler responses", async () => {
    const { withAuthedRoute } = await loadWithAuthedRoute();

    const response = await withAuthedRoute({
      request: new Request("http://localhost/api/test", { method: "POST" }),
      handler: async () => jsonResponse({ ok: true }),
    });

    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it("skips content-type check when no schema and requireJsonBody is false", async () => {
    const contentTypeError = new Response(JSON.stringify({ error: "Wrong CT" }), { status: 415 });
    const { withAuthedRoute } = await loadWithAuthedRoute({ contentTypeError });

    const response = await withAuthedRoute({
      request: new Request("http://localhost/api/test", { method: "POST" }),
      handler: async () => jsonResponse({ ok: true }),
    });

    expect(response.status).toBe(200);
  });

  it("enforces content-type check when requireJsonBody is true", async () => {
    const contentTypeError = new Response(JSON.stringify({ error: "Wrong CT" }), { status: 415 });
    const { withAuthedRoute } = await loadWithAuthedRoute({ contentTypeError });

    const response = await withAuthedRoute({
      request: new Request("http://localhost/api/test", { method: "POST" }),
      requireJsonBody: true,
      handler: async () => jsonResponse({ ok: true }),
    });

    expect(response.status).toBe(415);
  });
});
