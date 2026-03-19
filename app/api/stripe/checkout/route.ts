import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlanByKey } from "@/lib/stripe/config";
import { stripe } from "@/lib/stripe/server";
import { env } from "@/lib/env";
import { upsertStripeCustomer } from "@/lib/stripe/sync";
import { requireJsonContentType } from "@/lib/http/content-type";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { LIVE_SUBSCRIPTION_STATUSES } from "@/lib/stripe/plans";
import { parsePlanKey } from "@/lib/validation";
import { logger } from "@/lib/logger";
import { getTeamContextForUser } from "@/lib/team-context";

const CHECKOUT_IN_FLIGHT_WINDOW_MS = 10 * 1000;

async function isOwnedStripeCustomer(teamId: string, customerId: string) {
  const customer = await stripe.customers.retrieve(customerId);
  if ("deleted" in customer) {
    return false;
  }

  return customer.metadata?.supabase_team_id === teamId;
}

async function hasLiveStripeSubscription(customerId: string) {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });

  return subscriptions.data.some((subscription) =>
    LIVE_SUBSCRIPTION_STATUSES.includes(subscription.status),
  );
}

function getCheckoutIdempotencyKey(request: Request, teamId: string, planKey: string) {
  const rawKey = request.headers.get("x-idempotency-key")?.trim();
  if (!rawKey) {
    return undefined;
  }

  const safeKey = rawKey.slice(0, 80);
  return `checkout:${teamId}:${planKey}:${safeKey}`;
}

function getScopedIdempotencyKey(baseKey: string | undefined, scope: string) {
  if (!baseKey) {
    return undefined;
  }

  return `${baseKey}:${scope}`;
}

async function getTeamSeatCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
) {
  const { count, error } = await supabase
    .from("team_memberships")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId);

  if (error) {
    throw new Error(`Failed to load team seat count: ${error.message}`);
  }

  return Math.max(1, count ?? 1);
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

  const teamContext = await getTeamContextForUser(supabase, user.id);
  if (!teamContext) {
    return NextResponse.json(
      { error: "No team membership found for this account." },
      { status: 403 },
    );
  }

  const rateLimit = await checkRateLimit({
    key: `stripe-checkout:team:${teamContext.teamId}`,
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
    return NextResponse.json({ error: "Invalid plan selected" }, { status: 400 });
  }
  const idempotencyKey = getCheckoutIdempotencyKey(req, teamContext.teamId, plan.key);

  const inFlightCheckout = await checkRateLimit({
    key: `stripe-checkout:inflight:${teamContext.teamId}:${plan.key}`,
    limit: 1,
    windowMs: CHECKOUT_IN_FLIGHT_WINDOW_MS,
  });
  if (!inFlightCheckout.allowed) {
    return NextResponse.json(
      { error: "Checkout is already in progress. Please wait and try again." },
      {
        status: 409,
        headers: { "Retry-After": String(inFlightCheckout.retryAfterSeconds) },
      },
    );
  }

  const { data: existingSubscription, error: existingSubscriptionError } =
    await supabase
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("team_id", teamContext.teamId)
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
    .eq("team_id", teamContext.teamId)
    .maybeSingle();

  if (customerRowError) {
    return NextResponse.json(
      { error: "Could not load Stripe customer record." },
      { status: 500 },
    );
  }

  let customerId = customerRow?.stripe_customer_id;

  try {
    const seatCount = await getTeamSeatCount(supabase, teamContext.teamId);

    if (customerId) {
      const isOwned = await isOwnedStripeCustomer(teamContext.teamId, customerId);
      if (!isOwned) {
        customerId = undefined;
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create(
        {
          email: user.email,
          metadata: {
            supabase_team_id: teamContext.teamId,
            supabase_user_id: user.id,
          },
        },
        getScopedIdempotencyKey(idempotencyKey, "customer")
          ? { idempotencyKey: getScopedIdempotencyKey(idempotencyKey, "customer") }
          : undefined,
      );
      customerId = customer.id;
      await upsertStripeCustomer(teamContext.teamId, customerId);
    }

    if (await hasLiveStripeSubscription(customerId)) {
      return NextResponse.json(
        { error: "You already have an active subscription." },
        { status: 409 },
      );
    }

    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId,
        client_reference_id: teamContext.teamId,
        payment_method_types: ["card"],
        line_items: [{ price: plan.priceId, quantity: seatCount }],
        success_url: `${env.NEXT_PUBLIC_APP_URL}/dashboard?checkout=success`,
        cancel_url: `${env.NEXT_PUBLIC_APP_URL}/dashboard?checkout=canceled`,
        metadata: {
          supabase_team_id: teamContext.teamId,
          supabase_user_id: user.id,
        },
      },
      getScopedIdempotencyKey(idempotencyKey, "session")
        ? { idempotencyKey: getScopedIdempotencyKey(idempotencyKey, "session") }
        : undefined,
    );

    return NextResponse.json({ url: session.url });
  } catch (error) {
    logger.error("Failed to create Stripe checkout session", error);
    return NextResponse.json(
      { error: "Unable to start checkout right now. Please try again." },
      { status: 500 },
    );
  }
}
