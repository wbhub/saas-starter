import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { jsonError, jsonSuccess } from "@/lib/http/api-json";
import { getClientRateLimitIdentifier } from "@/lib/http/client-ip";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { processDueAiBudgetFinalizeRetries } from "@/lib/ai/budget-finalize-retries";
import { reconcileTeamSeatQuantities } from "@/lib/stripe/seat-reconcile";
import { logger } from "@/lib/logger";
import { getRouteTranslator } from "@/lib/i18n/locale";

function bearerToken(request: Request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return null;
  }
  return auth.slice("Bearer ".length).trim();
}

function safeCompare(a: string, b: string) {
  if (Buffer.byteLength(a, "utf8") !== Buffer.byteLength(b, "utf8")) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

export async function GET(request: Request) {
  const t = await getRouteTranslator("ApiCronReconcileSeatQuantities", request);

  const secret = env.CRON_SECRET?.trim();
  if (!secret) {
    return jsonError(t("errors.cronNotConfigured"), 503);
  }

  const token = bearerToken(request);
  if (!token || !safeCompare(token, secret)) {
    return jsonError(t("errors.unauthorized"), 401);
  }

  const clientId = getClientRateLimitIdentifier(request);
  const rateLimit = await checkRateLimit({
    key: `cron:reconcile-seat-quantities:${clientId.keyType}:${clientId.value}`,
    ...RATE_LIMITS.cronByClientIp,
  });
  if (!rateLimit.allowed) {
    return jsonError(t("errors.rateLimited"), 429, {
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }

  let summary = {
    scannedTeams: 0,
    synced: 0,
    failed: 0,
    queuedRetries: 0,
    discoveredFromStripe: 0,
    stripePagesScanned: 0,
  };
  let seatReconcileFailed = false;
  try {
    summary = await reconcileTeamSeatQuantities();
  } catch (error) {
    seatReconcileFailed = true;
    logger.error("Failed to reconcile team seat quantities during cron run", error);
  }

  let aiBudgetFinalizeRetries = {
    processed: 0,
    finalized: 0,
    skipped: 0,
    failed: 0,
  };
  let aiBudgetFinalizeRetriesFailed = false;

  try {
    aiBudgetFinalizeRetries = await processDueAiBudgetFinalizeRetries();
  } catch (error) {
    aiBudgetFinalizeRetriesFailed = true;
    logger.error("Failed to process AI budget finalize retry queue during cron run", error);
  }

  const responsePayload = {
    ...summary,
    seatReconcileFailed,
    aiBudgetFinalizeRetries,
    aiBudgetFinalizeRetriesFailed,
  };

  if (seatReconcileFailed || aiBudgetFinalizeRetriesFailed) {
    return NextResponse.json(
      {
        ok: false,
        error: t("errors.partialFailure"),
        ...responsePayload,
      },
      { status: 500 },
    );
  }

  return jsonSuccess(responsePayload);
}
