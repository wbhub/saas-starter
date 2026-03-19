import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { jsonError, jsonSuccess } from "@/lib/http/api-json";
import { reconcileTeamSeatQuantities } from "@/lib/stripe/seat-reconcile";

function bearerToken(request: Request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return null;
  }
  return auth.slice("Bearer ".length).trim();
}

function safeCompare(a: string, b: string) {
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function GET(request: Request) {
  const secret = env.CRON_SECRET?.trim();
  if (!secret) {
    return jsonError("Cron is not configured.", 503);
  }

  const token = bearerToken(request);
  if (!token || !safeCompare(token, secret)) {
    return jsonError("Unauthorized.", 401);
  }

  const summary = await reconcileTeamSeatQuantities();
  return jsonSuccess(summary);
}
