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
