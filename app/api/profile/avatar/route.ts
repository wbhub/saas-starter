import { revalidatePath } from "next/cache";
import { jsonError, jsonSuccess } from "@/lib/http/api-json";
import { requireJsonContentType } from "@/lib/http/content-type";
import { getOrCreateRequestId, withRequestId } from "@/lib/http/request-id";
import { parseJsonWithSchema, z } from "@/lib/http/request-validation";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { getRouteTranslator } from "@/lib/i18n/locale";
import { logger } from "@/lib/logger";
import {
  extractProfilePhotoPath,
  getSupabaseStorageOrigin,
  isAllowedAvatarUrl,
  isOwnedProfilePhotoPath,
} from "@/lib/profile/avatar-url";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyCsrfProtection } from "@/lib/security/csrf";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const avatarPayloadSchema = z.object({
  avatarUrl: z.string().max(2048).nullable(),
});

export async function PATCH(req: Request) {
  const t = await getRouteTranslator("ApiProfileAvatar", req);
  const requestId = getOrCreateRequestId(req);
  const err = (error: string, status: number, init?: ResponseInit) =>
    withRequestId(jsonError(error, status, init), requestId);

  const csrfError = verifyCsrfProtection(req, {
    invalidOrigin: t("errors.invalidOrigin"),
    missingToken: t("errors.missingCsrfToken"),
    invalidToken: t("errors.invalidCsrfToken"),
  });
  if (csrfError) {
    return withRequestId(csrfError, requestId);
  }

  const contentTypeError = requireJsonContentType(req, {
    errorMessage: t("errors.invalidContentType"),
  });
  if (contentTypeError) {
    return withRequestId(contentTypeError, requestId);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return err(t("errors.unauthorized"), 401);
  }

  const rateLimit = await checkRateLimit({
    key: `dashboard-settings:update:${user.id}`,
    ...RATE_LIMITS.dashboardSettingsUpdateByUser,
  });
  if (!rateLimit.allowed) {
    return err(t("errors.rateLimited"), 429, {
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }

  const bodyParse = await parseJsonWithSchema(req, avatarPayloadSchema);
  if (!bodyParse.success && bodyParse.tooLarge) {
    return err(t("errors.payloadTooLarge"), 413);
  }
  if (!bodyParse.success) {
    return err(t("errors.invalidPayload"), 400);
  }

  const raw = bodyParse.data.avatarUrl;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  const avatarUrl = trimmed.length > 0 ? trimmed : null;

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

  const storageOrigin = getSupabaseStorageOrigin();
  if (!storageOrigin) {
    logger.error("Supabase URL is invalid; cannot validate avatar URL", undefined, {
      userId: user.id,
    });
    return err(t("errors.unableToValidate"), 500);
  }

  let sanitizedAvatarUrl = avatarUrl;
  if (sanitizedAvatarUrl && !isAllowedAvatarUrl(sanitizedAvatarUrl, storageOrigin, user.id)) {
    if (sanitizedAvatarUrl === previousAvatarUrl) {
      sanitizedAvatarUrl = null;
    } else {
      return err(t("errors.invalidAvatarUrl"), 400);
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: sanitizedAvatarUrl })
    .eq("id", user.id);

  if (error) {
    logger.error("Failed to update profile avatar", error, { userId: user.id });
    return err(t("errors.unableToUpdate"), 500);
  }

  if (previousAvatarUrl && previousAvatarUrl !== sanitizedAvatarUrl) {
    const previousPhotoPath = extractProfilePhotoPath(previousAvatarUrl, storageOrigin);
    if (previousPhotoPath && isOwnedProfilePhotoPath(previousPhotoPath, user.id)) {
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
    } else if (previousPhotoPath) {
      logger.warn("Skipping cleanup for non-owned profile photo path", {
        userId: user.id,
        path: previousPhotoPath,
      });
    }
  }

  revalidatePath("/dashboard");
  return withRequestId(jsonSuccess(), requestId);
}
