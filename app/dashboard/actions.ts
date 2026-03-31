"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAppUrl } from "@/lib/env";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidateCachedDashboardTeamSnapshots } from "@/lib/dashboard/team-snapshot-cache";
import { syncTeamSeatQuantity } from "@/lib/stripe/seats";
import { enqueueSeatSyncRetry } from "@/lib/stripe/seat-sync-retries";
import { logger } from "@/lib/logger";
import { invalidateCachedTeamContextForUser } from "@/lib/team-context-cache";
import { ONBOARDING_COMPLETE_COOKIE } from "@/lib/constants/onboarding";
import {
  CSRF_CLIENT_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  createCsrfToken,
  getClientReadableCsrfCookieOptions,
  getServerActionCsrfCookieOptions,
  verifyCsrfProtectionForServerAction,
} from "@/lib/security/csrf";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { isValidEmail } from "@/lib/validation";

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

type TeamMembershipRow = {
  team_id: string;
};

async function isLastOwnerOfAnyTeam(userId: string): Promise<boolean> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.rpc("is_last_owner_of_any_team", {
    p_user_id: userId,
  });

  if (error) {
    throw new Error(`Failed to check last-owner status before account deletion: ${error.message}`);
  }

  return data === true;
}

async function getTeamIdsForUserMemberships(userId: string): Promise<string[]> {
  const adminClient = createAdminClient();
  const { data: memberships, error } = await adminClient
    .from("team_memberships")
    .select("team_id")
    .eq("user_id", userId)
    .returns<TeamMembershipRow[]>();

  if (error) {
    throw new Error(`Failed to load team memberships before account deletion: ${error.message}`);
  }

  return Array.from(
    new Set(
      (memberships ?? [])
        .map((membership) => membership.team_id)
        .filter((teamId): teamId is string => typeof teamId === "string" && teamId.length > 0),
    ),
  );
}

async function syncTeamSeatsAfterAccountDeletion(teamIds: string[], deletedUserId: string) {
  await invalidateCachedDashboardTeamSnapshots(teamIds);

  await Promise.all(
    teamIds.map(async (teamId) => {
      try {
        await syncTeamSeatQuantity(teamId, {
          idempotencyKey: `seat-sync:account-delete:${teamId}:${deletedUserId}`,
        });
      } catch (error) {
        logger.error("Deleted account but failed to sync Stripe seats", error, {
          teamId,
          deletedUserId,
        });
        try {
          await enqueueSeatSyncRetry({
            teamId,
            source: "account.delete",
            error,
          });
        } catch (retryError) {
          logger.error("Failed to enqueue seat sync retry after account deletion", retryError, {
            teamId,
            deletedUserId,
          });
        }
      }
    }),
  );
}

async function rotateCsrfTokenForServerAction() {
  const cookieStore = await cookies();
  const token = createCsrfToken();
  cookieStore.set({
    name: CSRF_COOKIE_NAME,
    value: token,
    ...getServerActionCsrfCookieOptions(),
  });
  cookieStore.set({
    name: CSRF_CLIENT_COOKIE_NAME,
    value: token,
    ...getClientReadableCsrfCookieOptions(process.env.NODE_ENV === "production"),
  });
}

async function verifyDashboardActionCsrf(formData?: FormData) {
  const requestHeaders = await headers();
  return verifyCsrfProtectionForServerAction(requestHeaders, formData, {
    invalidOrigin: "Invalid request origin.",
    missingToken: "Missing CSRF token.",
    invalidToken: "Invalid CSRF token.",
  });
}

async function clearOnboardingCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(ONBOARDING_COMPLETE_COOKIE);
}

export async function logout(formData: FormData) {
  const csrfError = await verifyDashboardActionCsrf(formData);
  if (csrfError) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  await rotateCsrfTokenForServerAction();
  await clearOnboardingCookie();
  redirect("/login");
}

