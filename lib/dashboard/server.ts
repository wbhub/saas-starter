import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { measureDashboardTask } from "@/lib/dashboard/perf";
import { getCachedDashboardTeamSnapshot } from "@/lib/dashboard/team-snapshot-cache";
import { getDashboardAiUiGate } from "@/lib/dashboard/team-snapshot";
import type {
  DashboardAiUiGate,
  DashboardBillingContext,
  DashboardTeamUiMode,
} from "@/lib/dashboard/team-snapshot";
import type { TeamContext } from "@/lib/team-context";
import { getCachedTeamContextForUser } from "@/lib/team-context-cache";
import { getTeamMaxMembers } from "@/lib/team/limits";
import { logger } from "@/lib/logger";
import { CSRF_COOKIE_NAME } from "@/lib/security/csrf";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type ProfileRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  onboarding_completed_at: string | null;
};

type TeamMembershipRow = {
  user_id: string;
  role: "owner" | "admin" | "member";
  created_at: string;
  profiles:
    | {
        id: string;
        full_name: string | null;
        avatar_url: string | null;
      }
    | {
        id: string;
        full_name: string | null;
        avatar_url: string | null;
      }[]
    | null;
};

type DashboardTeamMembershipRow = {
  team_id: string;
  role: "owner" | "admin" | "member";
  teams: { name: string | null } | null;
};

type PendingInviteRow = {
  id: string;
  email: string;
  role: "admin" | "member";
  expires_at: string;
};

type TeamMember = {
  userId: string;
  fullName: string | null;
  role: "owner" | "admin" | "member";
  email: string | null;
  avatarUrl: string | null;
};

export type DashboardTeamOption = {
  teamId: string;
  teamName: string | null;
  role: "owner" | "admin" | "member";
};

export type DashboardShellData = Awaited<ReturnType<typeof getDashboardBaseData>> & {
  billingContext: DashboardBillingContext | null;
  aiUiGate: DashboardAiUiGate;
  teamUiMode: DashboardTeamUiMode | null;
  canSwitchTeams: boolean | null;
};

export {
  getDashboardAiUiGate,
  getDashboardBillingContext,
  getDashboardTeamUiMode,
  getLiveSubscription,
  getTeamMemberCount,
} from "@/lib/dashboard/team-snapshot";
export type { DashboardAiUiGateReason, SubscriptionRow } from "@/lib/dashboard/team-snapshot";

export type UsageMonthlyTotalsRow = {
  month_start: string;
  used_tokens: number;
  reserved_tokens: number;
};

type AiUsageRow = {
  created_at: string;
  prompt_tokens: number;
  completion_tokens: number;
};

const USAGE_MONTH_LIMIT = 6;

const getDashboardRequestContext = cache(async function getDashboardRequestContext() {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const csrfToken = cookieStore.get(CSRF_COOKIE_NAME)?.value ?? "";
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return {
    supabase,
    user,
    csrfToken,
  };
});

export const getDashboardBaseData = cache(async function getDashboardBaseData() {
  return measureDashboardTask("dashboard.baseData", {}, async () => {
    const { supabase, user, csrfToken } = await getDashboardRequestContext();

    const [profileQuery, teamContextQuery] = await Promise.allSettled([
      supabase
        .from("profiles")
        .select("id,full_name,avatar_url,created_at,onboarding_completed_at")
        .eq("id", user.id)
        .maybeSingle<ProfileRow>(),
      getCachedTeamContextForUser(supabase, user.id),
    ]);

    let profile: ProfileRow | null = null;
    if (profileQuery.status === "fulfilled") {
      if (profileQuery.value.error) {
        logger.warn("Failed to load dashboard profile; continuing with fallback profile data.", {
          error: profileQuery.value.error,
        });
      } else {
        profile = profileQuery.value.data;
      }
    } else {
      logger.warn("Failed to load dashboard profile; continuing with fallback profile data.", {
        error: profileQuery.reason,
      });
    }

    let teamContext: TeamContext | null = null;
    let teamContextLoadFailed = false;
    if (teamContextQuery.status === "fulfilled") {
      teamContext = teamContextQuery.value;
    } else {
      logger.warn("Failed to load team context; dashboard will render degraded state.", {
        error: teamContextQuery.reason,
      });
      teamContextLoadFailed = true;
    }

    const displayName = profile?.full_name?.trim() || user.email || "there";

    return {
      supabase,
      user,
      profile,
      teamContext,
      teamContextLoadFailed,
      displayName,
      csrfToken,
    };
  });
});

