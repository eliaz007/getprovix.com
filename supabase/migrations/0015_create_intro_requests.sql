-- Warm introduction requests from employers to talent pool candidates.

create table if not exists public.intro_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  employer_company text not null,
  employer_email text not null,
  candidate_id text not null,
  role_title text not null,
  comp_band text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined', 'completed')),
  created_at timestamptz not null default now()
);

comment on table public.intro_requests is 'Employer warm introduction requests for talent pool candidates.';

create index if not exists intro_requests_user_id_idx on public.intro_requests (user_id);
create index if not exists intro_requests_candidate_id_idx on public.intro_requests (candidate_id);
create index if not exists intro_requests_created_at_idx on public.intro_requests (created_at desc);

alter table public.intro_requests enable row level security;

drop policy if exists "Users can insert their own intro requests" on public.intro_requests;
create policy "Users can insert their own intro requests"
  on public.intro_requests
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can view their own intro requests" on public.intro_requests;
create policy "Users can view their own intro requests"
  on public.intro_requests
  for select
  using (auth.uid() = user_id);