export async function logoutAllSessions(formData: FormData) {
  const csrfError = await verifyDashboardActionCsrf(formData);
  if (csrfError) {
    redirect("/dashboard/settings");
  }

  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  await rotateCsrfTokenForServerAction();
  await clearOnboardingCookie();
  redirect("/login");
}

export async function requestEmailChange(
  _previousState: RequestEmailChangeState,
  formData: FormData,
): Promise<RequestEmailChangeState> {
  const csrfError = await verifyDashboardActionCsrf(formData);
  if (csrfError) {
    return csrfError;
  }

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

  const rateLimit = await checkRateLimit({
    key: `email-change:user:${user.id}`,
    ...RATE_LIMITS.emailChangeRequestByUser,
  });
  if (!rateLimit.allowed) {
    const waitSeconds = Math.max(1, rateLimit.retryAfterSeconds);
    return {
      status: "error",
      message: `Too many email change requests. Please wait ${waitSeconds} seconds and try again.`,
    };
  }

  const emailInput = formData.get("newEmail");
  const newEmail =
    typeof emailInput === "string" && emailInput.trim().length > 0
      ? emailInput.trim().toLowerCase()
      : "";

  if (!newEmail || !isValidEmail(newEmail)) {
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
  const { error } = await supabase.auth.updateUser({ email: newEmail }, { emailRedirectTo });

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
  const csrfError = await verifyDashboardActionCsrf(formData);
  if (csrfError) {
    return csrfError;
  }

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
  const csrfError = await verifyDashboardActionCsrf(formData);
  if (csrfError) {
    return csrfError;
  }

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

  let deletingLastTeamOwner = false;
  try {
    deletingLastTeamOwner = await isLastOwnerOfAnyTeam(user.id);
  } catch (error) {
    logger.error("Failed to validate team ownership before account deletion", error, {
      userId: user.id,
    });
    return {
      status: "error",
      message: "Could not validate team ownership. Please try again.",
    };
  }

  if (deletingLastTeamOwner) {
    return {
      status: "error",
      message:
        "You are the last owner of at least one team. Transfer ownership before deleting your account.",
    };
  }

  let affectedTeamIds: string[] = [];
  try {
    affectedTeamIds = await getTeamIdsForUserMemberships(user.id);
  } catch (error) {
    logger.error("Failed to load team memberships before account deletion", error, {
      userId: user.id,
    });
    return {
      status: "error",
      message: "Could not prepare billing updates. Please try again.",
    };
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.deleteUser(user.id);

  if (error) {
    logger.error("Failed to delete account", error, { userId: user.id });
    if (error.code === "P0010") {
      return {
        status: "error",
        message:
          "You are the last owner of at least one team. Transfer ownership before deleting your account.",
      };
    }
    return {
      status: "error",
      message: "Could not delete account. Please try again.",
    };
  }

  if (affectedTeamIds.length > 0) {
    await syncTeamSeatsAfterAccountDeletion(affectedTeamIds, user.id);
  }

  await supabase.auth.signOut({ scope: "global" });
  await rotateCsrfTokenForServerAction();
  await clearOnboardingCookie();
  revalidatePath("/");
  redirect("/?account=deleted");
}

export async function switchActiveTeam(formData: FormData) {
  const requestedTeamId = formData.get("teamId");
  const redirectToInput = formData.get("redirectTo");
  const DASHBOARD_REDIRECT_RE = /^\/dashboard(?:\/|$|\?)/;
  const redirectTo =
    typeof redirectToInput === "string" && DASHBOARD_REDIRECT_RE.test(redirectToInput)
      ? redirectToInput
      : "/dashboard";

  const csrfError = await verifyDashboardActionCsrf(formData);
  if (csrfError) {
    redirect(redirectTo);
  }

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

  await invalidateCachedTeamContextForUser(user.id);

  revalidatePath("/dashboard");
  redirect(redirectTo);
}
