-- Migrate legacy single-user billing schema to team-based schema.
-- Run this ONCE on an existing project that already has data.
-- After this script succeeds, apply supabase/schema.sql.

begin;

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

alter table public.profiles
add column if not exists active_team_id uuid references public.teams(id) on delete set null;

alter table public.stripe_customers
add column if not exists team_id uuid references public.teams(id) on delete cascade;

alter table public.subscriptions
add column if not exists team_id uuid references public.teams(id) on delete cascade;

alter table public.subscriptions
add column if not exists seat_quantity integer;

-- Create one default team for any user without a membership.
insert into public.teams (name, created_by)
select
  format(
    '%s Team',
    coalesce(
      nullif(trim(p.full_name), ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      'My'
    )
  ) as name,
  p.id as created_by
from public.profiles p
left join auth.users u on u.id = p.id
where not exists (
  select 1
  from public.team_memberships tm
  where tm.user_id = p.id
);

-- Ensure each profile owner is at least owner of one team they created.
insert into public.team_memberships (team_id, user_id, role)
select
  t.id,
  t.created_by as user_id,
  'owner' as role
from public.teams t
where t.created_by is not null
  and not exists (
    select 1
    from public.team_memberships tm
    where tm.team_id = t.id
      and tm.user_id = t.created_by
  );

-- Backfill profiles.active_team_id from first available membership.
update public.profiles p
set active_team_id = chosen.team_id
from (
  select distinct on (tm.user_id)
    tm.user_id,
    tm.team_id
  from public.team_memberships tm
  order by tm.user_id, (tm.role = 'owner') desc, tm.created_at asc, tm.id asc
) as chosen
where p.id = chosen.user_id
  and p.active_team_id is null;

-- Backfill stripe_customers.team_id (prefer profile active team).
update public.stripe_customers sc
set team_id = p.active_team_id
from public.profiles p
where p.id = sc.user_id
  and sc.team_id is null
  and p.active_team_id is not null;

-- Backfill subscriptions.team_id from profiles first.
update public.subscriptions s
set team_id = p.active_team_id
from public.profiles p
where p.id = s.user_id
  and s.team_id is null
  and p.active_team_id is not null;

-- Fallback: assign subscription team via stripe customer mapping.
update public.subscriptions s
set team_id = sc.team_id
from public.stripe_customers sc
where s.team_id is null
  and s.stripe_customer_id = sc.stripe_customer_id
  and sc.team_id is not null;

-- Fail fast if any rows are still unmapped.
do $$
begin
  if exists (select 1 from public.profiles where active_team_id is null) then
    raise exception 'Migration failed: profiles.active_team_id still has NULL rows';
  end if;

  if exists (select 1 from public.stripe_customers where team_id is null) then
    raise exception 'Migration failed: stripe_customers.team_id still has NULL rows';
  end if;

  if exists (select 1 from public.subscriptions where team_id is null) then
    raise exception 'Migration failed: subscriptions.team_id still has NULL rows';
  end if;
end $$;

update public.subscriptions
set seat_quantity = 1
where seat_quantity is null;

alter table public.profiles
alter column active_team_id set not null;

alter table public.stripe_customers
alter column team_id set not null;

alter table public.subscriptions
alter column team_id set not null;

alter table public.subscriptions
alter column seat_quantity set default 1;

alter table public.subscriptions
alter column seat_quantity set not null;

alter table public.subscriptions
drop constraint if exists subscriptions_seat_quantity_check;

alter table public.subscriptions
add constraint subscriptions_seat_quantity_check
check (seat_quantity >= 0);

create index if not exists idx_profiles_active_team_id on public.profiles(active_team_id);
create index if not exists idx_team_memberships_team_id on public.team_memberships(team_id);
create index if not exists idx_team_memberships_user_id on public.team_memberships(user_id);
create index if not exists idx_team_invites_team_id on public.team_invites(team_id);
drop index if exists ux_team_invites_one_pending_per_email_per_team;
create unique index if not exists ux_team_invites_one_pending_per_email_per_team_ci
on public.team_invites(team_id, lower(email))
where accepted_at is null;
create unique index if not exists idx_stripe_customers_team_id_unique on public.stripe_customers(team_id);
create index if not exists idx_subscriptions_team_id on public.subscriptions(team_id);
create index if not exists idx_subscriptions_team_id_status on public.subscriptions(team_id, status);

create or replace function public.prevent_last_team_owner_membership_delete()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_remaining_owner_count integer := 0;
begin
  if old.role <> 'owner' then
    return old;
  end if;

  if not exists (
    select 1
    from public.teams t
    where t.id = old.team_id
    for update
  ) then
    return old;
  end if;

  select count(*)
  into v_remaining_owner_count
  from public.team_memberships tm
  where tm.team_id = old.team_id
    and tm.role = 'owner'
    and tm.user_id <> old.user_id;

  if v_remaining_owner_count <= 0 then
    raise exception 'Cannot delete the last team owner.'
      using errcode = 'P0010';
  end if;

  return old;
end;
$$;

drop trigger if exists team_memberships_prevent_last_owner_delete on public.team_memberships;
create trigger team_memberships_prevent_last_owner_delete
before delete on public.team_memberships
for each row execute function public.prevent_last_team_owner_membership_delete();

commit;
