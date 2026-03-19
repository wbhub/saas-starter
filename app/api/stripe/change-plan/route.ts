import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlanByKey } from "@/lib/stripe/config";
import { stripe } from "@/lib/stripe/server";
import { syncSubscription } from "@/lib/stripe/sync";
import { checkRateLimit } from "@/lib/security/rate-limit";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = checkRateLimit({
    key: `stripe-change-plan:user:${user.id}`,
    limit: 10,
    windowMs: 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const body = (await req.json().catch(() => null)) as { planKey?: string } | null;
  const plan = getPlanByKey(body?.planKey ?? "");
  if (!plan) {
    return NextResponse.json({ error: "Invalid target plan" }, { status: 400 });
  }

  const { data: subscriptionRow, error: subscriptionRowError } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id,status")
    .eq("user_id", user.id)
    .in("status", ["active", "trialing", "past_due", "unpaid"])
    .order("current_period_end", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subscriptionRowError) {
    return NextResponse.json(
      { error: "Could not load current subscription state." },
      { status: 500 },
    );
  }

  if (!subscriptionRow?.stripe_subscription_id) {
    return NextResponse.json(
      { error: "No active subscription found. Start a new checkout first." },
      { status: 404 },
    );
  }

  try {
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

    if (firstItem.price.id === plan.priceId) {
      return NextResponse.json(
        { error: "Your subscription is already on this plan." },
        { status: 409 },
      );
    }

    const updated = await stripe.subscriptions.update(stripeSubscription.id, {
      items: [{ id: firstItem.id, price: plan.priceId }],
      proration_behavior: "create_prorations",
    });

    await syncSubscription(updated);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to change Stripe subscription plan", error);
    return NextResponse.json(
      { error: "Unable to change your plan right now. Please try again." },
      { status: 500 },
    );
  }
}
