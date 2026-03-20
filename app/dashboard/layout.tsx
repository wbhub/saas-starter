import { Suspense } from "react";
import type { ReactNode } from "react";
import { IntercomProvider } from "@/components/intercom-provider";
import { signIntercomUserId } from "@/lib/intercom/signature";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const intercomConfig =
    user && env.INTERCOM_IDENTITY_SECRET && env.NEXT_PUBLIC_INTERCOM_APP_ID
      ? {
          appId: env.NEXT_PUBLIC_INTERCOM_APP_ID,
          identitySecret: env.INTERCOM_IDENTITY_SECRET,
        }
      : null;

  const profileName =
    intercomConfig && user
      ? (
          await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", user.id)
            .maybeSingle<{ full_name: string | null }>()
        ).data?.full_name ?? null
      : null;

  const intercomUser =
    intercomConfig && user
      ? {
          id: user.id,
          email: user.email ?? null,
          name:
            profileName ??
            (typeof user.user_metadata?.full_name === "string"
              ? user.user_metadata.full_name
              : null),
          createdAt: user.created_at,
          userHash: signIntercomUserId(user.id, intercomConfig.identitySecret),
        }
      : null;

  return (
    <>
      {intercomUser && intercomConfig ? (
        <Suspense fallback={null}>
          <IntercomProvider appId={intercomConfig.appId} user={intercomUser} />
        </Suspense>
      ) : null}
      {children}
    </>
  );
}