export async function getDashboardTeamOptions(
  supabase: SupabaseClient,
  userId: string,
): Promise<DashboardTeamOption[]> {
  try {
    const teamMembershipsResult = await supabase
      .from("team_memberships")
      .select("team_id,role,teams(name)")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .returns<DashboardTeamMembershipRow[]>();

    if (teamMembershipsResult.error) {
      logger.warn("Failed to load dashboard team memberships; using empty list.", {
        userId,
        error: teamMembershipsResult.error,
      });
      return [];
    }

    return (teamMembershipsResult.data ?? []).map((row) => ({
      teamId: row.team_id,
      teamName: row.teams?.name ?? null,
      role: row.role,
    }));
  } catch (error) {
    logger.warn("Failed to load dashboard team memberships; using empty list.", {
      userId,
      error,
    });
    return [];
  }
}

export async function getDashboardCanSwitchTeams(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean | null> {
  try {
    const teamMembershipsResult = await supabase
      .from("team_memberships")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    if (teamMembershipsResult.error) {
      logger.warn("Failed to count dashboard team memberships; leaving switchability unknown.", {
        userId,
        error: teamMembershipsResult.error,
      });
      return null;
    }

    return (teamMembershipsResult.count ?? 0) > 1;
  } catch (error) {
    logger.warn("Failed to count dashboard team memberships; leaving switchability unknown.", {
      userId,
      error,
    });
    return null;
  }
}

export const getDashboardShellData = cache(async function getDashboardShellData() {
  return measureDashboardTask("dashboard.shellData", {}, async () => {
    const baseData = await getDashboardBaseData();

    if (baseData.teamContextLoadFailed) {
      return {
        ...baseData,
        billingContext: null,
        aiUiGate: await getDashboardAiUiGate(baseData.supabase, null),
        teamUiMode: null,
        canSwitchTeams: false,
      } satisfies DashboardShellData;
    }

    if (!baseData.teamContext) {
      return {
        ...baseData,
        billingContext: null,
        aiUiGate: await getDashboardAiUiGate(baseData.supabase, null),
        teamUiMode: null,
        canSwitchTeams: false,
      } satisfies DashboardShellData;
    }

    const [snapshot, canSwitchTeams] = await Promise.all([
      getCachedDashboardTeamSnapshot(baseData.supabase, baseData.teamContext.teamId),
      getDashboardCanSwitchTeams(baseData.supabase, baseData.user.id),
    ]);

    return {
      ...baseData,
      billingContext: snapshot.billingContext,
      aiUiGate: snapshot.aiUiGate,
      teamUiMode: snapshot.teamUiMode,
      canSwitchTeams,
    } satisfies DashboardShellData;
  });
});

export async function getTeamMembersAndPendingInvites(supabase: SupabaseClient, teamId: string) {
  return measureDashboardTask("dashboard.teamMembersAndPendingInvites", { teamId }, async () => {
    const queryLimit = getTeamMaxMembers();
    const [membershipResult, pendingInvitesResult] = await Promise.allSettled([
      supabase
        .from("team_memberships")
        .select(
          "user_id,role,created_at,profiles!team_memberships_user_id_profiles_fkey(id,full_name,avatar_url)",
        )
        .eq("team_id", teamId)
        .order("created_at", { ascending: true })
        .limit(queryLimit)
        .returns<TeamMembershipRow[]>(),
      supabase
        .from("team_invites")
        .select("id,email,role,expires_at")
        .eq("team_id", teamId)
        .is("accepted_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(queryLimit)
        .returns<PendingInviteRow[]>(),
    ]);

    const memberships =
      membershipResult.status === "fulfilled" && !membershipResult.value.error
        ? (membershipResult.value.data ?? [])
        : [];
    if (membershipResult.status === "fulfilled" && membershipResult.value.error) {
      logger.warn("Failed to load team members; using empty member list.", {
        error: membershipResult.value.error,
      });
    }
    if (membershipResult.status === "rejected") {
      logger.warn("Failed to load team members; using empty member list.", {
        error: membershipResult.reason,
      });
    }

    const pendingInvitesData =
      pendingInvitesResult.status === "fulfilled" && !pendingInvitesResult.value.error
        ? (pendingInvitesResult.value.data ?? [])
        : [];
    if (pendingInvitesResult.status === "fulfilled" && pendingInvitesResult.value.error) {
      logger.warn("Failed to load pending team invites; using empty invite list.", {
        error: pendingInvitesResult.value.error,
      });
    }
    if (pendingInvitesResult.status === "rejected") {
      logger.warn("Failed to load pending team invites; using empty invite list.", {
        error: pendingInvitesResult.reason,
      });
    }

    const teamMembers = await enrichTeamMembersWithEmails(mapMembershipsToTeamMembers(memberships));
    const pendingInvites = pendingInvitesData.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      expiresAt: row.expires_at,
    }));

    return { teamMembers, pendingInvites };
  });
}

