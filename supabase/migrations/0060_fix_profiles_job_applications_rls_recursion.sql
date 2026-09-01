-- 0059 used language sql SECURITY DEFINER helpers. Postgres inlines those,
-- so current_employer_identity_ids() re-entered profiles RLS from inside
-- job_applications / jobs policies, and the applicant profiles policy
-- queried job_applications — infinite recursion on both tables.
--
-- Rewrite ownership checks as plpgsql (not inlined) with row_security off.
-- Policies compare auth.uid() or call those helpers; they must not subquery
-- the same table they protect.

drop policy if exists "Anyone can view active jobs or own listings" on public.jobs;
drop policy if exists "Authenticated users can view active or own jobs" on public.jobs;
create policy "Anyone can view active jobs or own listings"
  on public.jobs
  for select
  using (
    status = 'active'
    or employer_id = auth.uid()
  );

create or replace function public.employer_owns_job(p_job_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null or p_job_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.jobs j
    where j.id = p_job_id
      and j.employer_id = auth.uid()
  );
end;
$$;

revoke all on function public.employer_owns_job(uuid) from public;
grant execute on function public.employer_owns_job(uuid) to authenticated;

comment on function public.employer_owns_job(uuid) is
  'plpgsql SECURITY DEFINER so job_applications RLS can check jobs.employer_id = auth.uid() without jobs RLS or profiles recursion.';

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

drop policy if exists "Candidates can view their own job applications" on public.job_applications;
create policy "Candidates can view their own job applications"
  on public.job_applications
  for select
  to authenticated
  using (auth.uid() = candidate_id);

create or replace function public.employer_can_view_applicant_profile(
  p_profile_id uuid,
  p_profile_user_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null or p_profile_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.job_applications ja
    inner join public.jobs j on j.id = ja.job_id
    where j.employer_id = auth.uid()
      and (
        ja.candidate_id = p_profile_id
        or (
          p_profile_user_id is not null
          and ja.candidate_id = p_profile_user_id
        )
      )
  );
end;
$$;

revoke all on function public.employer_can_view_applicant_profile(uuid, uuid) from public;
grant execute on function public.employer_can_view_applicant_profile(uuid, uuid) to authenticated;

comment on function public.employer_can_view_applicant_profile(uuid, uuid) is
  'plpgsql SECURITY DEFINER with row_security off so profiles RLS never subqueries job_applications under RLS.';

drop policy if exists "Employers can view profiles of their job applicants" on public.profiles;
create policy "Employers can view profiles of their job applicants"
  on public.profiles
  for select
  to authenticated
  using (
    public.employer_can_view_applicant_profile(id, user_id)
  );

-- Own-row policies stay column compares only (no subqueries).
drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id or auth.uid() = user_id);

create or replace function public.is_admin_user()
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if coalesce(
    (auth.jwt() ->> 'email') in (
      'eliasdiangelo91@gmail.com',
      'comradeduck1@gmail.com'
    ),
    false
  ) then
    return true;
  end if;

  if coalesce((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin', false) then
    return true;
  end if;

  return exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  );
end;
$$;

drop function if exists public.current_employer_identity_ids();
