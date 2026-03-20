"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export type UpdateDashboardSettingsState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function logoutAllSessions() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login");
}

export async function updateDashboardSettings(
  _previousState: UpdateDashboardSettingsState,
  formData: FormData,
): Promise<UpdateDashboardSettingsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      status: "error",
      message: "You must be logged in to update settings.",
    };
  }

  const fullNameInput = formData.get("fullName");
  const fullName =
    typeof fullNameInput === "string" && fullNameInput.trim().length > 0
      ? fullNameInput.trim()
      : null;

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", user.id);

  if (error) {
    logger.error("Failed to update dashboard settings", error);
    return {
      status: "error",
      message: "Could not save settings. Please try again.",
    };
  }

  revalidatePath("/dashboard");
  return {
    status: "success",
    message: "Settings saved.",
  };
}

export async function switchActiveTeam(formData: FormData) {
  const requestedTeamId = formData.get("teamId");
  const redirectToInput = formData.get("redirectTo");
  const redirectTo =
    typeof redirectToInput === "string" && redirectToInput.startsWith("/dashboard")
      ? redirectToInput
      : "/dashboard";

  if (typeof requestedTeamId !== "string" || requestedTeamId.trim().length === 0) {
    redirect(redirectTo);
  }

  const teamId = requestedTeamId.trim();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const membershipResult = await supabase
    .from("team_memberships")
    .select("team_id")
    .eq("user_id", user.id)
    .eq("team_id", teamId)
    .limit(1)
    .maybeSingle<{ team_id: string }>();

  if (membershipResult.error || !membershipResult.data) {
    if (membershipResult.error) {
      logger.error("Failed to validate team switch membership", membershipResult.error, {
        userId: user.id,
        teamId,
      });
    }
    redirect(redirectTo);
  }

  const updateResult = await supabase
    .from("profiles")
    .update({ active_team_id: teamId })
    .eq("id", user.id);

  if (updateResult.error) {
    logger.error("Failed to switch active team", updateResult.error, {
      userId: user.id,
      teamId,
    });
    redirect(redirectTo);
  }

  revalidatePath("/dashboard");
  redirect(redirectTo);
}
