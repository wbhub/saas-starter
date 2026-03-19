-- Add a claim token to Stripe webhook dedupe rows so
-- heartbeat/release/finalize updates are lease-owner-scoped.

alter table public.stripe_webhook_events
add column if not exists claim_token text;
