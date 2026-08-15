-- Optional fallback leads table if beta_leads is unavailable in an environment.

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  company_name text not null,
  email text not null,
  created_at timestamptz not null default now()
);

comment on table public.leads is 'Fallback lead capture table (company + email).';

create index if not exists leads_created_at_idx on public.leads (created_at desc);

alter table public.leads enable row level security;

drop policy if exists "Users can insert their own leads" on public.leads;
create policy "Users can insert their own leads"
  on public.leads
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can view their own leads" on public.leads;
create policy "Users can view their own leads"
  on public.leads
  for select
  using (auth.uid() = user_id);
