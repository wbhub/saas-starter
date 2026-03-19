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
  processed_at timestamptz not null default timezone('utc', now())
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
create index if not exists idx_subscriptions_period_end on public.subscriptions(current_period_end desc);
create unique index if not exists ux_subscriptions_one_live_per_user
on public.subscriptions(user_id)
where status in ('incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused');
create index if not exists idx_stripe_webhook_events_processed_at on public.stripe_webhook_events(processed_at desc);
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
