-- Allow employers to read anonymized profile fields for candidates who expressed interest in their jobs.

drop policy if exists "Employers can view profiles of their job applicants" on public.profiles;
create policy "Employers can view profiles of their job applicants"
  on public.profiles
  for select
  using (
    exists (
      select 1
      from public.job_applications ja
      inner join public.jobs j on j.id = ja.job_id
      where ja.candidate_id = profiles.id
        and j.employer_id = auth.uid()
    )
  );