export async function getTeamMembers(
  supabase: SupabaseClient,
  teamId: string,
): Promise<TeamMember[]> {
  const queryLimit = getTeamMaxMembers();
  const membershipResult = await supabase
    .from("team_memberships")
    .select(
      "user_id,role,created_at,profiles!team_memberships_user_id_profiles_fkey(id,full_name,avatar_url)",
    )
    .eq("team_id", teamId)
    .order("created_at", { ascending: true })
    .limit(queryLimit)
    .returns<TeamMembershipRow[]>();

  if (membershipResult.error) {
    logger.warn("Failed to load team members; using empty member list.", {
      error: membershipResult.error,
    });
    return [];
  }

  return enrichTeamMembersWithEmails(mapMembershipsToTeamMembers(membershipResult.data ?? []));
}

async function fetchAuthEmailsByUserIds(userIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) {
    return new Map();
  }

  const admin = createAdminClient();
  const map = new Map<string, string>();

  const AUTH_EMAIL_LOOKUP_CONCURRENCY = 10;
  for (let i = 0; i < unique.length; i += AUTH_EMAIL_LOOKUP_CONCURRENCY) {
    const batch = unique.slice(i, i + AUTH_EMAIL_LOOKUP_CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(async (userId) => {
        const { data, error } = await admin.auth.admin.getUserById(userId);
        if (error) {
          logger.warn("Failed to load auth user email for team member list.", { userId, error });
          return [userId, null] as const;
        }
        const email = data.user?.email?.trim() || null;
        return [userId, email] as const;
      }),
    );

    for (const entry of settled) {
      if (entry.status !== "fulfilled") {
        logger.warn("Failed to load auth user email for team member list.", {
          error: entry.reason,
        });
        continue;
      }
      const [userId, email] = entry.value;
      if (email) {
        map.set(userId, email);
      }
    }
  }

  return map;
}

async function enrichTeamMembersWithEmails(members: TeamMember[]): Promise<TeamMember[]> {
  const emailMap = await fetchAuthEmailsByUserIds(members.map((m) => m.userId));
  return members.map((m) => ({
    ...m,
    email: emailMap.get(m.userId) ?? null,
  }));
}

function mapMembershipsToTeamMembers(memberships: TeamMembershipRow[]): TeamMember[] {
  return memberships.map((row) => {
    const joinedProfile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      userId: row.user_id,
      fullName: joinedProfile?.full_name ?? null,
      role: row.role,
      email: null,
      avatarUrl: joinedProfile?.avatar_url ?? null,
    };
  });
}

function getUsageMonthStart(value: string) {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

function getUsageHistoryStartIso(now = new Date(), monthLimit = USAGE_MONTH_LIMIT) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (monthLimit - 1), 1),
  ).toISOString();
}

function summarizeUsageRows(usageRows: AiUsageRow[]): UsageMonthlyTotalsRow[] {
  const merged = new Map<string, UsageMonthlyTotalsRow>();
  for (const row of usageRows) {
    const monthStart = getUsageMonthStart(row.created_at);
    const tokens = row.prompt_tokens + row.completion_tokens;
    const existing = merged.get(monthStart);
    if (existing) {
      existing.used_tokens += tokens;
      continue;
    }
    merged.set(monthStart, {
      month_start: monthStart,
      used_tokens: tokens,
      reserved_tokens: 0,
    });
  }
  return Array.from(merged.values())
    .sort((a, b) => b.month_start.localeCompare(a.month_start))
    .slice(0, USAGE_MONTH_LIMIT);
}

export async function getUsageMonthlyTotals(
  supabase: SupabaseClient,
  teamId: string,
): Promise<UsageMonthlyTotalsRow[]> {
  return measureDashboardTask("dashboard.usageMonthlyTotals", { teamId }, async () => {
    try {
      const monthlyTotalsResult = await supabase
        .from("ai_usage_monthly_totals")
        .select("month_start,used_tokens,reserved_tokens")
        .eq("team_id", teamId)
        .order("month_start", { ascending: false })
        .limit(USAGE_MONTH_LIMIT)
        .returns<UsageMonthlyTotalsRow[]>();

      if (monthlyTotalsResult.error) {
        logger.warn("Failed to load usage totals; falling back to raw AI usage rows.", {
          error: monthlyTotalsResult.error,
          teamId,
        });
      }
      const monthlyTotals = monthlyTotalsResult.error ? [] : (monthlyTotalsResult.data ?? []);
      if (monthlyTotals.length > 0) {
        return monthlyTotals;
      }

      const usageHistoryStart = getUsageHistoryStartIso();
      const usageRowsResult = await supabase
        .from("ai_usage")
        .select("created_at,prompt_tokens,completion_tokens")
        .eq("team_id", teamId)
        .gte("created_at", usageHistoryStart)
        .order("created_at", { ascending: false })
        .returns<AiUsageRow[]>();

      if (usageRowsResult.error) {
        logger.warn("Failed to load raw AI usage rows for dashboard usage fallback.", {
          error: usageRowsResult.error,
          teamId,
        });
        return [];
      }

      return summarizeUsageRows(usageRowsResult.data ?? []);
    } catch (error) {
      logger.warn("Failed to load usage totals; using empty usage data.", { error });
      return [];
    }
  });
}
