import { redirect } from "next/navigation";
import { InviteErrorCard } from "@/components/invite-error-card";
import { createClient } from "@/lib/supabase/server";
import { hashInviteToken } from "@/lib/team-invites";
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

  // #region agent log
  fetch("http://127.0.0.1:7682/ingest/9890b261-4ef1-42f4-9a39-56fb9758768c", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "5d5cf2",
    },
    body: JSON.stringify({
      sessionId: "5d5cf2",
      runId: "pre-fix",
      hypothesisId: "H-PAGE",
      location: "app/invite/[token]/page.tsx:after-accept",
      message: "invite page accept result",
      data: {
        ok: result.ok,
        errorCode: result.ok ? null : result.errorCode,
        tokenLen: safeToken.length,
        hashPrefix: hashInviteToken(safeToken).slice(0, 8),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  if (result.ok || result.errorCode === "already_accepted") {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-[color:var(--background)] px-6 py-12 text-[color:var(--foreground)]">
      <InviteErrorCard errorCode={result.errorCode} />
    </main>
  );
}
