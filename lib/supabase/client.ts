"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/public-env";

export function createClient() {
  const supabaseUrl = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey = publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Missing NEXT_PUBLIC Supabase environment variables in the browser.");
  }

  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}
