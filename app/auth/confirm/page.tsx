import { AuthConfirmClient } from "@/components/auth-confirm-client";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function AuthConfirmPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[color:var(--background)] text-[color:var(--foreground)]">
      <SiteHeader />

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <AuthConfirmClient />
      </main>

      <SiteFooter />
    </div>
  );
}
