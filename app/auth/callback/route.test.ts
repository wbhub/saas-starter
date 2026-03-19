import { beforeEach, describe, expect, it, vi } from "vitest";

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("redirects to login when code is missing", async () => {
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "https://app.example.com" },
    }));
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(),
    }));

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/auth/callback?next=/dashboard"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.example.com/login?error=missing_code",
    );
  });

  it("uses configured app origin for success redirect", async () => {
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "https://app.example.com" },
    }));
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          exchangeCodeForSession: async () => ({ error: null }),
        },
      }),
    }));

    const { GET } = await import("./route");
    const response = await GET(
      new Request("https://evil.example/auth/callback?code=test&next=/dashboard"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.example.com/dashboard");
  });

  it("falls back to dashboard for unsafe next values", async () => {
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "https://app.example.com" },
    }));
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          exchangeCodeForSession: async () => ({ error: null }),
        },
      }),
    }));

    const { GET } = await import("./route");
    const response = await GET(
      new Request(
        "https://app.example.com/auth/callback?code=test&next=%2Fdashboard%0D%0ALocation%3A%20https%3A%2F%2Fevil.example",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.example.com/dashboard");
  });
});
