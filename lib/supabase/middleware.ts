import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export async function updateSession(
  request: NextRequest,
  options?: { requestHeaders?: Headers },
) {
  const requestHeaders = options?.requestHeaders ?? request.headers;
  let user: User | null = null;
  let response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  try {
    const supabase = createServerClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));

            response = NextResponse.next({
              request: {
                headers: requestHeaders,
              },
            });

            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    const authResult = await supabase.auth.getUser();
    user = authResult.data.user;
  } catch (error) {
    logger.error("Supabase middleware session refresh skipped due to configuration/runtime error", error);
  }
  return { response, user };
}
