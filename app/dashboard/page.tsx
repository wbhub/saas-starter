import Link from "next/link";
import { redirect } from "next/navigation";
import { BillingActions } from "@/components/billing-actions";
import { getPlanByPriceId } from "@/lib/stripe/config";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/dashboard/actions";

type ProfileRow = {
  id: string;
  full_name: string | null;
  created_at: string;
};

type SubscriptionRow = {
  status: "active" | "trialing" | "past_due" | "canceled" | "unpaid";
  stripe_price_id: string;
  current_period_end: string | null;
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, { data: subscription }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,full_name,created_at")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>(),
    supabase
      .from("subscriptions")
      .select("status,stripe_price_id,current_period_end")
      .eq("user_id", user.id)
      .order("current_period_end", { ascending: false })
      .limit(1)
      .maybeSingle<SubscriptionRow>(),
  ]);

  const currentPlan = getPlanByPriceId(subscription?.stripe_price_id);
  const status = subscription?.status;
  const hasSubscription =
    status !== undefined &&
    ["active", "trialing", "past_due", "unpaid"].includes(status);

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8 flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-slate-500">LedgerLift Dashboard</p>
            <h1 className="text-2xl font-semibold text-slate-900">
              Welcome, {profile?.full_name ?? user.email}
            </h1>
            <p className="text-sm text-slate-600">{user.email}</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              Home
            </Link>
            <form action={logout}>
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Logout
              </button>
            </form>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-900">Account</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">User ID</dt>
                <dd className="max-w-[220px] truncate text-slate-800">{user.id}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Member since</dt>
                <dd className="text-slate-800">
                  {new Date(profile?.created_at ?? user.created_at).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-900">Subscription</h2>
            {!subscription ? (
              <div className="mt-4 rounded-lg bg-slate-100 p-4 text-sm text-slate-600">
                No subscription yet. Pick a plan to start billing.
              </div>
            ) : (
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Current plan</dt>
                  <dd className="font-medium text-slate-900">
                    {currentPlan?.name ?? "Unknown"}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Status</dt>
                  <dd className="uppercase tracking-wide text-slate-800">
                    {subscription.status}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Period end</dt>
                  <dd className="text-slate-800">
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
      </div>
    </main>
  );
}
