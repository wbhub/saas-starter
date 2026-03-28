import { createClient } from "@/lib/supabase/server";
import { getDashboardTeamOptions } from "@/lib/dashboard/server";
import { jsonError, jsonSuccess } from "@/lib/http/api-json";
import { getOrCreateRequestId, withRequestId } from "@/lib/http/request-id";

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return withRequestId(jsonError("Unauthorized", 401), requestId);
  }

  const teams = await getDashboardTeamOptions(supabase, user.id);
  return withRequestId(jsonSuccess({ teams }), requestId);
}
