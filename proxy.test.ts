import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

function makeRequest(url: string) {
  return new NextRequest(url);
}

describe("proxy auth guard", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/http/request-id", () => ({
      createRequestId: () => "request-id-123",
      REQUEST_ID_HEADER: "x-request-id",
    }));
    vi.doMock("@/lib/security/csrf", () => ({
      CSRF_COOKIE_NAME: "csrf_token",
      CSRF_CLIENT_COOKIE_NAME: "csrf_token_client",
      createCsrfToken: () => "csrf-token-value",
      getCsrfCookieOptions: () => ({
        httpOnly: true,
        sameSite: "strict",
        secure: true,
        path: "/",
        maxAge: 60,
      }),
      getClientReadableCsrfCookieOptions: () => ({
        httpOnly: false,
        sameSite: "strict",
        secure: true,
        path: "/",
        maxAge: 60,
      }),
    }));
  });

  it("redirects unauthenticated dashboard requests to login with next", async () => {
    vi.doMock("@/lib/supabase/middleware", () => ({
      updateSession: vi.fn().mockResolvedValue({
        response: NextResponse.next(),
        user: null,
      }),
    }));

    const { proxy } = await import("./proxy");
    const response = await proxy(
      makeRequest("https://app.example.com/dashboard/settings?tab=billing"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.example.com/login?next=%2Fdashboard%2Fsettings%3Ftab%3Dbilling",
    );
    expect(response.cookies.get("csrf_token")?.value).toBe("csrf-token-value");
    expect(response.cookies.get("csrf_token_client")?.value).toBe("csrf-token-value");
  });

  it("skips session refresh for informational public pages", async () => {
    const updateSession = vi.fn();
    vi.doMock("@/lib/supabase/middleware", () => ({
      updateSession,
    }));

    const { proxy } = await import("./proxy");
    const response = await proxy(makeRequest("https://app.example.com/privacy-policy"));

    expect(updateSession).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("falls back to /dashboard when encoded backslash appears in next path", async () => {
    vi.doMock("@/lib/supabase/middleware", () => ({
      updateSession: vi.fn().mockResolvedValue({
        response: NextResponse.next(),
        user: null,
      }),
    }));

    const { proxy } = await import("./proxy");
    const response = await proxy(
      makeRequest("https://app.example.com/dashboard/%5Cevil?tab=billing"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.example.com/login?next=%2Fdashboard",
    );
  });

  it("allows authenticated dashboard requests", async () => {
    vi.doMock("@/lib/supabase/middleware", () => ({
      updateSession: vi.fn().mockResolvedValue({
        response: NextResponse.next(),
        user: { id: "user_123" },
      }),
    }));

    const { proxy } = await import("./proxy");
    const response = await proxy(makeRequest("https://app.example.com/dashboard"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("refreshes session state for login and api routes", async () => {
    const updateSession = vi.fn().mockResolvedValue({
      response: NextResponse.next(),
      user: null,
    });
    vi.doMock("@/lib/supabase/middleware", () => ({
      updateSession,
    }));

    const { proxy } = await import("./proxy");
    await proxy(makeRequest("https://app.example.com/login"));
    await proxy(makeRequest("https://app.example.com/api/intercom/boot"));

    expect(updateSession).toHaveBeenCalledTimes(2);
  });
});
