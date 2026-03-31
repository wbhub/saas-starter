import { redirect } from "next/navigation";
import { InviteErrorCard } from "@/components/invite-error-card";
import { createClient } from "@/lib/supabase/server";
import { acceptTeamInvite } from "@/lib/team-invites/accept-invite";

type InvitePageProps = {
  params: Promise<{ token: string }>;
};

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const safeToken = token.trim();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/invite/${safeToken}`)}`);
  }

  const result = await acceptTeamInvite({
    token: safeToken,
    userId: user.id,
    userEmail: user.email,
  });

  if (result.ok || result.errorCode === "already_accepted") {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-[color:var(--background)] px-6 py-12 text-[color:var(--foreground)]">
      <InviteErrorCard errorCode={result.errorCode} />
    </main>
  );
}
