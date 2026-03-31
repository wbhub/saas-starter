import { redirect } from "next/navigation";
import { InviteAcceptCard } from "@/components/invite-accept-card";
import { createClient } from "@/lib/supabase/server";

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

  return (
    <main className="min-h-screen bg-[color:var(--background)] px-6 py-12 text-[color:var(--foreground)]">
      <InviteAcceptCard token={safeToken} />
    </main>
  );
}
