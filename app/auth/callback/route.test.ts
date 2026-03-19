import { beforeEach, describe, expect, it, vi } from "vitest";

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("redirects to login when code is missing", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(),
    }));

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/auth/callback?next=/dashboard"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?error=missing_code",
    );
  });
});
