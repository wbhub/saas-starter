import Stripe from "stripe";

const STRIPE_API_VERSION: Stripe.LatestApiVersion = "2026-02-25.clover";

let stripeClient: Stripe | null = null;

function getStripeSecretKey() {
  return process.env.STRIPE_SECRET_KEY?.trim() || null;
}

export function getStripeServerClient() {
  const secretKey = getStripeSecretKey();
  if (!secretKey) {
    return null;
  }
  if (!stripeClient) {
    stripeClient = new Stripe(secretKey, {
      apiVersion: STRIPE_API_VERSION,
      appInfo: {
        name: "SaaS Starter",
      },
    });
  }
  return stripeClient;
}
