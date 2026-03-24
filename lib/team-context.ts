import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

export type TeamRole = "owner" | "admin" | "member";

export type TeamContext = {
  teamId: string;
  teamName: string | null;
  role: TeamRole;
};

export function canManageTeamBilling(role: TeamRole): boolean {
  return role === "owner" || role === "admin";
}

type ProfileTeamRow = {
  active_team_id: string | null;
};

type TeamMembershipRow = {
  team_id: string;
  role: TeamRole;
  teams: { id: string; name: string | null } | null;
};

async function getMembershipForTeam(supabase: SupabaseClient, userId: string, teamId: string) {
  const result = await supabase
    .from("team_memberships")
    .select("team_id,role,teams(id,name)")
    .eq("user_id", userId)
    .eq("team_id", teamId)
    .limit(1)
    .maybeSingle<TeamMembershipRow>();

  return result;
}

async function getFirstMembership(supabase: SupabaseClient, userId: string) {
  const result = await supabase
    .from("team_memberships")
    .select("team_id,role,teams(id,name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<TeamMembershipRow>();

  return result;
}

export async function getTeamContextForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<TeamContext | null> {
  const profileResult = await supabase
    .from("profiles")
    .select("active_team_id")
    .eq("id", userId)
    .maybeSingle<ProfileTeamRow>();

  if (profileResult.error) {
    logger.warn("Failed to load profile active team; returning null team context.", {
      userId,
      error: profileResult.error,
    });
    return null;
  }

  const activeTeamId = profileResult.data?.active_team_id;

  const membershipResult = activeTeamId
    ? await getMembershipForTeam(supabase, userId, activeTeamId)
    : await getFirstMembership(supabase, userId);

  if (membershipResult.error) {
    logger.warn("Failed to load team membership; returning null team context.", {
      userId,
      activeTeamId,
      error: membershipResult.error,
    });
    return null;
  }

  const membership = membershipResult.data;
  if (!membership && activeTeamId) {
    const fallbackMembershipResult = await getFirstMembership(supabase, userId);
    if (fallbackMembershipResult.error) {
      logger.warn("Failed to load fallback team membership; returning null team context.", {
        userId,
        activeTeamId,
        error: fallbackMembershipResult.error,
      });
      return null;
    }

    const fallbackMembership = fallbackMembershipResult.data;
    if (!fallbackMembership) {
      await supabase
        .from("profiles")
        .update({ active_team_id: null })
        .eq("id", userId)
        .eq("active_team_id", activeTeamId);
      return null;
    }

    await supabase
      .from("profiles")
      .update({ active_team_id: fallbackMembership.team_id })
      .eq("id", userId)
      .eq("active_team_id", activeTeamId);

    return {
      teamId: fallbackMembership.team_id,
      teamName: fallbackMembership.teams?.name ?? null,
      role: fallbackMembership.role,
    };
  }

  if (!membership) {
    return null;
  }

  return {
    teamId: membership.team_id,
    teamName: membership.teams?.name ?? null,
    role: membership.role,
  };
}
