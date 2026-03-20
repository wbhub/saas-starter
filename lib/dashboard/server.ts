import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LIVE_SUBSCRIPTION_STATUSES, type SubscriptionStatus } from "@/lib/stripe/plans";
import type { TeamContext } from "@/lib/team-context";
import { getTeamContextForUser } from "@/lib/team-context";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

type ProfileRow = {
  id: string;
  full_name: string | null;
  created_at: string;
};

type TeamMembershipRow = {
  user_id: string;
  role: "owner" | "admin" | "member";
  created_at: string;
  profiles:
    | {
        id: string;
        full_name: string | null;
      }
    | {
        id: string;
        full_name: string | null;
      }[]
    | null;
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
};

export type SubscriptionRow = {
  status: SubscriptionStatus;
  stripe_price_id: string;
  seat_quantity: number;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export type UsageMonthlyTotalsRow = {
  month_start: string;
  used_tokens: number;
  reserved_tokens: number;
};

export async function getDashboardBaseData() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [profileQuery, teamContextQuery] = await Promise.allSettled([
    supabase
      .from("profiles")
      .select("id,full_name,created_at")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>(),
    getTeamContextForUser(supabase, user.id),
  ]);

  let profile: ProfileRow | null = null;
  if (profileQuery.status === "fulfilled") {
    if (profileQuery.value.error) {
      logger.error("Failed to load dashboard profile", profileQuery.value.error);
    } else {
      profile = profileQuery.value.data;
    }
  } else {
    logger.error("Failed to load dashboard profile", profileQuery.reason);
  }

  let teamContext: TeamContext | null = null;
  if (teamContextQuery.status === "fulfilled") {
    teamContext = teamContextQuery.value;
  } else {
    logger.error("Failed to load team context", teamContextQuery.reason);
  }

  const displayName = profile?.full_name?.trim() || user.email || "there";

  return { supabase, user, profile, teamContext, displayName };
}

export async function getLiveSubscription(
  supabase: SupabaseClient,
  teamId: string,
): Promise<SubscriptionRow | null> {
  try {
    const subscriptionFetchResult = await supabase
      .from("subscriptions")
      .select("status,stripe_price_id,seat_quantity,current_period_end,cancel_at_period_end")
      .eq("team_id", teamId)
      .in("status", LIVE_SUBSCRIPTION_STATUSES)
      .order("current_period_end", { ascending: false })
      .limit(1)
      .maybeSingle<SubscriptionRow>();
    if (subscriptionFetchResult.error) {
      logger.error("Failed to load dashboard subscription", subscriptionFetchResult.error);
      return null;
    }
    return subscriptionFetchResult.data;
  } catch (error) {
    logger.error("Failed to load dashboard subscription", error);
    return null;
  }
}

export async function getTeamMembersAndPendingInvites(
  supabase: SupabaseClient,
  teamId: string,
) {
  const [membershipResult, pendingInvitesResult] = await Promise.allSettled([
    supabase
      .from("team_memberships")
      .select("user_id,role,created_at,profiles(id,full_name)")
      .eq("team_id", teamId)
      .order("created_at", { ascending: true })
      .returns<TeamMembershipRow[]>(),
    supabase
      .from("team_invites")
      .select("id,email,role,expires_at")
      .eq("team_id", teamId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .returns<PendingInviteRow[]>(),
  ]);

  const memberships =
    membershipResult.status === "fulfilled" && !membershipResult.value.error
      ? membershipResult.value.data ?? []
      : [];
  if (membershipResult.status === "fulfilled" && membershipResult.value.error) {
    logger.error("Failed to load team members", membershipResult.value.error);
  }
  if (membershipResult.status === "rejected") {
    logger.error("Failed to load team members", membershipResult.reason);
  }

  const pendingInvitesData =
    pendingInvitesResult.status === "fulfilled" && !pendingInvitesResult.value.error
      ? pendingInvitesResult.value.data ?? []
      : [];
  if (pendingInvitesResult.status === "fulfilled" && pendingInvitesResult.value.error) {
    logger.error("Failed to load pending team invites", pendingInvitesResult.value.error);
  }
  if (pendingInvitesResult.status === "rejected") {
    logger.error("Failed to load pending team invites", pendingInvitesResult.reason);
  }

  const teamMembers = mapMembershipsToTeamMembers(memberships);
  const pendingInvites = pendingInvitesData.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    expiresAt: row.expires_at,
  }));

  return { teamMembers, pendingInvites };
}

export async function getTeamMembers(
  supabase: SupabaseClient,
  teamId: string,
): Promise<TeamMember[]> {
  const membershipResult = await supabase
    .from("team_memberships")
    .select("user_id,role,created_at,profiles(id,full_name)")
    .eq("team_id", teamId)
    .order("created_at", { ascending: true })
    .returns<TeamMembershipRow[]>();

  if (membershipResult.error) {
    logger.error("Failed to load team members", membershipResult.error);
    return [];
  }

  return mapMembershipsToTeamMembers(membershipResult.data ?? []);
}

function mapMembershipsToTeamMembers(memberships: TeamMembershipRow[]): TeamMember[] {
  const profileNameMap = new Map(
    memberships.map((row) => {
      const joinedProfile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return [row.user_id, joinedProfile?.full_name ?? null] as const;
    }),
  );

  return memberships.map((row) => ({
    userId: row.user_id,
    fullName: profileNameMap.get(row.user_id) ?? null,
    role: row.role,
  }));
}

export async function getUsageMonthlyTotals(
  supabase: SupabaseClient,
  teamId: string,
): Promise<UsageMonthlyTotalsRow[]> {
  try {
    const usageResult = await supabase
      .from("ai_usage_monthly_totals")
      .select("month_start,used_tokens,reserved_tokens")
      .eq("team_id", teamId)
      .order("month_start", { ascending: false })
      .limit(6)
      .returns<UsageMonthlyTotalsRow[]>();

    if (usageResult.error) {
      logger.error("Failed to load usage totals", usageResult.error);
      return [];
    }

    return usageResult.data ?? [];
  } catch (error) {
    logger.error("Failed to load usage totals", error);
    return [];
  }
}
