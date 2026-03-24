import Link from "next/link";
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

  return (
    <main className="min-h-screen bg-[color:var(--background)] px-6 py-12 text-[color:var(--foreground)]">
      {!user ? (
        <div className="mx-auto mb-4 w-full max-w-lg rounded-lg border app-border-subtle app-surface-subtle px-4 py-3 text-sm text-muted-foreground">
          <p>
            You need to log in before accepting this invite.{" "}
            <Link
              href={`/login?next=${encodeURIComponent(`/invite/${safeToken}`)}`}
              className="font-medium underline underline-offset-2"
            >
              Go to login
            </Link>
          </p>
        </div>
      ) : null}
      <InviteAcceptCard token={safeToken} isAuthenticated={Boolean(user)} />
    </main>
  );
}
