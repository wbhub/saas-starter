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

type ResolveTeamContextRow = {
  team_id: string;
  team_name: string | null;
  role: TeamRole;
  repaired: boolean;
};

export async function getTeamContextForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<TeamContext | null> {
  const { data, error } = await supabase.rpc("resolve_team_context", {
    p_user_id: userId,
  });

  if (error) {
    logger.warn("Failed to resolve team context via RPC; returning null.", {
      userId,
      error,
    });
    return null;
  }

  const rows = data as ResolveTeamContextRow[] | null;
  if (!rows || rows.length === 0) {
    return null;
  }

  const row = rows[0]!;
  return {
    teamId: row.team_id,
    teamName: row.team_name,
    role: row.role,
  };
}
