-- AI usage totals access + zero-budget sync/backfill

create or replace function public.record_ai_usage_tokens(
  p_team_id uuid,
  p_month_start timestamptz,
  p_actual_tokens integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_month_start date := date_trunc('month', p_month_start at time zone 'utc')::date;
begin
  if p_actual_tokens < 0 then
    raise exception 'p_actual_tokens must be non-negative';
  end if;

  insert into public.ai_usage_monthly_totals as totals (
    team_id,
    month_start,
    reserved_tokens,
    used_tokens,
    created_at,
    updated_at
  )
  values (p_team_id, v_month_start, 0, p_actual_tokens, v_now, v_now)
  on conflict (team_id, month_start) do update
  set
    used_tokens = totals.used_tokens + p_actual_tokens,
    updated_at = v_now;

  return true;
end;
$$;

revoke execute on function public.record_ai_usage_tokens(uuid, timestamptz, integer) from public;
revoke execute on function public.record_ai_usage_tokens(uuid, timestamptz, integer) from anon;
revoke execute on function public.record_ai_usage_tokens(uuid, timestamptz, integer) from authenticated;
grant execute on function public.record_ai_usage_tokens(uuid, timestamptz, integer) to service_role;

drop policy if exists "Users can read team ai usage monthly totals" on public.ai_usage_monthly_totals;
create policy "Users can read team ai usage monthly totals"
on public.ai_usage_monthly_totals
for select
to authenticated
using (public.is_team_member(team_id));

insert into public.ai_usage_monthly_totals as totals (
  team_id,
  month_start,
  reserved_tokens,
  used_tokens,
  created_at,
  updated_at
)
select
  usage.team_id,
  date_trunc('month', usage.created_at at time zone 'utc')::date as month_start,
  0 as reserved_tokens,
  sum(usage.prompt_tokens + usage.completion_tokens)::integer as used_tokens,
  timezone('utc', now()) as created_at,
  timezone('utc', now()) as updated_at
from public.ai_usage usage
group by usage.team_id, date_trunc('month', usage.created_at at time zone 'utc')::date
on conflict (team_id, month_start) do update
set
  used_tokens = greatest(totals.used_tokens, excluded.used_tokens),
  updated_at = excluded.updated_at;
