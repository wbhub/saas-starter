import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlanByKey } from "@/lib/stripe/config";
import { stripe } from "@/lib/stripe/server";
import { env } from "@/lib/env";
import { upsertStripeCustomer } from "@/lib/stripe/sync";

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
    return NextResponse.json({ error: "Invalid plan selected" }, { status: 400 });
  }

  const { data: customerRow } = await supabase
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  let customerId = customerRow?.stripe_customer_id;

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
}
