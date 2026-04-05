import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockCommonTeamRolesRootKeys } from "@/test-support/i18n-team-role-mocks";

describe("Dashboard page billing selection", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/ai/provider", () => ({
      isAiProviderConfigured: false,
      isAiProviderConfiguredForModel: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("next/headers", () => ({
      cookies: async () => ({
        get: vi.fn().mockReturnValue({
          value: "abcdefghijklmnopqrstuvwx",
        }),
      }),
    }));
    vi.doMock("next-intl/server", () => ({
      getLocale: vi.fn(async () => "en"),
      getTranslations: vi.fn(async (namespace?: string) => {
        if (namespace === "Landing.pricing") {
          return (key: string) => {
            const planNames: Record<string, string> = {
              "plans.starter.name": "Starter",
              "plans.growth.name": "Growth",
              "plans.pro.name": "Pro",
            };
            return planNames[key] ?? key;
          };
        }
        if (namespace === "DashboardBillingPage") {
          return (key: string) => key;
        }
        return (key: string) => {
          if (key in mockCommonTeamRolesRootKeys) {
            return mockCommonTeamRolesRootKeys[key];
          }
          return key;
        };
      }),
    }));
  });

  it("filters subscription query to live statuses", async () => {
    const profileMaybeSingle = vi.fn().mockResolvedValue({
      data: { full_name: null, created_at: "2026-01-01T00:00:00Z" },
      error: null,
    });
    const subscriptionIn = vi.fn().mockReturnThis();
    const subscriptionMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });

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
        from: vi.fn((table: string) => {
          if (table === "profiles") {
            return profilesQuery;
          }
          if (table === "subscriptions") {
            return subscriptionsQuery;
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
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
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
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn(),
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
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }),
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
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role: "owner",
      }),
    }));
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const DashboardPage = (await import("./page")).default;
    await expect(DashboardPage()).resolves.toBeTruthy();

    expect(consoleWarn).toHaveBeenCalledWith(
      "Failed to load dashboard profile; continuing with fallback profile data.",
      expect.objectContaining({
        error: expect.objectContaining({ message: "boom" }),
      }),
    );
    consoleWarn.mockRestore();
  });
});
