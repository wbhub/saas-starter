import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlanByKey } from "@/lib/stripe/config";
import { stripe } from "@/lib/stripe/server";
import { syncSubscription } from "@/lib/stripe/sync";
import { requireJsonContentType } from "@/lib/http/content-type";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { LIVE_SUBSCRIPTION_STATUSES } from "@/lib/stripe/plans";
import { parsePlanKey } from "@/lib/validation";
import { logger } from "@/lib/logger";

function getChangePlanIdempotencyKey(request: Request, userId: string, planKey: string) {
  const rawKey = request.headers.get("x-idempotency-key")?.trim();
  if (!rawKey) {
    return undefined;
  }

  const safeKey = rawKey.slice(0, 80);
  return `change-plan:${userId}:${planKey}:${safeKey}`;
}

export async function POST(req: Request) {
  const contentTypeError = requireJsonContentType(req);
  if (contentTypeError) {
    return contentTypeError;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
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

  const body = await req.json().catch(() => null);
  const planKey = parsePlanKey(body);
  if (!planKey) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  const plan = getPlanByKey(planKey);
  if (!plan) {
    return NextResponse.json({ error: "Invalid target plan" }, { status: 400 });
  }
  const idempotencyKey = getChangePlanIdempotencyKey(req, user.id, plan.key);

  const { data: subscriptionRow, error: subscriptionRowError } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id,status")
    .eq("user_id", user.id)
    .in("status", LIVE_SUBSCRIPTION_STATUSES)
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
    // Single retrieve — used for both ownership verification and plan comparison.
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscriptionRow.stripe_subscription_id,
    );

    const customerId =
      typeof stripeSubscription.customer === "string"
        ? stripeSubscription.customer
        : stripeSubscription.customer.id;
    const customer = await stripe.customers.retrieve(customerId);

    if ("deleted" in customer || customer.metadata?.supabase_user_id !== user.id) {
      return NextResponse.json(
        {
          error:
            "Billing identity mismatch detected. Start a new checkout to re-link your account.",
        },
        { status: 409 },
      );
    }

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

    const updated = await stripe.subscriptions.update(
      stripeSubscription.id,
      {
        items: [{ id: firstItem.id, price: plan.priceId }],
        proration_behavior: "create_prorations",
      },
      idempotencyKey ? { idempotencyKey } : undefined,
    );

    try {
      await syncSubscription(updated, {
        eventCreatedUnix: Math.floor(Date.now() / 1000),
      });
      return NextResponse.json({ ok: true });
    } catch (syncError) {
      logger.error("Plan changed in Stripe but local sync failed; awaiting webhook recovery", syncError);
      return NextResponse.json({ ok: true, syncPending: true });
    }
  } catch (error) {
    logger.error("Failed to change Stripe subscription plan", error);
    return NextResponse.json(
      { error: "Unable to change your plan right now. Please try again." },
      { status: 500 },
    );
  }
}
