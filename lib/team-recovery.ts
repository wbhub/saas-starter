import { createAdminClient } from "@/lib/supabase/admin";

type RecoverResult = {
  team_id: string;
};

export async function recoverPersonalTeamForUser(
  userId: string,
  userEmail: string,
  fullName: string | null,
) {
  const { data, error } = await createAdminClient().rpc("recover_personal_team_if_missing", {
    p_user_id: userId,
    p_email: userEmail,
    p_full_name: fullName,
  });

  if (error) {
    throw new Error(`Failed to recover personal team: ${error.message}`);
  }

  const teamId = Array.isArray(data) ? (data[0] as RecoverResult | undefined)?.team_id : data;
  if (!teamId || typeof teamId !== "string") {
    throw new Error("Unexpected response while recovering personal team.");
  }

  return teamId;
}
