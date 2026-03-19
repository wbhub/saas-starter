import type { SupabaseClient } from "@supabase/supabase-js";

type TeamRole = "owner" | "admin" | "member";

export type TeamContext = {
  teamId: string;
  teamName: string | null;
  role: TeamRole;
};

type ProfileTeamRow = {
  active_team_id: string | null;
};

type TeamMembershipRow = {
  team_id: string;
  role: TeamRole;
  teams: { id: string; name: string | null } | null;
};

async function getMembershipForTeam(
  supabase: SupabaseClient,
  userId: string,
  teamId: string,
) {
  const result = await supabase
    .from("team_memberships")
    .select("team_id,role,teams(id,name)")
    .eq("user_id", userId)
    .eq("team_id", teamId)
    .limit(1)
    .maybeSingle<TeamMembershipRow>();

  return result;
}

async function getFirstMembership(
  supabase: SupabaseClient,
  userId: string,
) {
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
    throw new Error(`Failed to load profile active team: ${profileResult.error.message}`);
  }

  const activeTeamId = profileResult.data?.active_team_id;

  const membershipResult = activeTeamId
    ? await getMembershipForTeam(supabase, userId, activeTeamId)
    : await getFirstMembership(supabase, userId);

  if (membershipResult.error) {
    throw new Error(`Failed to load team membership: ${membershipResult.error.message}`);
  }

  const membership = membershipResult.data;
  if (!membership && activeTeamId) {
    const fallbackResult = await getFirstMembership(supabase, userId);
    if (fallbackResult.error) {
      throw new Error(`Failed to load fallback team membership: ${fallbackResult.error.message}`);
    }

    if (!fallbackResult.data) {
      return null;
    }

    return {
      teamId: fallbackResult.data.team_id,
      teamName: fallbackResult.data.teams?.name ?? null,
      role: fallbackResult.data.role,
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
