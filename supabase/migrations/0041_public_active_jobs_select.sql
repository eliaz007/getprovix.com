-- Allow unauthenticated visitors to browse active job listings.
-- Employers can still view their own paused listings when signed in.

drop policy if exists "Authenticated users can view active or own jobs" on public.jobs;

create policy "Anyone can view active jobs or own listings"
  on public.jobs
  for select
  using (
    status = 'active'
    or employer_id = auth.uid()
  );
