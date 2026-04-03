-- Add stripe_subscription_item_id to subscriptions table and update the
-- sync_stripe_subscription_atomic RPC to accept and persist it.
--
-- Run this against your Supabase project:
--   psql "$DATABASE_URL" -f supabase/upgrades/001_add_subscription_item_id.sql
--
-- Existing rows will have NULL until their next sync event (webhook, seat
-- change, plan change), after which the column is populated automatically.

-- 1. Add the column (nullable so existing rows aren't affected).
alter table public.subscriptions
  add column if not exists stripe_subscription_item_id text;

-- 2. Drop the old function signature so the new one can be created.
drop function if exists public.sync_stripe_subscription_atomic(
  uuid, text, text, text, integer, text, timestamptz, timestamptz, timestamptz, boolean, timestamptz
);

-- 3. Recreate with the new parameter.
create or replace function public.sync_stripe_subscription_atomic(
  p_team_id uuid,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_stripe_price_id text,
  p_stripe_subscription_item_id text,
  p_seat_quantity integer,
  p_status text,
  p_stripe_subscription_created_at timestamptz,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_stripe_event_created_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_live_statuses text[] := array['incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused'];
  v_existing_team_id uuid;
  v_existing_event_created_at timestamptz;
  v_has_newer_live_subscription boolean := false;
  v_upserted_count integer := 0;
begin
  if p_seat_quantity < 0 then
    raise exception 'Seat quantity must be non-negative.';
  end if;

  if p_status not in (
    'incomplete',
    'incomplete_expired',
    'trialing',
    'active',
    'past_due',
    'canceled',
    'unpaid',
    'paused'
  ) then
    raise exception 'Unsupported subscription status: %', p_status;
  end if;

  insert into public.stripe_customers as sc (
    team_id,
    stripe_customer_id
  )
  values (
    p_team_id,
    p_stripe_customer_id
  )
  on conflict (team_id) do update
  set stripe_customer_id = excluded.stripe_customer_id;

  select s.team_id, s.stripe_event_created_at
  into v_existing_team_id, v_existing_event_created_at
  from public.subscriptions s
  where s.stripe_subscription_id = p_stripe_subscription_id
  for update;

  if v_existing_team_id is not null and v_existing_team_id <> p_team_id then
    return false;
  end if;

  if v_existing_event_created_at is not null and v_existing_event_created_at > p_stripe_event_created_at then
    return false;
  end if;

  if p_status = any(v_live_statuses) then
    select exists (
      select 1
      from public.subscriptions s
      where s.team_id = p_team_id
        and s.stripe_subscription_id <> p_stripe_subscription_id
        and s.status = any(v_live_statuses)
        and (
          (
            s.stripe_subscription_created_at is not null
            and s.stripe_subscription_created_at > p_stripe_subscription_created_at
          )
          or (
            s.stripe_subscription_created_at = p_stripe_subscription_created_at
            and s.stripe_subscription_id > p_stripe_subscription_id
          )
        )
    )
    into v_has_newer_live_subscription;

    if v_has_newer_live_subscription then
      return false;
    end if;

    update public.subscriptions
    set
      status = 'canceled',
      cancel_at_period_end = true
    where team_id = p_team_id
      and stripe_subscription_id <> p_stripe_subscription_id
      and status = any(v_live_statuses);
  end if;

  insert into public.subscriptions as s (
    team_id,
    stripe_subscription_id,
    stripe_customer_id,
    stripe_price_id,
    stripe_subscription_item_id,
    seat_quantity,
    status,
    stripe_subscription_created_at,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    stripe_event_created_at
  )
  values (
    p_team_id,
    p_stripe_subscription_id,
    p_stripe_customer_id,
    p_stripe_price_id,
    p_stripe_subscription_item_id,
    p_seat_quantity,
    p_status,
    p_stripe_subscription_created_at,
    p_current_period_start,
    p_current_period_end,
    p_cancel_at_period_end,
    p_stripe_event_created_at
  )
  on conflict (stripe_subscription_id) do update
  set
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_price_id = excluded.stripe_price_id,
    stripe_subscription_item_id = excluded.stripe_subscription_item_id,
    seat_quantity = excluded.seat_quantity,
    status = excluded.status,
    stripe_subscription_created_at = excluded.stripe_subscription_created_at,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    stripe_event_created_at = excluded.stripe_event_created_at
  where s.stripe_event_created_at is null
    or s.stripe_event_created_at <= excluded.stripe_event_created_at;

  get diagnostics v_upserted_count = row_count;
  return v_upserted_count > 0;
end;
$$;

-- 4. Re-apply grants for the new function signature.
revoke execute on function public.sync_stripe_subscription_atomic(uuid, text, text, text, text, integer, text, timestamptz, timestamptz, timestamptz, boolean, timestamptz) from public;
revoke execute on function public.sync_stripe_subscription_atomic(uuid, text, text, text, text, integer, text, timestamptz, timestamptz, timestamptz, boolean, timestamptz) from anon;
revoke execute on function public.sync_stripe_subscription_atomic(uuid, text, text, text, text, integer, text, timestamptz, timestamptz, timestamptz, boolean, timestamptz) from authenticated;
grant execute on function public.sync_stripe_subscription_atomic(uuid, text, text, text, text, integer, text, timestamptz, timestamptz, timestamptz, boolean, timestamptz) to service_role;
