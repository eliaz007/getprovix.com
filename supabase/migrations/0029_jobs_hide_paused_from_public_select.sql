-- Hide paused (deactivated) job listings from other authenticated users.
-- Employers can still see and manage their own paused listings.

drop policy if exists "Anyone authenticated can view jobs" on public.jobs;

create policy "Authenticated users can view active or own jobs"
  on public.jobs
  for select
  using (
    auth.uid() is not null
    and (status = 'active' or employer_id = auth.uid())
  );
