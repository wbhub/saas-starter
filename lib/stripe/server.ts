import Stripe from "stripe";
import { env } from "@/lib/env";

const STRIPE_API_VERSION: Stripe.LatestApiVersion = "2024-06-20";

export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: STRIPE_API_VERSION,
  appInfo: {
    name: "SaaS Starter",
  },
});
