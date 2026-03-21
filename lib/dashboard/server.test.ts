import { beforeEach, describe, expect, it, vi } from "vitest";

describe("getDashboardBaseData", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("next/headers", () => ({
      cookies: async () => ({
        get: vi.fn().mockReturnValue({
          value: "abcdefghijklmnopqrstuvwx",
        }),
      }),
    }));
  });

  it("deduplicates repeated calls via react cache", async () => {
    const user = { id: "user-1", email: "user@example.com" };
    const getUser = vi.fn().mockResolvedValue({ data: { user } });
    const from = vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: user.id,
                  full_name: "User Example",
                  avatar_url: null,
                  created_at: "2024-01-01T00:00:00.000Z",
                },
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === "team_memberships") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                returns: async () => ({
                  data: [{ team_id: "team-1", role: "owner", teams: { name: "Team One" } }],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      if (table === "notification_preferences") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  marketing_emails: false,
                  product_updates: true,
                  security_alerts: true,
                },
                error: null,
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    const createClient = vi.fn().mockResolvedValue({
      auth: { getUser },
      from,
    });
    const getCachedTeamContextForUser = vi.fn().mockResolvedValue({
      teamId: "team-1",
      teamName: "Team One",
      role: "owner",
    });

    vi.doMock("@/lib/supabase/server", () => ({ createClient }));
    vi.doMock("@/lib/team-context-cache", () => ({ getCachedTeamContextForUser }));
    vi.doMock("react", async () => {
      const actual = await vi.importActual<typeof import("react")>("react");
      return {
        ...actual,
        cache: <TArgs extends unknown[], TResult>(fn: (...args: TArgs) => Promise<TResult>) => {
          let hasValue = false;
          let cachedValue: Promise<TResult> | null = null;
          return (...args: TArgs) => {
            if (!hasValue) {
              hasValue = true;
              cachedValue = fn(...args);
            }
            return cachedValue as Promise<TResult>;
          };
        },
      };
    });
    vi.doMock("next/navigation", () => ({
      redirect: vi.fn((path: string) => {
        throw new Error(`redirect:${path}`);
      }),
    }));

    const { getDashboardBaseData } = await import("./server");
    const first = await getDashboardBaseData();
    const second = await getDashboardBaseData();

    expect(first).toEqual(second);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(getCachedTeamContextForUser).toHaveBeenCalledTimes(1);
  });
});
