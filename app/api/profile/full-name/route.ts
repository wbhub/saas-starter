import { revalidatePath } from "next/cache";
import { jsonError, jsonSuccess } from "@/lib/http/api-json";
import { requireJsonContentType } from "@/lib/http/content-type";
import { getOrCreateRequestId, withRequestId } from "@/lib/http/request-id";
import { parseJsonWithSchema, z } from "@/lib/http/request-validation";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { getRouteTranslator } from "@/lib/i18n/locale";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyCsrfProtection } from "@/lib/security/csrf";
import { createClient } from "@/lib/supabase/server";

const fullNamePayloadSchema = z.object({
  fullName: z.string().max(80),
});

export async function PATCH(req: Request) {
  const t = await getRouteTranslator("ApiProfileFullName", req);
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

  const bodyParse = await parseJsonWithSchema(req, fullNamePayloadSchema);
  if (!bodyParse.success && bodyParse.tooLarge) {
    return err(t("errors.payloadTooLarge"), 413);
  }
  if (!bodyParse.success) {
    return err(t("errors.invalidPayload"), 400);
  }

  const trimmed = bodyParse.data.fullName.trim();
  const fullNameValue = trimmed.length > 0 ? trimmed : null;

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullNameValue })
    .eq("id", user.id);

  if (error) {
    logger.error("Failed to update profile display name", error, { userId: user.id });
    return err(t("errors.unableToUpdate"), 500);
  }

  revalidatePath("/dashboard");
  return withRequestId(jsonSuccess(), requestId);
}
