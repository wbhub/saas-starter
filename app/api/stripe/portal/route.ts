import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/server";
import { env } from "@/lib/env";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: customerRow } = await supabase
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!customerRow?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No customer record found for this account." },
      { status: 404 },
    );
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerRow.stripe_customer_id,
    return_url: `${env.NEXT_PUBLIC_APP_URL}/dashboard`,
  });

  return NextResponse.json({ url: session.url });
}
