-- Adds the Khmer description field and a small table that limits AI usage.
-- Run once in Supabase: SQL Editor, New query, paste, Run.

alter table public.products
  add column if not exists description_km text check (char_length(description_km) <= 5000);

-- One row per AI description request, used to cap usage per seller per day.
create table if not exists public.ai_usage (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  feature    text not null default 'description',
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_user_idx on public.ai_usage(user_id, created_at desc);

alter table public.ai_usage enable row level security;

-- Sellers may see their own usage. Only the server-side function writes rows.
drop policy if exists "Users read their own AI usage" on public.ai_usage;
create policy "Users read their own AI usage" on public.ai_usage for select
  using (user_id = auth.uid() or public.is_admin());

grant select on public.ai_usage to authenticated;

select 'description_km and ai_usage are ready' as result;
