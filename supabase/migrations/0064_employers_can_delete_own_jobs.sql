-- Let employers delete job listings they own.

drop policy if exists "Employers can delete their own jobs" on public.jobs;
create policy "Employers can delete their own jobs"
  on public.jobs
  for delete
  to authenticated
  using (auth.uid() = employer_id);
