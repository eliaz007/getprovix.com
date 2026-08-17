-- Job postings and candidate interest submissions.

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  company text,
  location text,
  salary_range text,
  tags text[] not null default '{}',
  employer_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'paused')),
  created_at timestamptz not null default now()
);

comment on table public.jobs is 'Employer job postings visible on the candidate opportunities feed.';

create index if not exists jobs_employer_id_idx on public.jobs (employer_id);
create index if not exists jobs_created_at_idx on public.jobs (created_at desc);

alter table public.jobs enable row level security;

drop policy if exists "Anyone authenticated can view jobs" on public.jobs;
create policy "Anyone authenticated can view jobs"
  on public.jobs
  for select
  using (auth.uid() is not null);

drop policy if exists "Employers can insert their own jobs" on public.jobs;
create policy "Employers can insert their own jobs"
  on public.jobs
  for insert
  with check (auth.uid() = employer_id);

drop policy if exists "Employers can update their own jobs" on public.jobs;
create policy "Employers can update their own jobs"
  on public.jobs
  for update
  using (auth.uid() = employer_id)
  with check (auth.uid() = employer_id);

create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  candidate_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (job_id, candidate_id)
);

comment on table public.job_applications is 'Candidate interest submissions for employer job postings.';

create index if not exists job_applications_job_id_idx on public.job_applications (job_id);
create index if not exists job_applications_candidate_id_idx on public.job_applications (candidate_id);
create index if not exists job_applications_created_at_idx on public.job_applications (created_at desc);

alter table public.job_applications enable row level security;

drop policy if exists "Candidates can view their own job applications" on public.job_applications;
create policy "Candidates can view their own job applications"
  on public.job_applications
  for select
  using (auth.uid() = candidate_id);

drop policy if exists "Candidates can submit their own job applications" on public.job_applications;
create policy "Candidates can submit their own job applications"
  on public.job_applications
  for insert
  with check (auth.uid() = candidate_id);

drop policy if exists "Employers can view applications for their jobs" on public.job_applications;
create policy "Employers can view applications for their jobs"
  on public.job_applications
  for select
  using (
    exists (
      select 1
      from public.jobs
      where jobs.id = job_applications.job_id
        and jobs.employer_id = auth.uid()
    )
  );

drop policy if exists "Admins can view all job applications" on public.job_applications;
create policy "Admins can view all job applications"
  on public.job_applications
  for select
  using (public.is_admin_user());
