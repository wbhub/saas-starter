import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { LAST_AUTH_PROVIDER_COOKIE } from "@/lib/auth/social-auth";

function makeRequest(url: string) {
  return new NextRequest(url);
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("redirects to login when code is missing", async () => {
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "https://app.example.com", NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-key" },
      getAppUrl: () => "https://app.example.com",
    }));
    vi.doMock("@supabase/ssr", () => ({
      createServerClient: vi.fn(),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@/lib/http/client-ip", () => ({
      getClientIp: vi.fn().mockReturnValue("198.51.100.1"),
    }));

    const { GET } = await import("./route");
    const response = await GET(makeRequest("http://localhost/auth/callback?next=/dashboard"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.example.com/login?error=missing_code",
    );
  });

  it("uses configured app origin for success redirect", async () => {
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "https://app.example.com", NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-key" },
      getAppUrl: () => "https://app.example.com",
    }));
    vi.doMock("@supabase/ssr", () => ({
      createServerClient: () => ({
        auth: {
          exchangeCodeForSession: async () => ({
            data: { session: { user: { id: "user_123" } } },
            error: null,
          }),
        },
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@/lib/http/client-ip", () => ({
      getClientIp: vi.fn().mockReturnValue("198.51.100.1"),
    }));

    const { GET } = await import("./route");
    const response = await GET(
      makeRequest("https://evil.example/auth/callback?code=test&next=/dashboard"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.example.com/dashboard");
  });

  it("stores the last social provider after successful callback", async () => {
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "https://app.example.com", NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-key" },
      getAppUrl: () => "https://app.example.com",
    }));
    vi.doMock("@supabase/ssr", () => ({
      createServerClient: () => ({
        auth: {
          exchangeCodeForSession: async () => ({
            data: {
              session: {
                user: { id: "user_123", app_metadata: { provider: "google" } },
              },
            },
            error: null,
          }),
        },
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@/lib/http/client-ip", () => ({
      getClientIp: vi.fn().mockReturnValue("198.51.100.1"),
    }));

    const { GET } = await import("./route");
    const response = await GET(
      makeRequest("https://app.example.com/auth/callback?code=test&provider=google"),
    );

    expect(response.status).toBe(307);
    expect(response.cookies.get(LAST_AUTH_PROVIDER_COOKIE)?.value).toBe("google");
  });

  it("uses only session provider (ignores query provider)", async () => {
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "https://app.example.com", NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-key" },
      getAppUrl: () => "https://app.example.com",
    }));
    vi.doMock("@supabase/ssr", () => ({
      createServerClient: () => ({
        auth: {
          exchangeCodeForSession: async () => ({
            data: {
              session: {
                user: { id: "user_123", app_metadata: { provider: "azure" } },
              },
            },
            error: null,
          }),
        },
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@/lib/http/client-ip", () => ({
      getClientIp: vi.fn().mockReturnValue("198.51.100.1"),
    }));

    const { GET } = await import("./route");
    const response = await GET(
      makeRequest("https://app.example.com/auth/callback?code=test&provider=google"),
    );

    expect(response.status).toBe(307);
    expect(response.cookies.get(LAST_AUTH_PROVIDER_COOKIE)?.value).toBe("microsoft");
  });

  it("does not set cookie when session provider is non-social", async () => {
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "https://app.example.com", NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-key" },
      getAppUrl: () => "https://app.example.com",
    }));
    vi.doMock("@supabase/ssr", () => ({
      createServerClient: () => ({
        auth: {
          exchangeCodeForSession: async () => ({
            data: {
              session: {
                user: { id: "user_123", app_metadata: { provider: "email" } },
              },
            },
            error: null,
          }),
        },
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@/lib/http/client-ip", () => ({
      getClientIp: vi.fn().mockReturnValue("198.51.100.1"),
    }));

    const { GET } = await import("./route");
    const response = await GET(
      makeRequest("https://app.example.com/auth/callback?code=test&provider=google"),
    );

    expect(response.status).toBe(307);
    expect(response.cookies.get(LAST_AUTH_PROVIDER_COOKIE)).toBeUndefined();
  });

  it("does not set cookie when session provider is missing", async () => {
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "https://app.example.com", NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-key" },
      getAppUrl: () => "https://app.example.com",
    }));
    vi.doMock("@supabase/ssr", () => ({
      createServerClient: () => ({
        auth: {
          exchangeCodeForSession: async () => ({
            data: { session: { user: { id: "user_123", app_metadata: {} } } },
            error: null,
          }),
        },
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@/lib/http/client-ip", () => ({
      getClientIp: vi.fn().mockReturnValue("198.51.100.1"),
    }));

    const { GET } = await import("./route");
    const response = await GET(
      makeRequest("https://app.example.com/auth/callback?code=test&provider=google"),
    );

    expect(response.status).toBe(307);
    expect(response.cookies.get(LAST_AUTH_PROVIDER_COOKIE)).toBeUndefined();
  });

  it("falls back to dashboard for unsafe next values", async () => {
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "https://app.example.com", NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-key" },
      getAppUrl: () => "https://app.example.com",
    }));
    vi.doMock("@supabase/ssr", () => ({
      createServerClient: () => ({
        auth: {
          exchangeCodeForSession: async () => ({
            data: { session: { user: { id: "user_123" } } },
            error: null,
          }),
        },
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@/lib/http/client-ip", () => ({
      getClientIp: vi.fn().mockReturnValue("198.51.100.1"),
    }));

    const { GET } = await import("./route");
    const response = await GET(
      makeRequest(
        "https://app.example.com/auth/callback?code=test&next=%2Fdashboard%0D%0ALocation%3A%20https%3A%2F%2Fevil.example",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.example.com/dashboard");
  });

  it("falls back to dashboard for double-encoded protocol-relative next", async () => {
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "https://app.example.com", NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-key" },
      getAppUrl: () => "https://app.example.com",
    }));
    vi.doMock("@supabase/ssr", () => ({
      createServerClient: () => ({
        auth: {
          exchangeCodeForSession: async () => ({
            data: { session: { user: { id: "user_123" } } },
            error: null,
          }),
        },
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@/lib/http/client-ip", () => ({
      getClientIp: vi.fn().mockReturnValue("198.51.100.1"),
    }));

    const { GET } = await import("./route");
    const response = await GET(
      makeRequest("https://app.example.com/auth/callback?code=test&next=%252F%252Fevil.example"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.example.com/dashboard");
  });

  it("uses 10 requests per minute callback rate limit", async () => {
    const checkRateLimit = vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });

    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "https://app.example.com", NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-key" },
      getAppUrl: () => "https://app.example.com",
    }));
    vi.doMock("@supabase/ssr", () => ({
      createServerClient: () => ({
        auth: {
          exchangeCodeForSession: async () => ({
            data: { session: { user: { id: "user_123" } } },
            error: null,
          }),
        },
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit,
    }));
    vi.doMock("@/lib/http/client-ip", () => ({
      getClientIp: vi.fn().mockReturnValue("198.51.100.1"),
    }));

    const { GET } = await import("./route");
    await GET(makeRequest("http://localhost/auth/callback?code=test"));

    expect(checkRateLimit).toHaveBeenCalledWith({
      key: "auth-callback:ip:198.51.100.1",
      limit: 10,
      windowMs: 60 * 1000,
    });
  });
});
