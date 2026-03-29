-- AI Threads: persistent chat threads with message history

create table if not exists public.ai_threads (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.ai_thread_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.ai_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  parts jsonb not null default '[]'::jsonb,
  attachments jsonb,
  metadata jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_ai_threads_team_user on public.ai_threads(team_id, user_id, updated_at desc);
create index if not exists idx_ai_threads_updated_at on public.ai_threads(updated_at desc);
create index if not exists idx_ai_thread_messages_thread_id on public.ai_thread_messages(thread_id, created_at asc);

drop trigger if exists ai_threads_set_updated_at on public.ai_threads;
create trigger ai_threads_set_updated_at
before update on public.ai_threads
for each row execute function public.set_updated_at();
