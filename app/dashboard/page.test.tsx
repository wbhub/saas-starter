import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Dashboard page billing selection", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("filters subscription query to live statuses", async () => {
    const profileMaybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { full_name: null, created_at: "2026-01-01T00:00:00Z" }, error: null });
    const subscriptionIn = vi.fn().mockReturnThis();
    const subscriptionMaybeSingle = vi
      .fn()
      .mockResolvedValue({ data: null, error: null });

    const profilesQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: profileMaybeSingle,
    };
    const subscriptionsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: subscriptionIn,
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: subscriptionMaybeSingle,
    };

    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: {
              user: {
                id: "user_123",
                email: "user@example.com",
                created_at: "2026-01-01T00:00:00Z",
              },
            },
          }),
        },
        from: vi.fn((table: string) =>
          table === "profiles" ? profilesQuery : subscriptionsQuery,
        ),
      }),
    }));
    vi.doMock("next/navigation", () => ({
      redirect: vi.fn(),
    }));
    vi.doMock("@/lib/stripe/config", () => ({
      getPlanByPriceId: vi.fn(() => null),
    }));
    vi.doMock("@/app/dashboard/actions", () => ({
      logout: vi.fn(),
    }));

    const DashboardPage = (await import("./page")).default;
    await DashboardPage();

    expect(subscriptionIn).toHaveBeenCalledWith("status", [
      "incomplete",
      "trialing",
      "active",
      "past_due",
      "unpaid",
      "paused",
    ]);
  });
});

