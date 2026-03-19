-- Add durable retry queue for Stripe seat synchronization failures.

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

create index if not exists idx_seat_sync_retries_next_attempt_at
on public.seat_sync_retries(next_attempt_at asc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists seat_sync_retries_set_updated_at on public.seat_sync_retries;
create trigger seat_sync_retries_set_updated_at
before update on public.seat_sync_retries
for each row execute function public.set_updated_at();

alter table public.seat_sync_retries enable row level security;
