import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signIntercomUserId } from "@/lib/intercom/signature";
import { env } from "@/lib/env";

type IntercomBootResponse = {
  user: {
    id: string;
    email: string | null;
    name: string | null;
    createdAt: string;
    userHash: string;
  } | null;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json<IntercomBootResponse>({ user: null });
  }

  const identitySecret = env.INTERCOM_IDENTITY_SECRET;
  if (!identitySecret) {
    // Fail closed: do not expose spoofable identifiers without a signed hash.
    return NextResponse.json<IntercomBootResponse>({ user: null });
  }

  const name =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : null;

  return NextResponse.json<IntercomBootResponse>({
    user: {
      id: user.id,
      email: user.email ?? null,
      name,
      createdAt: user.created_at,
      userHash: signIntercomUserId(user.id, identitySecret),
    },
  });
}

