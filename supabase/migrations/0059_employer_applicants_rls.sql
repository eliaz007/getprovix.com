-- Employer applicants were empty because job_applications SELECT RLS
-- subqueries public.jobs, which is itself RLS-protected. That inner check
-- misses rows when employer_id is a profile id (not auth.uid()) or when
-- the listing is paused. Resolve ownership with a SECURITY DEFINER helper
-- that bypasses jobs RLS and matches auth uid + profile link ids.
--
-- Also keep notify_employer_of_job_interest from rolling back the
-- job_applications insert when notifications.title is missing/null.

create or replace function public.current_employer_identity_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(
    array_agg(distinct identity_id),
    '{}'::uuid[]
  )
  from (
    select auth.uid() as identity_id
    where auth.uid() is not null
    union
    select p.id
    from public.profiles p
    where auth.uid() is not null
      and (p.id = auth.uid() or p.user_id = auth.uid())
    union
    select p.user_id
    from public.profiles p
    where auth.uid() is not null
      and p.user_id is not null
      and (p.id = auth.uid() or p.user_id = auth.uid())
  ) identities
  where identity_id is not null;
$$;

revoke all on function public.current_employer_identity_ids() from public;
grant execute on function public.current_employer_identity_ids() to authenticated, anon;

comment on function public.current_employer_identity_ids() is
  'Auth uid plus linked profile ids for the signed-in employer. Bypasses profiles RLS.';

create or replace function public.employer_owns_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.jobs j
    where j.id = p_job_id
      and j.employer_id = any (public.current_employer_identity_ids())
  );
$$;

revoke all on function public.employer_owns_job(uuid) from public;
grant execute on function public.employer_owns_job(uuid) to authenticated;

comment on function public.employer_owns_job(uuid) is
  'True when the signed-in user owns the job via auth uid or linked profile id. Bypasses jobs RLS.';

drop policy if exists "Employers can view applications for their jobs" on public.job_applications;
create policy "Employers can view applications for their jobs"
  on public.job_applications
  for select
  to authenticated
  using (public.employer_owns_job(job_id));

drop policy if exists "Employers can unlock applications for their jobs" on public.job_applications;
create policy "Employers can unlock applications for their jobs"
  on public.job_applications
  for update
  to authenticated
  using (public.employer_owns_job(job_id))
  with check (public.employer_owns_job(job_id));

drop policy if exists "Employers can view profiles of their job applicants" on public.profiles;
create policy "Employers can view profiles of their job applicants"
  on public.profiles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.job_applications ja
      where public.employer_owns_job(ja.job_id)
        and (
          ja.candidate_id = profiles.id
          or ja.candidate_id = profiles.user_id
        )
    )
  );

drop policy if exists "Anyone can view active jobs or own listings" on public.jobs;
drop policy if exists "Authenticated users can view active or own jobs" on public.jobs;
create policy "Anyone can view active jobs or own listings"
  on public.jobs
  for select
  using (
    status = 'active'
    or employer_id = auth.uid()
    or employer_id = any (public.current_employer_identity_ids())
  );

grant select, insert, update on table public.job_applications to authenticated;
grant select on table public.jobs to authenticated, anon;

alter table public.notifications
  add column if not exists title text;

update public.notifications
set title = 'New Candidate Interest'
where title is null or btrim(title) = '';

alter table public.notifications
  alter column title set default 'New Candidate Interest';

alter table public.notifications
  alter column title set not null;

create or replace function public.notify_employer_of_job_interest()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  listing_title text;
  employer uuid;
begin
  select j.title, j.employer_id
    into listing_title, employer
  from public.jobs j
  where j.id = new.job_id;

  if employer is null or employer = new.candidate_id then
    return new;
  end if;

  begin
    insert into public.notifications (user_id, job_id, title, message, is_read)
    values (
      employer,
      new.job_id,
      'New Candidate Interest',
      format(
        'A candidate expressed interest in your role: %s',
        coalesce(nullif(trim(listing_title), ''), 'Open Role')
      ),
      false
    );
  exception
    when others then
      raise warning 'notify_employer_of_job_interest failed: %', sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists job_applications_notify_employer on public.job_applications;
create trigger job_applications_notify_employer
  after insert on public.job_applications
  for each row
  execute procedure public.notify_employer_of_job_interest();
