import Link from "next/link";
import { redirect } from "next/navigation";
import { BillingActions } from "@/components/billing-actions";
import { SupportEmailCard } from "@/components/support-email-card";
import { getPlanByPriceId } from "@/lib/stripe/config";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/dashboard/actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { LIVE_SUBSCRIPTION_STATUSES, type SubscriptionStatus } from "@/lib/stripe/plans";
import { logger } from "@/lib/logger";
import { getTeamContextForUser } from "@/lib/team-context";
import { TeamInviteCard } from "@/components/team-invite-card";
import { NoTeamCard } from "@/components/no-team-card";

type ProfileRow = {
  id: string;
  full_name: string | null;
  created_at: string;
};

type SubscriptionRow = {
  status: SubscriptionStatus;
  stripe_price_id: string;
  seat_quantity: number;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

type TeamMembershipRow = {
  user_id: string;
  role: "owner" | "admin" | "member";
  created_at: string;
};

type PendingInviteRow = {
  id: string;
  email: string;
  role: "admin" | "member";
  expires_at: string;
};

type ProfileNameRow = {
  id: string;
  full_name: string | null;
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [profileResult, subscriptionResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,full_name,created_at")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>(),
    getTeamContextForUser(supabase, user.id),
  ]);

  if (profileResult.error) {
    logger.error("Failed to load dashboard profile", profileResult.error);
    throw new Error("Failed to load dashboard data");
  }

  if (!subscriptionResult) {
    return (
      <main className="min-h-screen bg-[color:var(--background)] px-6 py-10 text-[color:var(--foreground)]">
        <NoTeamCard />
      </main>
    );
  }

  const subscriptionFetchResult = await supabase
    .from("subscriptions")
    .select("status,stripe_price_id,seat_quantity,current_period_end,cancel_at_period_end")
    .eq("team_id", subscriptionResult.teamId)
    .in("status", LIVE_SUBSCRIPTION_STATUSES)
    .order("current_period_end", { ascending: false })
    .limit(1)
    .maybeSingle<SubscriptionRow>();

  if (subscriptionFetchResult.error) {
    logger.error("Failed to load dashboard subscription", subscriptionFetchResult.error);
    throw new Error("Failed to load dashboard data");
  }

  const profile = profileResult.data;
  const subscription = subscriptionFetchResult.data;
  const displayName = profile?.full_name?.trim() || user.email || "there";

  const currentPlan = getPlanByPriceId(subscription?.stripe_price_id);
  const status = subscription?.status;
  const hasSubscription =
    status !== undefined && LIVE_SUBSCRIPTION_STATUSES.includes(status);

  const [membershipResult, pendingInvitesResult] = await Promise.all([
    supabase
      .from("team_memberships")
      .select("user_id,role,created_at")
      .eq("team_id", subscriptionResult.teamId)
      .order("created_at", { ascending: true })
      .returns<TeamMembershipRow[]>(),
    supabase
      .from("team_invites")
      .select("id,email,role,expires_at")
      .eq("team_id", subscriptionResult.teamId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .returns<PendingInviteRow[]>(),
  ]);

  if (membershipResult.error) {
    logger.error("Failed to load team members", membershipResult.error);
    throw new Error("Failed to load dashboard data");
  }

  if (pendingInvitesResult.error) {
    logger.error("Failed to load pending team invites", pendingInvitesResult.error);
    throw new Error("Failed to load dashboard data");
  }

  const memberUserIds = (membershipResult.data ?? []).map((row) => row.user_id);
  const profileNamesResult = memberUserIds.length
    ? await supabase
        .from("profiles")
        .select("id,full_name")
        .in("id", memberUserIds)
        .returns<ProfileNameRow[]>()
    : { data: [], error: null };

  if (profileNamesResult.error) {
    logger.error("Failed to load team member profiles", profileNamesResult.error);
    throw new Error("Failed to load dashboard data");
  }

  const profileNameMap = new Map(
    (profileNamesResult.data ?? []).map((row) => [row.id, row.full_name]),
  );
  const teamMembers = (membershipResult.data ?? []).map((row) => ({
    userId: row.user_id,
    fullName: profileNameMap.get(row.user_id) ?? null,
    role: row.role,
  }));
  const pendingInvites = (pendingInvitesResult.data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    expiresAt: row.expires_at,
  }));

  return (
    <main className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8 flex flex-col gap-4 rounded-xl border app-border-subtle app-surface p-6 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="mt-1 hidden md:block">
              <ThemeToggle />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                App Dashboard
              </p>
              <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
                Welcome, {displayName}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {user.email}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="md:hidden">
              <ThemeToggle />
            </div>
            <Link
              href="/"
              className="rounded-lg border app-border-subtle px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              Home
            </Link>
            <form action={logout}>
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
              >
                Logout
              </button>
            </form>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              Account
            </h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">User ID</dt>
                <dd className="max-w-[220px] truncate text-slate-800 dark:text-slate-100">
                  {user.id}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Team</dt>
                <dd className="max-w-[220px] truncate text-slate-800 dark:text-slate-100">
                  {subscriptionResult.teamName ?? "My Team"}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Role</dt>
                <dd className="text-slate-800 dark:text-slate-100 capitalize">
                  {subscriptionResult.role}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">
                  Member since
                </dt>
                <dd className="text-slate-800 dark:text-slate-100">
                  {new Date(profile?.created_at ?? user.created_at).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </article>

          <article className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              Subscription
            </h2>
            {!subscription ? (
              <div className="mt-4 rounded-lg app-surface-subtle p-4 text-sm text-slate-600 dark:text-slate-200">
                No subscription yet. Pick a plan to start billing.
              </div>
            ) : (
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">
                    Current plan
                  </dt>
                  <dd className="font-medium text-slate-900 dark:text-slate-100">
                    {currentPlan?.name ?? "Unknown"}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">Status</dt>
                  <dd className="uppercase tracking-wide text-slate-800 dark:text-slate-100">
                    {subscription.status}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">Seats</dt>
                  <dd className="text-slate-800 dark:text-slate-100">
                    {subscription.seat_quantity}
                  </dd>
                </div>
                {subscription.cancel_at_period_end ? (
                  <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
                    Scheduled to cancel at period end.
                  </div>
                ) : null}
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">
                    Period end
                  </dt>
                  <dd className="text-slate-800 dark:text-slate-100">
                    {subscription.current_period_end
                      ? new Date(subscription.current_period_end).toLocaleDateString()
                      : "N/A"}
                  </dd>
                </div>
              </dl>
            )}
          </article>
        </section>

        <section className="mt-4">
          <BillingActions
            currentPlanKey={currentPlan?.key ?? null}
            hasSubscription={hasSubscription}
          />
        </section>

        <section className="mt-4">
          <SupportEmailCard />
        </section>

        <section className="mt-4">
          <TeamInviteCard
            canInvite={subscriptionResult.role === "owner" || subscriptionResult.role === "admin"}
            teamName={subscriptionResult.teamName ?? "My Team"}
            members={teamMembers}
            pendingInvites={pendingInvites}
            currentUserId={user.id}
            currentUserRole={subscriptionResult.role}
          />
        </section>
      </div>
    </main>
  );
}
