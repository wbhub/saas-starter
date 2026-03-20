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
    const teamMembershipsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      returns: vi
        .fn()
        .mockResolvedValue({
          data: [
            {
              user_id: "user_123",
              role: "owner",
              created_at: "2026-01-01T00:00:00Z",
              profiles: { id: "user_123", full_name: "Test User" },
            },
          ],
          error: null,
        }),
    };
    const teamInvitesQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      returns: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const notificationPreferencesQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          marketing_emails: false,
          product_updates: true,
          security_alerts: true,
        },
        error: null,
      }),
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
        from: vi.fn((table: string) => {
          if (table === "profiles") {
            return profilesQuery;
          }
          if (table === "subscriptions") {
            return subscriptionsQuery;
          }
          if (table === "team_memberships") {
            return teamMembershipsQuery;
          }
          if (table === "team_invites") {
            return teamInvitesQuery;
          }
          if (table === "notification_preferences") {
            return notificationPreferencesQuery;
          }
          throw new Error(`Unexpected table: ${table}`);
        }),
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
    vi.doMock("@/lib/team-context", () => ({
      canManageTeamBilling: vi.fn((role: string) => role === "owner" || role === "admin"),
      getTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role: "owner",
      }),
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

  it("redirects to login when there is no authenticated user", async () => {
    const redirect = vi.fn(() => {
      throw new Error("redirected");
    });

    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({ data: { user: null } }),
        },
      }),
    }));
    vi.doMock("next/navigation", () => ({
      redirect,
    }));
    vi.doMock("@/lib/stripe/config", () => ({
      getPlanByPriceId: vi.fn(() => null),
    }));
    vi.doMock("@/app/dashboard/actions", () => ({
      logout: vi.fn(),
    }));
    vi.doMock("@/lib/team-context", () => ({
      canManageTeamBilling: vi.fn((role: string) => role === "owner" || role === "admin"),
      getTeamContextForUser: vi.fn(),
    }));

    const DashboardPage = (await import("./page")).default;
    await expect(DashboardPage()).rejects.toThrow("redirected");

    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("continues rendering when profile query fails", async () => {
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
        from: vi.fn((table: string) => {
          if (table === "profiles") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi
                .fn()
                .mockResolvedValue({ data: null, error: { message: "boom" } }),
            };
          }

          if (table === "team_memberships") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              returns: vi.fn().mockResolvedValue({ data: [], error: null }),
            };
          }

          if (table === "notification_preferences") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  marketing_emails: false,
                  product_updates: true,
                  security_alerts: true,
                },
                error: null,
              }),
            };
          }

          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }),
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
    vi.doMock("@/lib/team-context", () => ({
      canManageTeamBilling: vi.fn((role: string) => role === "owner" || role === "admin"),
      getTeamContextForUser: vi.fn().mockResolvedValue(null),
    }));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const DashboardPage = (await import("./page")).default;
    await expect(DashboardPage()).resolves.toBeTruthy();

    expect(consoleError).toHaveBeenCalledWith(
      "Failed to load dashboard profile",
      expect.objectContaining({ message: "boom" }),
    );
    consoleError.mockRestore();
  });
});

