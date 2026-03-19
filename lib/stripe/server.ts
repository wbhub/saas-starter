import Stripe from "stripe";
import { env } from "@/lib/env";

const STRIPE_API_VERSION: Stripe.LatestApiVersion = "2026-02-25.clover";

export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: STRIPE_API_VERSION,
  appInfo: {
    name: "SaaS Starter",
  },
});
