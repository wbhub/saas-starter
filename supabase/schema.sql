-- Generic SaaS Starter Supabase schema (team-based)
-- Run in Supabase SQL editor

create extension if not exists "pgcrypto";

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.team_memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (team_id, user_id)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  active_team_id uuid references public.teams(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.stripe_customers (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null unique references public.teams(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  stripe_subscription_id text not null unique,
  stripe_customer_id text not null,
  stripe_price_id text not null,
  seat_quantity integer not null default 1 check (seat_quantity > 0),
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

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'member')),
  token_hash text not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  processed_at timestamptz not null default timezone('utc', now()),
  claim_token text,
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

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  outcome text not null check (outcome in ('success', 'failure', 'denied')),
  actor_user_id uuid references auth.users(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  model text not null,
  prompt_tokens integer not null default 0 check (prompt_tokens >= 0),
  completion_tokens integer not null default 0 check (completion_tokens >= 0),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.ai_usage_monthly_totals (
  team_id uuid not null references public.teams(id) on delete cascade,
  month_start date not null,
  reserved_tokens integer not null default 0 check (reserved_tokens >= 0),
  used_tokens integer not null default 0 check (used_tokens >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (team_id, month_start)
);

create table if not exists public.ai_usage_budget_claims (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  month_start date not null,
  projected_tokens integer not null check (projected_tokens > 0),
  actual_tokens integer check (actual_tokens >= 0),
  finalized_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.seat_sync_retries (
  team_id uuid primary key references public.teams(id) on delete cascade,
  reason text not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  next_attempt_at timestamptz not null default timezone('utc', now()),
  last_attempt_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_profiles_created_at on public.profiles(created_at desc);
create index if not exists idx_profiles_active_team_id on public.profiles(active_team_id);
create index if not exists idx_teams_created_at on public.teams(created_at desc);
create index if not exists idx_teams_created_by on public.teams(created_by);
create index if not exists idx_team_memberships_team_id on public.team_memberships(team_id);
create index if not exists idx_team_memberships_user_id on public.team_memberships(user_id);
create index if not exists idx_team_memberships_role on public.team_memberships(role);
create index if not exists idx_stripe_customers_team_id on public.stripe_customers(team_id);
create index if not exists idx_subscriptions_team_id on public.subscriptions(team_id);
create index if not exists idx_subscriptions_status on public.subscriptions(status);
create index if not exists idx_subscriptions_stripe_customer_id on public.subscriptions(stripe_customer_id);
create index if not exists idx_subscriptions_team_id_status on public.subscriptions(team_id, status);
create index if not exists idx_subscriptions_period_end on public.subscriptions(current_period_end desc);
create index if not exists idx_subscriptions_created_at on public.subscriptions(stripe_subscription_created_at desc);
create index if not exists idx_subscriptions_event_created_at on public.subscriptions(stripe_event_created_at desc);
create index if not exists idx_team_invites_team_id on public.team_invites(team_id);
create index if not exists idx_team_invites_email on public.team_invites(email);
create index if not exists idx_team_invites_expires_at on public.team_invites(expires_at desc);
create index if not exists idx_team_invites_created_at on public.team_invites(created_at desc);
drop index if exists ux_team_invites_one_pending_per_email_per_team;
create unique index if not exists ux_team_invites_one_pending_per_email_per_team_ci
on public.team_invites(team_id, lower(email))
where accepted_at is null;
create unique index if not exists ux_subscriptions_one_live_per_team
on public.subscriptions(team_id)
where status in ('incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused');
create index if not exists idx_stripe_webhook_events_processed_at on public.stripe_webhook_events(processed_at desc);
create index if not exists idx_stripe_webhook_events_completed_at on public.stripe_webhook_events(completed_at desc);
create index if not exists idx_rate_limit_windows_reset_at on public.rate_limit_windows(reset_at desc);
create index if not exists idx_audit_events_created_at on public.audit_events(created_at desc);
create index if not exists idx_audit_events_action_created_at on public.audit_events(action, created_at desc);
create index if not exists idx_audit_events_team_id_created_at on public.audit_events(team_id, created_at desc);
create index if not exists idx_audit_events_actor_user_id_created_at on public.audit_events(actor_user_id, created_at desc);
create index if not exists idx_ai_usage_team_id_created_at on public.ai_usage(team_id, created_at desc);
create index if not exists idx_ai_usage_user_id_created_at on public.ai_usage(user_id, created_at desc);
create index if not exists idx_ai_usage_model_created_at on public.ai_usage(model, created_at desc);
create index if not exists idx_ai_usage_monthly_totals_month_start on public.ai_usage_monthly_totals(month_start desc);
create index if not exists idx_ai_usage_budget_claims_team_month on public.ai_usage_budget_claims(team_id, month_start, created_at desc);
create index if not exists idx_ai_usage_budget_claims_finalized on public.ai_usage_budget_claims(finalized_at);
create index if not exists idx_seat_sync_retries_next_attempt_at on public.seat_sync_retries(next_attempt_at asc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists teams_set_updated_at on public.teams;
create trigger teams_set_updated_at
before update on public.teams
for each row execute function public.set_updated_at();

drop trigger if exists team_memberships_set_updated_at on public.team_memberships;
create trigger team_memberships_set_updated_at
before update on public.team_memberships
for each row execute function public.set_updated_at();

create or replace function public.repair_profile_active_team_on_membership_delete()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_fallback_team_id uuid;
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = old.user_id
      and p.active_team_id = old.team_id
  ) then
    return old;
  end if;

  select tm.team_id
  into v_fallback_team_id
  from public.team_memberships tm
  where tm.user_id = old.user_id
    and tm.team_id <> old.team_id
  order by tm.created_at asc
  limit 1;

  update public.profiles p
  set active_team_id = v_fallback_team_id
  where p.id = old.user_id
    and p.active_team_id = old.team_id;

  return old;
end;
$$;

drop trigger if exists team_memberships_repair_active_team_after_delete on public.team_memberships;
create trigger team_memberships_repair_active_team_after_delete
after delete on public.team_memberships
for each row execute function public.repair_profile_active_team_on_membership_delete();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.enforce_profile_active_team_membership()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.active_team_id is null then
    return new;
  end if;

  if exists (
    select 1
    from public.team_memberships tm
    where tm.team_id = new.active_team_id
      and tm.user_id = new.id
  ) then
    return new;
  end if;

  raise exception
    'profiles.active_team_id must reference a team the profile owner belongs to';
end;
$$;

drop trigger if exists profiles_enforce_active_team_membership on public.profiles;
create trigger profiles_enforce_active_team_membership
before insert or update of active_team_id, id on public.profiles
for each row execute function public.enforce_profile_active_team_membership();

drop trigger if exists stripe_customers_set_updated_at on public.stripe_customers;
create trigger stripe_customers_set_updated_at
before update on public.stripe_customers
for each row execute function public.set_updated_at();

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

drop trigger if exists team_invites_set_updated_at on public.team_invites;
create trigger team_invites_set_updated_at
before update on public.team_invites
for each row execute function public.set_updated_at();

drop trigger if exists rate_limit_windows_set_updated_at on public.rate_limit_windows;
create trigger rate_limit_windows_set_updated_at
before update on public.rate_limit_windows
for each row execute function public.set_updated_at();

drop trigger if exists ai_usage_monthly_totals_set_updated_at on public.ai_usage_monthly_totals;
create trigger ai_usage_monthly_totals_set_updated_at
before update on public.ai_usage_monthly_totals
for each row execute function public.set_updated_at();

drop trigger if exists seat_sync_retries_set_updated_at on public.seat_sync_retries;
create trigger seat_sync_retries_set_updated_at
before update on public.seat_sync_retries
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

create or replace function public.claim_ai_token_budget(
  p_team_id uuid,
  p_month_start timestamptz,
  p_token_budget integer,
  p_projected_tokens integer
)
returns table(allowed boolean, claim_id uuid, month_start date)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_month_start date := date_trunc('month', p_month_start at time zone 'utc')::date;
  v_reserved_tokens integer;
  v_used_tokens integer;
  v_claim_id uuid;
begin
  if p_token_budget <= 0 or p_projected_tokens <= 0 then
    return query select false, null::uuid, v_month_start;
    return;
  end if;

  insert into public.ai_usage_monthly_totals as totals (
    team_id,
    month_start,
    reserved_tokens,
    used_tokens,
    created_at,
    updated_at
  )
  values (p_team_id, v_month_start, 0, 0, v_now, v_now)
  on conflict (team_id, month_start) do nothing;

  select totals.reserved_tokens, totals.used_tokens
  into v_reserved_tokens, v_used_tokens
  from public.ai_usage_monthly_totals totals
  where totals.team_id = p_team_id
    and totals.month_start = v_month_start
  for update;

  if coalesce(v_reserved_tokens, 0) + coalesce(v_used_tokens, 0) + p_projected_tokens > p_token_budget then
    return query select false, null::uuid, v_month_start;
    return;
  end if;

  update public.ai_usage_monthly_totals totals
  set
    reserved_tokens = totals.reserved_tokens + p_projected_tokens,
    updated_at = v_now
  where totals.team_id = p_team_id
    and totals.month_start = v_month_start;

  insert into public.ai_usage_budget_claims (
    team_id,
    month_start,
    projected_tokens,
    created_at
  )
  values (p_team_id, v_month_start, p_projected_tokens, v_now)
  returning id into v_claim_id;

  return query select true, v_claim_id, v_month_start;
end;
$$;

revoke execute on function public.claim_ai_token_budget(uuid, timestamptz, integer, integer) from public;
revoke execute on function public.claim_ai_token_budget(uuid, timestamptz, integer, integer) from anon;
revoke execute on function public.claim_ai_token_budget(uuid, timestamptz, integer, integer) from authenticated;
grant execute on function public.claim_ai_token_budget(uuid, timestamptz, integer, integer) to service_role;

create or replace function public.finalize_ai_token_budget_claim(
  p_claim_id uuid,
  p_actual_tokens integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_team_id uuid;
  v_month_start date;
  v_projected_tokens integer;
begin
  if p_actual_tokens < 0 then
    raise exception 'p_actual_tokens must be non-negative';
  end if;

  select c.team_id, c.month_start, c.projected_tokens
  into v_team_id, v_month_start, v_projected_tokens
  from public.ai_usage_budget_claims c
  where c.id = p_claim_id
    and c.finalized_at is null
  for update;

  if v_team_id is null then
    return false;
  end if;

  update public.ai_usage_budget_claims c
  set
    actual_tokens = p_actual_tokens,
    finalized_at = v_now
  where c.id = p_claim_id
    and c.finalized_at is null;

  update public.ai_usage_monthly_totals totals
  set
    reserved_tokens = greatest(0, totals.reserved_tokens - v_projected_tokens),
    used_tokens = totals.used_tokens + p_actual_tokens,
    updated_at = v_now
  where totals.team_id = v_team_id
    and totals.month_start = v_month_start;

  return true;
end;
$$;

revoke execute on function public.finalize_ai_token_budget_claim(uuid, integer) from public;
revoke execute on function public.finalize_ai_token_budget_claim(uuid, integer) from anon;
revoke execute on function public.finalize_ai_token_budget_claim(uuid, integer) from authenticated;
grant execute on function public.finalize_ai_token_budget_claim(uuid, integer) to service_role;

create or replace function public.is_team_member(
  p_team_id uuid,
  p_allowed_roles text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_memberships tm
    where tm.team_id = p_team_id
      and tm.user_id = auth.uid()
      and (
        p_allowed_roles is null
        or tm.role = any(p_allowed_roles)
      )
  );
$$;

revoke execute on function public.is_team_member(uuid, text[]) from public;
revoke execute on function public.is_team_member(uuid, text[]) from anon;
grant execute on function public.is_team_member(uuid, text[]) to authenticated;
grant execute on function public.is_team_member(uuid, text[]) to service_role;

create or replace function public.sync_stripe_subscription_atomic(
  p_team_id uuid,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_stripe_price_id text,
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
  v_existing_event_created_at timestamptz;
  v_has_newer_live_subscription boolean := false;
  v_upserted_count integer := 0;
begin
  if p_seat_quantity <= 0 then
    raise exception 'Seat quantity must be greater than zero.';
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
    team_id = excluded.team_id,
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_price_id = excluded.stripe_price_id,
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

revoke execute on function public.sync_stripe_subscription_atomic(uuid, text, text, text, integer, text, timestamptz, timestamptz, timestamptz, boolean, timestamptz) from public;
revoke execute on function public.sync_stripe_subscription_atomic(uuid, text, text, text, integer, text, timestamptz, timestamptz, timestamptz, boolean, timestamptz) from anon;
revoke execute on function public.sync_stripe_subscription_atomic(uuid, text, text, text, integer, text, timestamptz, timestamptz, timestamptz, boolean, timestamptz) from authenticated;
grant execute on function public.sync_stripe_subscription_atomic(uuid, text, text, text, integer, text, timestamptz, timestamptz, timestamptz, boolean, timestamptz) to service_role;

create or replace function public.accept_team_invite_atomic(
  p_token_hash text,
  p_user_id uuid,
  p_user_email text
)
returns table(ok boolean, error_code text, team_id uuid, team_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.team_invites%rowtype;
  v_team_name text;
begin
  select ti.*
  into v_invite
  from public.team_invites ti
  where ti.token_hash = p_token_hash
  for update;

  if not found then
    return query select false, 'not_found', null::uuid, null::text;
    return;
  end if;

  if v_invite.accepted_at is not null then
    return query select false, 'already_accepted', null::uuid, null::text;
    return;
  end if;

  if v_invite.expires_at < timezone('utc', now()) then
    return query select false, 'expired', null::uuid, null::text;
    return;
  end if;

  if lower(trim(v_invite.email)) <> lower(trim(p_user_email)) then
    return query select false, 'email_mismatch', null::uuid, null::text;
    return;
  end if;

  insert into public.team_memberships (team_id, user_id, role)
  values (v_invite.team_id, p_user_id, v_invite.role)
  on conflict (team_id, user_id) do nothing;

  update public.team_invites
  set
    accepted_at = timezone('utc', now()),
    accepted_by = p_user_id
  where id = v_invite.id
    and accepted_at is null;

  update public.profiles
  set active_team_id = v_invite.team_id
  where id = p_user_id;

  select t.name into v_team_name
  from public.teams t
  where t.id = v_invite.team_id;

  return query select true, null::text, v_invite.team_id, v_team_name;
end;
$$;

revoke execute on function public.accept_team_invite_atomic(text, uuid, text) from public;
revoke execute on function public.accept_team_invite_atomic(text, uuid, text) from anon;
revoke execute on function public.accept_team_invite_atomic(text, uuid, text) from authenticated;
grant execute on function public.accept_team_invite_atomic(text, uuid, text) to service_role;

create or replace function public.recover_personal_team_if_missing(
  p_user_id uuid,
  p_email text,
  p_full_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_team_name_seed text;
begin
  select tm.team_id
  into v_team_id
  from public.team_memberships tm
  where tm.user_id = p_user_id
  order by tm.created_at asc
  limit 1;

  if v_team_id is not null then
    update public.profiles
    set active_team_id = v_team_id
    where id = p_user_id;
    return v_team_id;
  end if;

  v_team_name_seed := coalesce(
    nullif(trim(coalesce(p_full_name, '')), ''),
    nullif(split_part(coalesce(p_email, ''), '@', 1), ''),
    'My'
  );

  insert into public.teams (name, created_by)
  values (format('%s Team', v_team_name_seed), p_user_id)
  returning id into v_team_id;

  insert into public.team_memberships (team_id, user_id, role)
  values (v_team_id, p_user_id, 'owner');

  update public.profiles
  set active_team_id = v_team_id
  where id = p_user_id;

  if not found then
    insert into public.profiles (id, active_team_id)
    values (p_user_id, v_team_id)
    on conflict (id) do update
    set active_team_id = excluded.active_team_id;
  end if;

  return v_team_id;
end;
$$;

revoke execute on function public.recover_personal_team_if_missing(uuid, text, text) from public;
revoke execute on function public.recover_personal_team_if_missing(uuid, text, text) from anon;
revoke execute on function public.recover_personal_team_if_missing(uuid, text, text) from authenticated;
grant execute on function public.recover_personal_team_if_missing(uuid, text, text) to service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  v_team_name_seed text;
  v_team_id uuid;
begin
  v_team_name_seed := coalesce(
    v_full_name,
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'My'
  );

  insert into public.teams (name, created_by)
  values (format('%s Team', v_team_name_seed), new.id)
  returning id into v_team_id;

  insert into public.team_memberships (team_id, user_id, role)
  values (v_team_id, new.id, 'owner');

  insert into public.profiles (id, full_name, active_team_id)
  values (new.id, v_full_name, v_team_id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.teams enable row level security;
alter table public.team_memberships enable row level security;
alter table public.profiles enable row level security;
alter table public.stripe_customers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.team_invites enable row level security;
alter table public.stripe_webhook_events enable row level security;
alter table public.rate_limit_windows enable row level security;
alter table public.audit_events enable row level security;
alter table public.ai_usage enable row level security;
alter table public.ai_usage_monthly_totals enable row level security;
alter table public.ai_usage_budget_claims enable row level security;
alter table public.seat_sync_retries enable row level security;

alter table public.subscriptions
add column if not exists seat_quantity integer;

alter table public.stripe_webhook_events
add column if not exists claim_token text;

update public.subscriptions
set seat_quantity = 1
where seat_quantity is null or seat_quantity <= 0;

alter table public.subscriptions
alter column seat_quantity set default 1;

alter table public.subscriptions
alter column seat_quantity set not null;

alter table public.subscriptions
drop constraint if exists subscriptions_seat_quantity_check;

alter table public.subscriptions
add constraint subscriptions_seat_quantity_check
check (seat_quantity > 0);

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
with check (
  auth.uid() = id
  and (
    active_team_id is null
    or public.is_team_member(active_team_id)
  )
);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
on public.profiles
for insert
to authenticated
with check (
  auth.uid() = id
  and (
    active_team_id is null
    or public.is_team_member(active_team_id)
  )
);

drop policy if exists "Users can read own team" on public.teams;
create policy "Users can read own team"
on public.teams
for select
to authenticated
using (public.is_team_member(id));

drop policy if exists "Users can create teams" on public.teams;
create policy "Users can create teams"
on public.teams
for insert
to authenticated
with check (auth.uid() = created_by);

drop policy if exists "Owners/admins can update teams" on public.teams;
create policy "Owners/admins can update teams"
on public.teams
for update
to authenticated
using (public.is_team_member(id, array['owner', 'admin']))
with check (public.is_team_member(id, array['owner', 'admin']));

drop policy if exists "Users can read team memberships" on public.team_memberships;
create policy "Users can read team memberships"
on public.team_memberships
for select
to authenticated
using (
  auth.uid() = user_id
  or public.is_team_member(team_id)
);

drop policy if exists "Owners/admins can insert team memberships" on public.team_memberships;
drop policy if exists "Owners can insert team memberships" on public.team_memberships;
drop policy if exists "Admins can insert member-only team memberships" on public.team_memberships;
create policy "Owners can insert team memberships"
on public.team_memberships
for insert
to authenticated
with check (
  public.is_team_member(team_id, array['owner'])
);

create policy "Admins can insert member-only team memberships"
on public.team_memberships
for insert
to authenticated
with check (
  public.is_team_member(team_id, array['admin'])
  and role = 'member'
  and auth.uid() <> user_id
);

drop policy if exists "Owners/admins can update team memberships" on public.team_memberships;
drop policy if exists "Owners can update team memberships" on public.team_memberships;
drop policy if exists "Admins can update member-only team memberships" on public.team_memberships;
create policy "Owners can update team memberships"
on public.team_memberships
for update
to authenticated
using (
  public.is_team_member(team_id, array['owner'])
)
with check (
  public.is_team_member(team_id, array['owner'])
);

create policy "Admins can update member-only team memberships"
on public.team_memberships
for update
to authenticated
using (
  public.is_team_member(team_id, array['admin'])
  and role = 'member'
)
with check (
  public.is_team_member(team_id, array['admin'])
  and role = 'member'
);

drop policy if exists "Owners/admins can delete team memberships" on public.team_memberships;
drop policy if exists "Owners can delete team memberships" on public.team_memberships;
drop policy if exists "Admins can delete member-only team memberships" on public.team_memberships;
create policy "Owners can delete team memberships"
on public.team_memberships
for delete
to authenticated
using (
  public.is_team_member(team_id, array['owner'])
  and auth.uid() <> user_id
  and (
    role <> 'owner'
    or exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = team_memberships.team_id
        and tm.role = 'owner'
        and tm.user_id <> team_memberships.user_id
    )
  )
);

create policy "Admins can delete member-only team memberships"
on public.team_memberships
for delete
to authenticated
using (
  public.is_team_member(team_id, array['admin'])
  and auth.uid() <> user_id
  and role = 'member'
);

drop policy if exists "Users can read team stripe customer" on public.stripe_customers;
drop policy if exists "Users can read own stripe customer" on public.stripe_customers;
create policy "Users can read team stripe customer"
on public.stripe_customers
for select
to authenticated
using (public.is_team_member(team_id));

drop policy if exists "Users can insert own stripe customer" on public.stripe_customers;
drop policy if exists "Users can update own stripe customer" on public.stripe_customers;

drop policy if exists "Users can read team subscriptions" on public.subscriptions;
drop policy if exists "Users can read own subscriptions" on public.subscriptions;
create policy "Users can read team subscriptions"
on public.subscriptions
for select
to authenticated
using (public.is_team_member(team_id));

drop policy if exists "Users can read team invites" on public.team_invites;
create policy "Users can read team invites"
on public.team_invites
for select
to authenticated
using (public.is_team_member(team_id));

drop policy if exists "Owners/admins can insert team invites" on public.team_invites;
create policy "Owners/admins can insert team invites"
on public.team_invites
for insert
to authenticated
with check (public.is_team_member(team_id, array['owner', 'admin']));

drop policy if exists "Owners/admins can delete team invites" on public.team_invites;
create policy "Owners/admins can delete team invites"
on public.team_invites
for delete
to authenticated
using (public.is_team_member(team_id, array['owner', 'admin']));

drop policy if exists "Users can read audit events" on public.audit_events;
create policy "Users can read audit events"
on public.audit_events
for select
to authenticated
using (
  actor_user_id = auth.uid()
  or (
    team_id is not null
    and public.is_team_member(team_id, array['owner', 'admin'])
  )
);

drop policy if exists "Users can read team ai usage" on public.ai_usage;
create policy "Users can read team ai usage"
on public.ai_usage
for select
to authenticated
using (public.is_team_member(team_id));

-- Intentionally no INSERT/UPDATE/DELETE policies on billing + internal tables
-- (except team_invites where owners/admins can create/delete invites).
-- With RLS enabled, writes are denied by default unless explicitly allowed.
-- Billing writes are handled by server-only keys/RPC.
