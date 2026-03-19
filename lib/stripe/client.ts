"use client";

import { loadStripe } from "@stripe/stripe-js";

let stripePromise: ReturnType<typeof loadStripe> | null = null;

export function getStripe() {
  if (!stripePromise) {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) {
      throw new Error(
        "Missing required environment variable: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
      );
    }
    stripePromise = loadStripe(publishableKey);
  }
  return stripePromise;
}
