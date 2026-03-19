-- Generic SaaS Starter Supabase schema
-- Run in Supabase SQL editor

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.stripe_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_subscription_id text not null unique,
  stripe_customer_id text not null,
  stripe_price_id text not null,
  stripe_subscription_created_at timestamptz,
  stripe_event_created_at timestamptz,
  status text not null check (
    status in (
      'incomplete',
      'incomplete_expired',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid',
      'paused'
    )
  ),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  processed_at timestamptz not null default timezone('utc', now()),
  claim_expires_at timestamptz,
  completed_at timestamptz
);

create table if not exists public.rate_limit_windows (
  key text primary key,
  count integer not null,
  reset_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_profiles_created_at on public.profiles(created_at desc);
create index if not exists idx_stripe_customers_user_id on public.stripe_customers(user_id);
create index if not exists idx_subscriptions_user_id on public.subscriptions(user_id);
create index if not exists idx_subscriptions_status on public.subscriptions(status);
create index if not exists idx_subscriptions_stripe_customer_id on public.subscriptions(stripe_customer_id);
create index if not exists idx_subscriptions_user_id_status on public.subscriptions(user_id, status);
create index if not exists idx_subscriptions_period_end on public.subscriptions(current_period_end desc);
create index if not exists idx_subscriptions_created_at on public.subscriptions(stripe_subscription_created_at desc);
create index if not exists idx_subscriptions_event_created_at on public.subscriptions(stripe_event_created_at desc);
create unique index if not exists ux_subscriptions_one_live_per_user
on public.subscriptions(user_id)
where status in ('incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused');
create index if not exists idx_stripe_webhook_events_processed_at on public.stripe_webhook_events(processed_at desc);
create index if not exists idx_stripe_webhook_events_completed_at on public.stripe_webhook_events(completed_at desc);
create index if not exists idx_rate_limit_windows_reset_at on public.rate_limit_windows(reset_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists stripe_customers_set_updated_at on public.stripe_customers;
create trigger stripe_customers_set_updated_at
before update on public.stripe_customers
for each row execute function public.set_updated_at();

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

drop trigger if exists rate_limit_windows_set_updated_at on public.rate_limit_windows;
create trigger rate_limit_windows_set_updated_at
before update on public.rate_limit_windows
for each row execute function public.set_updated_at();

create or replace function public.check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_count integer;
  v_reset_at timestamptz;
begin
  if p_limit <= 0 then
    return query select false, greatest(1, p_window_seconds);
    return;
  end if;

  if p_window_seconds <= 0 then
    return query select true, 0;
    return;
  end if;

  if random() < 0.01 then
    delete from public.rate_limit_windows
    where reset_at < v_now - interval '1 day';
  end if;

  insert into public.rate_limit_windows as rl (key, count, reset_at, created_at, updated_at)
  values (
    p_key,
    1,
    v_now + make_interval(secs => p_window_seconds),
    v_now,
    v_now
  )
  on conflict (key) do update
  set
    count = case
      when rl.reset_at <= v_now then 1
      else rl.count + 1
    end,
    reset_at = case
      when rl.reset_at <= v_now then v_now + make_interval(secs => p_window_seconds)
      else rl.reset_at
    end,
    updated_at = v_now
  returning count, reset_at into v_count, v_reset_at;

  if v_count <= p_limit then
    return query select true, 0;
    return;
  end if;

  return query
  select false, greatest(1, ceil(extract(epoch from (v_reset_at - v_now)))::integer);
end;
$$;

revoke execute on function public.check_rate_limit(text, integer, integer) from public;
revoke execute on function public.check_rate_limit(text, integer, integer) from anon;
revoke execute on function public.check_rate_limit(text, integer, integer) from authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

create or replace function public.sync_stripe_subscription_atomic(
  p_user_id uuid,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_stripe_price_id text,
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
  v_existing_event_created_at timestamptz;
  v_has_newer_live_subscription boolean := false;
  v_upserted_count integer := 0;
begin
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
    user_id,
    stripe_customer_id
  )
  values (
    p_user_id,
    p_stripe_customer_id
  )
  on conflict (user_id) do update
  set stripe_customer_id = excluded.stripe_customer_id;

  select s.stripe_event_created_at
  into v_existing_event_created_at
  from public.subscriptions s
  where s.stripe_subscription_id = p_stripe_subscription_id
  for update;

  if v_existing_event_created_at is not null and v_existing_event_created_at > p_stripe_event_created_at then
    return false;
  end if;

  if p_status = any(v_live_statuses) then
    select exists (
      select 1
      from public.subscriptions s
      where s.user_id = p_user_id
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
    where user_id = p_user_id
      and stripe_subscription_id <> p_stripe_subscription_id
      and status = any(v_live_statuses);
  end if;

  insert into public.subscriptions as s (
    user_id,
    stripe_subscription_id,
    stripe_customer_id,
    stripe_price_id,
    status,
    stripe_subscription_created_at,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    stripe_event_created_at
  )
  values (
    p_user_id,
    p_stripe_subscription_id,
    p_stripe_customer_id,
    p_stripe_price_id,
    p_status,
    p_stripe_subscription_created_at,
    p_current_period_start,
    p_current_period_end,
    p_cancel_at_period_end,
    p_stripe_event_created_at
  )
  on conflict (stripe_subscription_id) do update
  set
    user_id = excluded.user_id,
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_price_id = excluded.stripe_price_id,
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

revoke execute on function public.sync_stripe_subscription_atomic(uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, boolean, timestamptz) from public;
revoke execute on function public.sync_stripe_subscription_atomic(uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, boolean, timestamptz) from anon;
revoke execute on function public.sync_stripe_subscription_atomic(uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, boolean, timestamptz) from authenticated;
grant execute on function public.sync_stripe_subscription_atomic(uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, boolean, timestamptz) to service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.stripe_customers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.stripe_webhook_events enable row level security;
alter table public.rate_limit_windows enable row level security;

alter table public.subscriptions
drop constraint if exists subscriptions_status_check;

alter table public.subscriptions
add column if not exists stripe_event_created_at timestamptz;

alter table public.subscriptions
add column if not exists stripe_subscription_created_at timestamptz;

alter table public.stripe_webhook_events
add column if not exists claim_expires_at timestamptz;

alter table public.stripe_webhook_events
add column if not exists completed_at timestamptz;

-- Backfill legacy dedupe rows created before claim tracking.
update public.stripe_webhook_events
set completed_at = processed_at
where completed_at is null
  and claim_expires_at is null;

alter table public.subscriptions
add constraint subscriptions_status_check
check (
  status in (
    'incomplete',
    'incomplete_expired',
    'trialing',
    'active',
    'past_due',
    'canceled',
    'unpaid',
    'paused'
  )
);

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

-- Intentionally no DELETE policy on user-owned tables.
-- With RLS enabled, deletes are denied by default unless explicitly allowed.
-- Cleanup is handled via ON DELETE CASCADE from auth.users.

drop policy if exists "Users can read own stripe customer" on public.stripe_customers;
create policy "Users can read own stripe customer"
on public.stripe_customers
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own stripe customer" on public.stripe_customers;
drop policy if exists "Users can update own stripe customer" on public.stripe_customers;

drop policy if exists "Users can read own subscriptions" on public.subscriptions;
create policy "Users can read own subscriptions"
on public.subscriptions
for select
to authenticated
using (auth.uid() = user_id);
