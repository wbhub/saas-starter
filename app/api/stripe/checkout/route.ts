import { NextResponse } from "next/server";
import { CHECKOUT_IN_FLIGHT_WINDOW_MS } from "@/lib/constants/billing";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { createClient } from "@/lib/supabase/server";
import { getPlanByKey } from "@/lib/stripe/config";
import { stripe } from "@/lib/stripe/server";
import { env } from "@/lib/env";
import { requireJsonContentType } from "@/lib/http/content-type";
import { parseJsonWithSchema, z } from "@/lib/http/request-validation";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyCsrfProtection } from "@/lib/security/csrf";
import { LIVE_SUBSCRIPTION_STATUSES } from "@/lib/stripe/plans";
import { parsePlanKey } from "@/lib/validation";
import { logger } from "@/lib/logger";
import { canManageTeamBilling, getTeamContextForUser } from "@/lib/team-context";
const checkoutPayloadSchema = z.object({
  planKey: z.string().trim(),
});

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

async function claimTeamStripeCustomer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
  createdCustomerId: string,
) {
  const { error: claimError } = await supabase.from("stripe_customers").upsert(
    {
      team_id: teamId,
      stripe_customer_id: createdCustomerId,
    },
    {
      onConflict: "team_id",
      ignoreDuplicates: true,
    },
  );

  if (claimError) {
    throw new Error(`Failed to claim Stripe customer mapping: ${claimError.message}`);
  }

  const { data: mapping, error: mappingError } = await supabase
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("team_id", teamId)
    .maybeSingle<{ stripe_customer_id: string }>();

  if (mappingError) {
    throw new Error(`Failed to load Stripe customer mapping: ${mappingError.message}`);
  }

  if (!mapping?.stripe_customer_id) {
    throw new Error("Stripe customer mapping was not created.");
  }

  return mapping.stripe_customer_id;
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
  const csrfError = verifyCsrfProtection(req);
  if (csrfError) {
    return csrfError;
  }

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
  if (!canManageTeamBilling(teamContext.role)) {
    return NextResponse.json(
      { error: "Only team owners and admins can manage billing." },
      { status: 403 },
    );
  }

  const rateLimit = await checkRateLimit({
    key: `stripe-checkout:team:${teamContext.teamId}`,
    ...RATE_LIMITS.stripeCheckoutByTeam,
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

  const bodyParse = await parseJsonWithSchema(req, checkoutPayloadSchema);
  if (!bodyParse.success && bodyParse.tooLarge) {
    return NextResponse.json({ error: "Request payload is too large." }, { status: 413 });
  }
  const planKey = bodyParse.success ? parsePlanKey(bodyParse.data) : null;
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
      const customerIdempotencyKey = getScopedIdempotencyKey(idempotencyKey, "customer");
      const customer = await stripe.customers.create(
        {
          email: user.email,
          metadata: {
            supabase_team_id: teamContext.teamId,
            supabase_user_id: user.id,
          },
        },
        customerIdempotencyKey
          ? { idempotencyKey: customerIdempotencyKey }
          : undefined,
      );
      customerId = await claimTeamStripeCustomer(
        supabase,
        teamContext.teamId,
        customer.id,
      );
      if (customerId !== customer.id) {
        // Another request won the team mapping race. Best-effort cleanup
        // prevents orphan customer buildup from duplicate creates.
        await stripe.customers.del(customer.id).catch((cleanupError) => {
          logger.warn("Failed to cleanup duplicate Stripe customer after race", {
            teamId: teamContext.teamId,
            duplicateCustomerId: customer.id,
            mappedCustomerId: customerId,
            error: cleanupError,
          });
        });
      }
    }

    if (await hasLiveStripeSubscription(customerId)) {
      return NextResponse.json(
        { error: "You already have an active subscription." },
        { status: 409 },
      );
    }

    const sessionIdempotencyKey = getScopedIdempotencyKey(idempotencyKey, "session");
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
      sessionIdempotencyKey
        ? { idempotencyKey: sessionIdempotencyKey }
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
