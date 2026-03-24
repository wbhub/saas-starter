import { createClient } from "@/lib/supabase/server";
import { signIntercomUserId } from "@/lib/intercom/signature";
import { env } from "@/lib/env";
import { jsonSuccess } from "@/lib/http/api-json";
import { getOrCreateRequestId, withRequestId } from "@/lib/http/request-id";

type IntercomBootUser = {
  id: string;
  email: string | null;
  name: string | null;
  createdAt: string;
  userHash: string;
};

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return withRequestId(jsonSuccess({ user: null as IntercomBootUser | null }), requestId);
  }

  const identitySecret = env.INTERCOM_IDENTITY_SECRET;
  if (!identitySecret) {
    return withRequestId(jsonSuccess({ user: null as IntercomBootUser | null }), requestId);
  }

  const profileNameResult = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle<{ full_name: string | null }>();

  const name =
    profileNameResult.data?.full_name ??
    (typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null);

  return withRequestId(
    jsonSuccess({
      user: {
        id: user.id,
        email: user.email ?? null,
        name,
        createdAt: user.created_at,
        userHash: signIntercomUserId(user.id, identitySecret),
      } as IntercomBootUser,
    }),
    requestId,
  );
}
