import { Suspense } from "react";
import type { ReactNode } from "react";
import { IntercomProvider } from "@/components/intercom-provider";
import { env } from "@/lib/env";

export default function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  const intercomAppId = env.NEXT_PUBLIC_INTERCOM_APP_ID;
  const shouldRenderIntercom = Boolean(intercomAppId && env.INTERCOM_IDENTITY_SECRET);

  return (
    <>
      {shouldRenderIntercom && intercomAppId ? (
        <Suspense fallback={null}>
          <IntercomProvider appId={intercomAppId} />
        </Suspense>
      ) : null}
      {children}
    </>
  );
}
