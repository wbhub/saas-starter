/**
 * Client-readable cookie set when a user passes the dashboard onboarding gate.
 * Used as a UI hint by AuthAwareLink to show the correct CTA label;
 * the server-side gate in dashboard/layout.tsx remains authoritative.
 */
export const ONBOARDING_COMPLETE_COOKIE = "onboarding_complete";
