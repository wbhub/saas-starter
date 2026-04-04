import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PublicCenteredContent, PublicShell } from "@/components/layout-shells";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { isPasswordAuthEnabled } from "@/lib/auth/social-auth";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

const PASSWORD_RECOVERY_COOKIE = "auth_password_recovery";
const PASSWORD_RECOVERY_USER_COOKIE = "auth_password_recovery_user";

export default async function ResetPasswordPage() {
  if (!isPasswordAuthEnabled()) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const hasRecoveryProof = cookieStore.get(PASSWORD_RECOVERY_COOKIE)?.value === "1";
  const recoveryUserId = cookieStore.get(PASSWORD_RECOVERY_USER_COOKIE)?.value ?? "";

  return (
    <div className="app-content flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <PublicShell as="main" className="flex flex-1 flex-col py-12">
        <PublicCenteredContent>
          <ResetPasswordForm hasRecoveryProof={hasRecoveryProof} recoveryUserId={recoveryUserId} />
        </PublicCenteredContent>
      </PublicShell>

      <SiteFooter />
    </div>
  );
}
