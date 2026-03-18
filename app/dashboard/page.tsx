import Link from "next/link";
import { redirect } from "next/navigation";
import { BillingActions } from "@/components/billing-actions";
import { SupportEmailCard } from "@/components/support-email-card";
import { getPlanByPriceId } from "@/lib/stripe/config";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/dashboard/actions";
import { ThemeToggle } from "@/components/theme-toggle";

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
    <main className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8 flex flex-col gap-4 rounded-xl border app-border-subtle app-surface p-6 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="mt-1 hidden md:block">
              <ThemeToggle />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              App Dashboard
            </p>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
              Welcome, {profile?.full_name ?? user.email}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {user.email}
            </p>
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
      </div>
    </main>
  );
}
