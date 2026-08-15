-- Persist AI-generated employer ↔ candidate match scores for the talent pool.

create table if not exists public.talent_match_scores (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references auth.users (id) on delete cascade,
  candidate_id text not null,
  job_id uuid,
  match_percentage integer not null check (match_percentage between 0 and 100),
  reasoning text,
  matching_skills text[] default '{}',
  missing_skills text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employer_id, candidate_id, job_id)
);

create index if not exists talent_match_scores_employer_job_idx
  on public.talent_match_scores (employer_id, job_id);

alter table public.talent_match_scores enable row level security;

drop policy if exists "Employers can view their talent match scores"
  on public.talent_match_scores;
create policy "Employers can view their talent match scores"
  on public.talent_match_scores
  for select
  using (auth.uid() = employer_id);

drop policy if exists "Employers can insert their talent match scores"
  on public.talent_match_scores;
create policy "Employers can insert their talent match scores"
  on public.talent_match_scores
  for insert
  with check (auth.uid() = employer_id);

drop policy if exists "Employers can update their talent match scores"
  on public.talent_match_scores;
create policy "Employers can update their talent match scores"
  on public.talent_match_scores
  for update
  using (auth.uid() = employer_id)
  with check (auth.uid() = employer_id);
