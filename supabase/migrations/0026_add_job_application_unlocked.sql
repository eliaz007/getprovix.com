-- Stripe unlock flag for employer access to candidate contact on a job application.

alter table public.job_applications
  add column if not exists unlocked boolean not null default false;

comment on column public.job_applications.unlocked is 'True after employer pays to unlock candidate contact for this application.';

drop policy if exists "Employers can unlock applications for their jobs" on public.job_applications;
create policy "Employers can unlock applications for their jobs"
  on public.job_applications
  for update
  using (
    exists (
      select 1
      from public.jobs
      where jobs.id = job_applications.job_id
        and jobs.employer_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.jobs
      where jobs.id = job_applications.job_id
        and jobs.employer_id = auth.uid()
    )
  );
