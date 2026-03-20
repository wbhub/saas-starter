"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAppUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export type UpdateDashboardSettingsState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export type RequestEmailChangeState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export type UpdateNotificationPreferencesState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export type DeleteAccountState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

function extractProfilePhotoPath(url: string): string | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(
      /\/storage\/v1\/object\/(?:public|sign)\/profile-photos\/(.+)$/,
    );
    if (!match?.[1]) {
      return null;
    }

    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

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

  const existingProfileResult = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", user.id)
    .maybeSingle<{ avatar_url: string | null }>();
  const previousAvatarUrl = existingProfileResult.data?.avatar_url ?? null;
  if (existingProfileResult.error) {
    logger.error("Could not fetch existing profile avatar", existingProfileResult.error, {
      userId: user.id,
    });
  }

  const fullNameInput = formData.get("fullName");
  const avatarUrlInput = formData.get("avatarUrl");
  const fullName =
    typeof fullNameInput === "string" && fullNameInput.trim().length > 0
      ? fullNameInput.trim()
      : null;
  const avatarUrl =
    typeof avatarUrlInput === "string" && avatarUrlInput.trim().length > 0
      ? avatarUrlInput.trim()
      : null;

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, avatar_url: avatarUrl })
    .eq("id", user.id);

  if (error) {
    logger.error("Failed to update dashboard settings", error);
    return {
      status: "error",
      message: "Could not save settings. Please try again.",
    };
  }

  if (previousAvatarUrl && previousAvatarUrl !== avatarUrl) {
    const previousPhotoPath = extractProfilePhotoPath(previousAvatarUrl);
    if (previousPhotoPath) {
      const adminClient = createAdminClient();
      const { error: removeError } = await adminClient.storage
        .from("profile-photos")
        .remove([previousPhotoPath]);
      if (removeError) {
        logger.error("Failed to remove replaced profile photo", removeError, {
          userId: user.id,
          path: previousPhotoPath,
        });
      }
    }
  }

  revalidatePath("/dashboard");
  return {
    status: "success",
    message: "Settings saved.",
  };
}

export async function requestEmailChange(
  _previousState: RequestEmailChangeState,
  formData: FormData,
): Promise<RequestEmailChangeState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      status: "error",
      message: "You must be logged in to request an email change.",
    };
  }

  const emailInput = formData.get("newEmail");
  const newEmail =
    typeof emailInput === "string" && emailInput.trim().length > 0
      ? emailInput.trim().toLowerCase()
      : "";

  if (!newEmail || !newEmail.includes("@")) {
    return {
      status: "error",
      message: "Enter a valid email address.",
    };
  }

  if ((user.email ?? "").toLowerCase() === newEmail) {
    return {
      status: "error",
      message: "That email is already your current account email.",
    };
  }

  const emailRedirectTo = `${getAppUrl()}/dashboard/settings?emailChange=confirmed`;
  const { error } = await supabase.auth.updateUser(
    { email: newEmail },
    { emailRedirectTo },
  );

  if (error) {
    logger.error("Failed to request email change", error, { userId: user.id });
    return {
      status: "error",
      message: "Could not start email change. Please try again.",
    };
  }

  return {
    status: "success",
    message: "Email change requested. Check your inbox for confirmation instructions.",
  };
}

export async function updateNotificationPreferences(
  _previousState: UpdateNotificationPreferencesState,
  formData: FormData,
): Promise<UpdateNotificationPreferencesState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      status: "error",
      message: "You must be logged in to update notification preferences.",
    };
  }

  const marketingEmails = formData.get("marketingEmails") === "on";
  const productUpdates = formData.get("productUpdates") === "on";
  const securityAlerts = formData.get("securityAlerts") === "on";

  const { error } = await supabase.from("notification_preferences").upsert(
    {
      user_id: user.id,
      marketing_emails: marketingEmails,
      product_updates: productUpdates,
      security_alerts: securityAlerts,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    logger.error("Failed to update notification preferences", error, { userId: user.id });
    return {
      status: "error",
      message: "Could not save notification preferences.",
    };
  }

  revalidatePath("/dashboard/settings");
  return {
    status: "success",
    message: "Notification preferences saved.",
  };
}

export async function deleteAccount(
  _previousState: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      status: "error",
      message: "You must be logged in to delete your account.",
    };
  }

  const confirmation = formData.get("confirmDelete");
  const confirmEmailInput = formData.get("confirmEmail");
  const acknowledgeDestructive = formData.get("confirmUnderstood");
  if (typeof confirmation !== "string" || confirmation.trim() !== "DELETE") {
    return {
      status: "error",
      message: 'Type "DELETE" to confirm account deletion.',
    };
  }
  if (
    typeof confirmEmailInput !== "string" ||
    typeof user.email !== "string" ||
    confirmEmailInput.trim().toLowerCase() !== user.email.toLowerCase()
  ) {
    return {
      status: "error",
      message: "Enter your current account email exactly to confirm deletion.",
    };
  }
  if (acknowledgeDestructive !== "on") {
    return {
      status: "error",
      message: "Confirm that you understand this action is permanent.",
    };
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.deleteUser(user.id);

  if (error) {
    logger.error("Failed to delete account", error, { userId: user.id });
    return {
      status: "error",
      message: "Could not delete account. Please try again.",
    };
  }

  await supabase.auth.signOut({ scope: "global" });
  revalidatePath("/");
  redirect("/?account=deleted");
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
