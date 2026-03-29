-- AI Threads RLS hardening: enforce per-user ownership at the database layer

alter table public.ai_threads enable row level security;
alter table public.ai_thread_messages enable row level security;

drop policy if exists "Users can read own ai threads" on public.ai_threads;
create policy "Users can read own ai threads"
on public.ai_threads
for select
to authenticated
using (auth.uid() = user_id and public.is_team_member(team_id));

drop policy if exists "Users can insert own ai threads" on public.ai_threads;
create policy "Users can insert own ai threads"
on public.ai_threads
for insert
to authenticated
with check (auth.uid() = user_id and public.is_team_member(team_id));

drop policy if exists "Users can update own ai threads" on public.ai_threads;
create policy "Users can update own ai threads"
on public.ai_threads
for update
to authenticated
using (auth.uid() = user_id and public.is_team_member(team_id))
with check (auth.uid() = user_id and public.is_team_member(team_id));

drop policy if exists "Users can delete own ai threads" on public.ai_threads;
create policy "Users can delete own ai threads"
on public.ai_threads
for delete
to authenticated
using (auth.uid() = user_id and public.is_team_member(team_id));

drop policy if exists "Users can read own ai thread messages" on public.ai_thread_messages;
create policy "Users can read own ai thread messages"
on public.ai_thread_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.ai_threads threads
    where threads.id = ai_thread_messages.thread_id
      and threads.user_id = auth.uid()
      and public.is_team_member(threads.team_id)
  )
);

drop policy if exists "Users can insert own ai thread messages" on public.ai_thread_messages;
create policy "Users can insert own ai thread messages"
on public.ai_thread_messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.ai_threads threads
    where threads.id = ai_thread_messages.thread_id
      and threads.user_id = auth.uid()
      and public.is_team_member(threads.team_id)
  )
);

drop policy if exists "Users can update own ai thread messages" on public.ai_thread_messages;
create policy "Users can update own ai thread messages"
on public.ai_thread_messages
for update
to authenticated
using (
  exists (
    select 1
    from public.ai_threads threads
    where threads.id = ai_thread_messages.thread_id
      and threads.user_id = auth.uid()
      and public.is_team_member(threads.team_id)
  )
)
with check (
  exists (
    select 1
    from public.ai_threads threads
    where threads.id = ai_thread_messages.thread_id
      and threads.user_id = auth.uid()
      and public.is_team_member(threads.team_id)
  )
);

drop policy if exists "Users can delete own ai thread messages" on public.ai_thread_messages;
create policy "Users can delete own ai thread messages"
on public.ai_thread_messages
for delete
to authenticated
using (
  exists (
    select 1
    from public.ai_threads threads
    where threads.id = ai_thread_messages.thread_id
      and threads.user_id = auth.uid()
      and public.is_team_member(threads.team_id)
  )
);
