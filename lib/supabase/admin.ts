import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { LooseDatabase } from "@/lib/supabase/types";

type LooseSupabaseClient = ReturnType<typeof createClient<LooseDatabase>>;

let adminClient: LooseSupabaseClient | null = null;

export function createAdminClient() {
  if (adminClient) {
    return adminClient;
  }

  adminClient = createClient<LooseDatabase>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  return adminClient;
}
