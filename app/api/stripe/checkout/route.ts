import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlanByKey } from "@/lib/stripe/config";
import { stripe } from "@/lib/stripe/server";
import { env } from "@/lib/env";
import { upsertStripeCustomer } from "@/lib/stripe/sync";
import { checkRateLimit } from "@/lib/security/rate-limit";

const LIVE_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due", "unpaid"];

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = checkRateLimit({
    key: `stripe-checkout:user:${user.id}`,
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
    return NextResponse.json({ error: "Invalid plan selected" }, { status: 400 });
  }

  const { data: existingSubscription, error: existingSubscriptionError } =
    await supabase
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("user_id", user.id)
      .in("status", LIVE_SUBSCRIPTION_STATUSES)
      .order("current_period_end", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (existingSubscriptionError) {
    return NextResponse.json(
      { error: "Could not verify current subscription state." },
      { status: 500 },
    );
  }

  if (existingSubscription?.stripe_subscription_id) {
    return NextResponse.json(
      { error: "You already have an active subscription." },
      { status: 409 },
    );
  }

  const { data: customerRow, error: customerRowError } = await supabase
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (customerRowError) {
    return NextResponse.json(
      { error: "Could not load Stripe customer record." },
      { status: 500 },
    );
  }

  let customerId = customerRow?.stripe_customer_id;

  try {
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: user.id,
        },
      });
      customerId = customer.id;
      await upsertStripeCustomer(user.id, customerId);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      payment_method_types: ["card"],
      line_items: [{ price: plan.priceId, quantity: 1 }],
      success_url: `${env.NEXT_PUBLIC_APP_URL}/dashboard?checkout=success`,
      cancel_url: `${env.NEXT_PUBLIC_APP_URL}/dashboard?checkout=canceled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Failed to create Stripe checkout session", error);
    return NextResponse.json(
      { error: "Unable to start checkout right now. Please try again." },
      { status: 500 },
    );
  }
}
