-- Beta lead capture for performance-based hiring early access.

create table if not exists public.beta_leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_name text not null,
  work_email text not null,
  created_at timestamptz not null default now()
);

comment on table public.beta_leads is 'Employer beta access signups (company + work email).';

create index if not exists beta_leads_user_id_idx on public.beta_leads (user_id);
create index if not exists beta_leads_created_at_idx on public.beta_leads (created_at desc);

alter table public.beta_leads enable row level security;

drop policy if exists "Users can insert their own beta leads" on public.beta_leads;
create policy "Users can insert their own beta leads"
  on public.beta_leads
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can view their own beta leads" on public.beta_leads;
create policy "Users can view their own beta leads"
  on public.beta_leads
  for select
  using (auth.uid() = user_id);
