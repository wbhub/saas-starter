export const publicEnv = {
  get NEXT_PUBLIC_AUTH_GOOGLE_ENABLED() {
    return process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED?.trim() || undefined;
  },
  get NEXT_PUBLIC_AUTH_LOGIN_METHOD() {
    return process.env.NEXT_PUBLIC_AUTH_LOGIN_METHOD?.trim() || undefined;
  },
  get NEXT_PUBLIC_AUTH_MICROSOFT_ENABLED() {
    return process.env.NEXT_PUBLIC_AUTH_MICROSOFT_ENABLED?.trim() || undefined;
  },
  get NEXT_PUBLIC_SUPABASE_URL() {
    return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  },
  get NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY() {
    return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || "";
  },
};
