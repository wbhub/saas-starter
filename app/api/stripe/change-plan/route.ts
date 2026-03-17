import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlanByKey } from "@/lib/stripe/config";
import { stripe } from "@/lib/stripe/server";
import { syncSubscription } from "@/lib/stripe/sync";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const plan = getPlanByKey(body.planKey as string);
  if (!plan) {
    return NextResponse.json({ error: "Invalid target plan" }, { status: 400 });
  }

  const { data: subscriptionRow } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id,status")
    .eq("user_id", user.id)
    .in("status", ["active", "trialing", "past_due", "unpaid"])
    .order("current_period_end", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!subscriptionRow?.stripe_subscription_id) {
    return NextResponse.json(
      { error: "No active subscription found. Start a new checkout first." },
      { status: 404 },
    );
  }

  const stripeSubscription = await stripe.subscriptions.retrieve(
    subscriptionRow.stripe_subscription_id,
  );
  const firstItem = stripeSubscription.items.data[0];

  if (!firstItem) {
    return NextResponse.json(
      { error: "Subscription item not found." },
      { status: 400 },
    );
  }

  const updated = await stripe.subscriptions.update(stripeSubscription.id, {
    items: [{ id: firstItem.id, price: plan.priceId }],
    proration_behavior: "create_prorations",
  });

  await syncSubscription(updated);

  return NextResponse.json({ ok: true });
}
