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

  const intercomUser =
    user && env.INTERCOM_IDENTITY_SECRET
      ? {
          id: user.id,
          email: user.email ?? null,
          name:
            typeof user.user_metadata?.full_name === "string"
              ? user.user_metadata.full_name
              : null,
          createdAt: user.created_at,
          userHash: signIntercomUserId(user.id, env.INTERCOM_IDENTITY_SECRET),
        }
      : null;

  return (
    <>
      {env.NEXT_PUBLIC_INTERCOM_APP_ID && intercomUser ? (
        <Suspense fallback={null}>
          <IntercomProvider appId={env.NEXT_PUBLIC_INTERCOM_APP_ID} user={intercomUser} />
        </Suspense>
      ) : null}
      {children}
    </>
  );
}
