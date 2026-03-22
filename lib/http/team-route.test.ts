import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { TeamContext } from "@/lib/team-context";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type MockParseResult =
  | { success: true; data: Record<string, unknown> }
  | { success: false; error: z.ZodError; tooLarge?: boolean };

type LoadWithTeamRouteOptions = {
  csrfError?: Response | null;
  user?: { id: string } | null;
  teamContext?: TeamContext | null;
  parseResult?: MockParseResult;
  checkRateLimitImpl?: ReturnType<typeof vi.fn>;
};

describe("withTeamRoute", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  async function loadWithTeamRoute({
    csrfError = null,
    user = { id: "user_1" },
    teamContext = { teamId: "team_1", teamName: "Acme", role: "owner" },
    parseResult = { success: true, data: { name: "Project A" } },
    checkRateLimitImpl = vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
  }: LoadWithTeamRouteOptions = {}) {
    const parseJsonWithSchema = vi.fn().mockResolvedValue(parseResult);

    vi.doMock("@/lib/security/csrf", () => ({
      verifyCsrfProtection: vi.fn().mockReturnValue(csrfError),
    }));
    vi.doMock("@/lib/http/content-type", () => ({
      requireJsonContentType: vi.fn().mockReturnValue(null),
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
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue(teamContext),
    }));

    const mod = await import("./team-route");
    return { withTeamRoute: mod.withTeamRoute, parseJsonWithSchema, checkRateLimitImpl };
  }

  it("rejects requests that fail CSRF validation", async () => {
    const csrfError = new Response("csrf denied", { status: 403 });
    const { withTeamRoute } = await loadWithTeamRoute({ csrfError });

    const response = await withTeamRoute({
      request: new Request("http://localhost/api/team", { method: "POST" }),
      handler: async () => jsonResponse({ ok: true }),
    });

    expect(response.status).toBe(403);
  });

  it("rejects unauthenticated requests with 401", async () => {
    const { withTeamRoute } = await loadWithTeamRoute({ user: null });

    const response = await withTeamRoute({
      request: new Request("http://localhost/api/team", { method: "POST" }),
      handler: async () => jsonResponse({ ok: true }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: "Unauthorized" }));
  });

  it("rejects missing team membership with 403", async () => {
    const { withTeamRoute } = await loadWithTeamRoute({ teamContext: null });

    const response = await withTeamRoute({
      request: new Request("http://localhost/api/team", { method: "POST" }),
      handler: async () => jsonResponse({ ok: true }),
    });

    expect(response.status).toBe(403);
  });

  it("rejects disallowed roles with 403", async () => {
    const { withTeamRoute } = await loadWithTeamRoute({
      teamContext: { teamId: "team_1", teamName: "Acme", role: "member" },
    });

    const response = await withTeamRoute({
      request: new Request("http://localhost/api/team", { method: "POST" }),
      allowedRoles: ["owner", "admin"],
      handler: async () => jsonResponse({ ok: true }),
    });

    expect(response.status).toBe(403);
  });

  it("applies all configured rate limits and denies on the first failed descriptor", async () => {
    const checkRateLimitImpl = vi
      .fn()
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 12 })
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 3 });
    const { withTeamRoute } = await loadWithTeamRoute({ checkRateLimitImpl });

    const response = await withTeamRoute({
      request: new Request("http://localhost/api/team", { method: "POST" }),
      rateLimits: () => [
        { key: "team-action:burst", limit: 1, windowMs: 1000, message: "Burst limit exceeded" },
        { key: "team-action:sustained", limit: 5, windowMs: 10_000, message: "Sustained limit exceeded" },
      ],
      handler: async () => jsonResponse({ ok: true }),
    });

    expect(checkRateLimitImpl).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("12");
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ error: "Burst limit exceeded" }),
    );
  });

  it("rejects oversized payloads with 413 when schema parse marks tooLarge", async () => {
    const { withTeamRoute } = await loadWithTeamRoute({
      parseResult: {
        success: false as const,
        error: new z.ZodError([]),
        tooLarge: true,
      },
    });

    const response = await withTeamRoute({
      request: new Request("http://localhost/api/team", { method: "POST" }),
      schema: z.object({ name: z.string() }),
      handler: async () => jsonResponse({ ok: true }),
    });

    expect(response.status).toBe(413);
  });

  it("returns 400 for schema validation failure and calls onInvalidPayload", async () => {
    const onInvalidPayload = vi.fn();
    const { withTeamRoute } = await loadWithTeamRoute({
      parseResult: {
        success: false as const,
        error: new z.ZodError([]),
      },
    });

    const response = await withTeamRoute({
      request: new Request("http://localhost/api/team", { method: "POST" }),
      schema: z.object({ name: z.string() }),
      onInvalidPayload,
      handler: async () => jsonResponse({ ok: true }),
    });

    expect(response.status).toBe(400);
    expect(onInvalidPayload).toHaveBeenCalledWith({ userId: "user_1", teamId: "team_1" });
  });

  it("passes validated body and team context into the handler", async () => {
    const { withTeamRoute } = await loadWithTeamRoute({
      parseResult: {
        success: true as const,
        data: { name: "Roadmap", visibility: "private" },
      },
      teamContext: { teamId: "team_1", teamName: "Acme", role: "admin" },
    });
    const handler = vi.fn(async ({ body, teamContext }) => {
      return jsonResponse({
        teamId: teamContext.teamId,
        role: teamContext.role,
        body,
      });
    });

    const response = await withTeamRoute({
      request: new Request("http://localhost/api/team", { method: "POST" }),
      schema: z.object({
        name: z.string(),
        visibility: z.enum(["private", "public"]),
      }),
      handler,
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        teamId: "team_1",
        role: "admin",
        body: { name: "Roadmap", visibility: "private" },
      }),
    );
  });
});
