import { cookies } from "next/headers";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

const PASSWORD_RECOVERY_COOKIE = "auth_password_recovery";
const PASSWORD_RECOVERY_USER_COOKIE = "auth_password_recovery_user";

export default async function ResetPasswordPage() {
  const cookieStore = await cookies();
  const hasRecoveryProof = cookieStore.get(PASSWORD_RECOVERY_COOKIE)?.value === "1";
  const recoveryUserId = cookieStore.get(PASSWORD_RECOVERY_USER_COOKIE)?.value ?? "";

  return (
    <div className="flex min-h-screen flex-col bg-[color:var(--background)] text-[color:var(--foreground)]">
      <SiteHeader isLoggedIn={false} />

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <ResetPasswordForm
          hasRecoveryProof={hasRecoveryProof}
          recoveryUserId={recoveryUserId}
        />
      </main>

      <SiteFooter />
    </div>
  );
}
