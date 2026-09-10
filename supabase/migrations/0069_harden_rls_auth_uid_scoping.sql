-- =============================================================================
-- 0069: Harden RLS — auth.uid() ownership, revoke loose grants, FORCE RLS
--
-- Casting convention (matches schema):
--   * uuid columns (profiles.id/user_id, jobs.employer_id, *.created_by,
--     job_applications.candidate_id, notifications.user_id, intro_requests.user_id,
--     beta_leads/leads.user_id, talent_match_scores.employer_id,
--     external_projects.user_id, production_audit_history.user_id)
--       → compare as uuid: auth.uid() = <col>
--   * text identity columns (intro_requests.candidate_id,
--     talent_match_scores.candidate_id)
--       → compare as text: auth.uid()::text = <col>
--
-- Intentional public exceptions (kept):
--   * jobs SELECT where status = 'active' (anon job board)
--   * candidates SELECT USING (true) (marketing seed; client writes revoked)
--   * SECURITY DEFINER public-profile RPCs (no direct anon SELECT on profiles)
--
-- Defensive: every table section is gated with to_regclass(...).
-- Functions are defined at top level so DO blocks never nest dollar-quotes.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers (stable ownership predicates; never re-enter RLS)
-- ---------------------------------------------------------------------------

create or replace function public.is_admin_user()
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

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

  if to_regclass('public.profiles') is null then
    return false;
  end if;

  return exists (
    select 1
    from public.profiles
    where (profiles.id = auth.uid() or profiles.user_id = auth.uid())
      and profiles.role = 'admin'
  );
end;
$$;

revoke all on function public.is_admin_user() from public;
grant execute on function public.is_admin_user() to authenticated;

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

  if to_regclass('public.jobs') is null then
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

  if to_regclass('public.job_applications') is null
     or to_regclass('public.jobs') is null then
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

create or replace function public.handle_candidate_screening_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Candidates may only change status/dismissal fields on intro_requests.
-- intro_requests.user_id is uuid; intro_requests.candidate_id is text.
create or replace function public.guard_intro_request_candidate_update()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if public.is_admin_user() or auth.uid() = old.user_id then
    return new;
  end if;

  if auth.uid()::text = old.candidate_id then
    if new.user_id is distinct from old.user_id
       or new.candidate_id is distinct from old.candidate_id
       or new.company_name is distinct from old.company_name
       or new.work_email is distinct from old.work_email
       or new.company_email is distinct from old.company_email
       or new.role_title is distinct from old.role_title
       or new.target_role is distinct from old.target_role
       or new.compensation_band is distinct from old.compensation_band
       or new.compensation_range is distinct from old.compensation_range
       or new.response_token is distinct from old.response_token
       or new.tos_accepted_at is distinct from old.tos_accepted_at
       or new.terms_accepted is distinct from old.terms_accepted
    then
      raise exception 'Candidates may only update intro status / dismissal fields';
    end if;
    return new;
  end if;

  raise exception 'Not allowed to update intro_requests';
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) candidate_screenings
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.candidate_screenings') is null then
    if to_regclass('public.profiles') is null then
      create table public.candidate_screenings (
        id uuid primary key default gen_random_uuid(),
        candidate_key text not null,
        profile_id uuid,
        created_by uuid references auth.users (id) on delete cascade,
        integrity_score integer
          check (integrity_score is null or (integrity_score between 0 and 100)),
        audit_data jsonb not null default '{}'::jsonb,
        updated_at timestamptz not null default now()
      );
    else
      create table public.candidate_screenings (
        id uuid primary key default gen_random_uuid(),
        candidate_key text not null,
        profile_id uuid references public.profiles (id) on delete set null,
        created_by uuid references auth.users (id) on delete cascade,
        integrity_score integer
          check (integrity_score is null or (integrity_score between 0 and 100)),
        audit_data jsonb not null default '{}'::jsonb,
        updated_at timestamptz not null default now()
      );
    end if;

    comment on table public.candidate_screenings is
      'Cached deep screening audits keyed by profile id or seed candidate id.';

    create trigger set_candidate_screenings_updated_at
      before update on public.candidate_screenings
      for each row
      execute procedure public.handle_candidate_screening_updated_at();

    raise notice '0069: created public.candidate_screenings (0011 was not applied here)';
  end if;

  alter table public.candidate_screenings
    add column if not exists created_by uuid references auth.users (id) on delete cascade;

  comment on column public.candidate_screenings.created_by is
    'Employer (auth.uid) who ran and owns this cached screening. Required for client writes.';

  alter table public.candidate_screenings
    add column if not exists id uuid;

  update public.candidate_screenings
  set id = gen_random_uuid()
  where id is null;

  alter table public.candidate_screenings
    alter column id set default gen_random_uuid();

  alter table public.candidate_screenings
    alter column id set not null;

  if exists (
    select 1
    from information_schema.key_column_usage
    where table_schema = 'public'
      and table_name = 'candidate_screenings'
      and constraint_name = 'candidate_screenings_pkey'
      and column_name = 'candidate_key'
  ) and not exists (
    select 1
    from information_schema.key_column_usage
    where table_schema = 'public'
      and table_name = 'candidate_screenings'
      and constraint_name = 'candidate_screenings_pkey'
      and column_name = 'id'
  ) then
    alter table public.candidate_screenings drop constraint candidate_screenings_pkey;
    alter table public.candidate_screenings
      add constraint candidate_screenings_pkey primary key (id);
  elsif not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'candidate_screenings'
      and constraint_type = 'PRIMARY KEY'
  ) then
    alter table public.candidate_screenings
      add constraint candidate_screenings_pkey primary key (id);
  end if;

  execute 'drop index if exists public.candidate_screenings_created_by_key_uidx';
  execute
    'create unique index candidate_screenings_created_by_key_uidx '
    || 'on public.candidate_screenings (created_by, candidate_key) '
    || 'where created_by is not null';
  execute
    'create index if not exists candidate_screenings_created_by_idx '
    || 'on public.candidate_screenings (created_by)';

  alter table public.candidate_screenings enable row level security;
  alter table public.candidate_screenings force row level security;

  drop policy if exists "Authenticated users can read screenings" on public.candidate_screenings;
  drop policy if exists "Authenticated users can upsert screenings" on public.candidate_screenings;
  drop policy if exists "Employers can read their own screenings" on public.candidate_screenings;
  drop policy if exists "Employers can insert their own screenings" on public.candidate_screenings;
  drop policy if exists "Employers can update their own screenings" on public.candidate_screenings;
  drop policy if exists "Employers can delete their own screenings" on public.candidate_screenings;
  drop policy if exists "Admins can manage all screenings" on public.candidate_screenings;

  -- created_by is uuid
  create policy "Employers can read their own screenings"
    on public.candidate_screenings
    for select
    to authenticated
    using (auth.uid() = created_by or public.is_admin_user());

  create policy "Employers can insert their own screenings"
    on public.candidate_screenings
    for insert
    to authenticated
    with check (auth.uid() = created_by);

  create policy "Employers can update their own screenings"
    on public.candidate_screenings
    for update
    to authenticated
    using (auth.uid() = created_by)
    with check (auth.uid() = created_by);

  create policy "Employers can delete their own screenings"
    on public.candidate_screenings
    for delete
    to authenticated
    using (auth.uid() = created_by);

  revoke all on table public.candidate_screenings from anon;
  revoke all on table public.candidate_screenings from authenticated;
  grant select, insert, update, delete on table public.candidate_screenings to authenticated;
  grant all on table public.candidate_screenings to service_role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) candidates (seed marketing) — public READ only; no client writes
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.candidates') is null then
    raise notice '0069: skip candidates — relation does not exist';
    return;
  end if;

  alter table public.candidates enable row level security;
  alter table public.candidates force row level security;

  drop policy if exists "Anyone can read seed candidates" on public.candidates;
  create policy "Anyone can read seed candidates"
    on public.candidates
    for select
    to anon, authenticated
    using (true);

  revoke insert, update, delete, truncate on table public.candidates from anon, authenticated;
  grant select on table public.candidates to anon, authenticated;
  grant all on table public.candidates to service_role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) profiles — own-row writes; scoped employer SELECTs; no anon table access
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.profiles') is null then
    raise notice '0069: skip profiles — relation does not exist';
    return;
  end if;

  alter table public.profiles enable row level security;
  alter table public.profiles force row level security;

  alter table public.profiles
    add column if not exists user_id uuid;

  update public.profiles
  set user_id = id
  where user_id is null;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_user_id_fkey'
  ) then
    begin
      alter table public.profiles
        add constraint profiles_user_id_fkey
        foreign key (user_id) references auth.users (id) on delete cascade;
    exception
      when others then
        raise notice 'profiles_user_id_fkey skipped: %', sqlerrm;
    end;
  end if;

  execute
    'create unique index if not exists profiles_user_id_uidx '
    || 'on public.profiles (user_id) where user_id is not null';

  drop policy if exists "Users can view their own profile" on public.profiles;
  drop policy if exists "Users can insert their own profile" on public.profiles;
  drop policy if exists "Users can update their own profile" on public.profiles;
  drop policy if exists "Users can delete their own profile" on public.profiles;
  drop policy if exists "Employers can view visible talent pool profiles" on public.profiles;
  drop policy if exists "Employers can view profiles of their job applicants" on public.profiles;

  -- profiles.id and profiles.user_id are uuid
  create policy "Users can view their own profile"
    on public.profiles
    for select
    to authenticated
    using (auth.uid() = id or auth.uid() = user_id);

  create policy "Employers can view visible talent pool profiles"
    on public.profiles
    for select
    to authenticated
    using (
      coalesce(is_visible_in_pool, false) = true
      and public.current_user_is_verified_employer()
    );

  create policy "Employers can view profiles of their job applicants"
    on public.profiles
    for select
    to authenticated
    using (public.employer_can_view_applicant_profile(id, user_id));

  create policy "Users can insert their own profile"
    on public.profiles
    for insert
    to authenticated
    with check (auth.uid() = id or auth.uid() = user_id);

  create policy "Users can update their own profile"
    on public.profiles
    for update
    to authenticated
    using (auth.uid() = id or auth.uid() = user_id)
    with check (auth.uid() = id or auth.uid() = user_id);

  create policy "Users can delete their own profile"
    on public.profiles
    for delete
    to authenticated
    using (auth.uid() = id or auth.uid() = user_id);

  revoke all on table public.profiles from anon;
  revoke all on table public.profiles from authenticated;
  grant select, insert, update, delete on table public.profiles to authenticated;
  grant all on table public.profiles to service_role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) jobs — intentional public SELECT of active listings; writes = employer
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.jobs') is null then
    raise notice '0069: skip jobs — relation does not exist';
    return;
  end if;

  alter table public.jobs enable row level security;
  alter table public.jobs force row level security;

  drop policy if exists "Anyone can view active jobs or own listings" on public.jobs;
  drop policy if exists "Authenticated users can view active or own jobs" on public.jobs;
  drop policy if exists "Anyone authenticated can view jobs" on public.jobs;
  drop policy if exists "Employers can insert their own jobs" on public.jobs;
  drop policy if exists "Verified employers can insert their own jobs" on public.jobs;
  drop policy if exists "Employers can update their own jobs" on public.jobs;
  drop policy if exists "Employers can delete their own jobs" on public.jobs;

  -- jobs.employer_id is uuid
  create policy "Anyone can view active jobs or own listings"
    on public.jobs
    for select
    to anon, authenticated
    using (
      status = 'active'
      or (auth.uid() is not null and employer_id = auth.uid())
    );

  create policy "Verified employers can insert their own jobs"
    on public.jobs
    for insert
    to authenticated
    with check (
      auth.uid() = employer_id
      and public.current_user_is_verified_employer()
    );

  create policy "Employers can update their own jobs"
    on public.jobs
    for update
    to authenticated
    using (auth.uid() = employer_id)
    with check (auth.uid() = employer_id);

  create policy "Employers can delete their own jobs"
    on public.jobs
    for delete
    to authenticated
    using (auth.uid() = employer_id);

  revoke all on table public.jobs from anon;
  revoke all on table public.jobs from authenticated;
  grant select on table public.jobs to anon, authenticated;
  grant insert, update, delete on table public.jobs to authenticated;
  grant all on table public.jobs to service_role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) job_applications
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.job_applications') is null then
    raise notice '0069: skip job_applications — relation does not exist';
    return;
  end if;

  alter table public.job_applications enable row level security;
  alter table public.job_applications force row level security;

  drop policy if exists "Candidates can view their own job applications" on public.job_applications;
  drop policy if exists "Candidates can submit their own job applications" on public.job_applications;
  drop policy if exists "Candidates can delete their own job applications" on public.job_applications;
  drop policy if exists "Employers can view applications for their jobs" on public.job_applications;
  drop policy if exists "Employers can unlock applications for their jobs" on public.job_applications;
  drop policy if exists "Admins can view all job applications" on public.job_applications;

  -- job_applications.candidate_id is uuid
  create policy "Candidates can view their own job applications"
    on public.job_applications
    for select
    to authenticated
    using (auth.uid() = candidate_id or public.is_admin_user());

  create policy "Candidates can submit their own job applications"
    on public.job_applications
    for insert
    to authenticated
    with check (auth.uid() = candidate_id);

  create policy "Employers can view applications for their jobs"
    on public.job_applications
    for select
    to authenticated
    using (public.employer_owns_job(job_id) or public.is_admin_user());

  create policy "Employers can unlock applications for their jobs"
    on public.job_applications
    for update
    to authenticated
    using (public.employer_owns_job(job_id))
    with check (public.employer_owns_job(job_id));

  create policy "Candidates can delete their own job applications"
    on public.job_applications
    for delete
    to authenticated
    using (auth.uid() = candidate_id);

  revoke all on table public.job_applications from anon;
  revoke all on table public.job_applications from authenticated;
  grant select, insert, update, delete on table public.job_applications to authenticated;
  grant all on table public.job_applications to service_role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) notifications
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.notifications') is null then
    raise notice '0069: skip notifications — relation does not exist';
    return;
  end if;

  alter table public.notifications enable row level security;
  alter table public.notifications force row level security;

  drop policy if exists "Users can view their own notifications" on public.notifications;
  drop policy if exists "Users can update their own notifications" on public.notifications;
  drop policy if exists "Users can delete their own notifications" on public.notifications;
  drop policy if exists "Applicants can notify job owners" on public.notifications;

  -- notifications.user_id is uuid
  create policy "Users can view their own notifications"
    on public.notifications
    for select
    to authenticated
    using (auth.uid() = user_id);

  create policy "Users can update their own notifications"
    on public.notifications
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

  create policy "Users can delete their own notifications"
    on public.notifications
    for delete
    to authenticated
    using (auth.uid() = user_id);

  create policy "Applicants can notify job owners"
    on public.notifications
    for insert
    to authenticated
    with check (
      auth.uid() is not null
      and auth.uid() is distinct from user_id
      and exists (
        select 1
        from public.job_applications ja
        inner join public.jobs j on j.id = ja.job_id
        where ja.candidate_id = auth.uid()
          and j.id = notifications.job_id
          and j.employer_id = notifications.user_id
      )
    );

  revoke all on table public.notifications from anon;
  revoke all on table public.notifications from authenticated;
  grant select, insert, update, delete on table public.notifications to authenticated;
  grant all on table public.notifications to service_role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) intro_requests
--    user_id uuid; candidate_id text
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.intro_requests') is null then
    raise notice '0069: skip intro_requests — relation does not exist';
    return;
  end if;

  alter table public.intro_requests enable row level security;
  alter table public.intro_requests force row level security;

  drop policy if exists "Users can insert their own intro requests" on public.intro_requests;
  drop policy if exists "Users can view their own intro requests" on public.intro_requests;
  drop policy if exists "Candidates can view intro requests for them" on public.intro_requests;
  drop policy if exists "Candidates can update their intro request status" on public.intro_requests;
  drop policy if exists "Admins can view all intro requests" on public.intro_requests;
  drop policy if exists "Admins can update all intro requests" on public.intro_requests;
  drop policy if exists "Employers can update their own intro requests" on public.intro_requests;

  create policy "Users can insert their own intro requests"
    on public.intro_requests
    for insert
    to authenticated
    with check (auth.uid() = user_id);

  create policy "Users can view their own intro requests"
    on public.intro_requests
    for select
    to authenticated
    using (auth.uid() = user_id or public.is_admin_user());

  create policy "Candidates can view intro requests for them"
    on public.intro_requests
    for select
    to authenticated
    using (auth.uid()::text = candidate_id);

  create policy "Candidates can update their intro request status"
    on public.intro_requests
    for update
    to authenticated
    using (auth.uid()::text = candidate_id)
    with check (auth.uid()::text = candidate_id);

  create policy "Employers can update their own intro requests"
    on public.intro_requests
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

  create policy "Admins can update all intro requests"
    on public.intro_requests
    for update
    to authenticated
    using (public.is_admin_user())
    with check (public.is_admin_user());

  drop trigger if exists intro_requests_guard_candidate_update on public.intro_requests;
  create trigger intro_requests_guard_candidate_update
    before update on public.intro_requests
    for each row
    execute procedure public.guard_intro_request_candidate_update();

  revoke all on table public.intro_requests from anon;
  revoke all on table public.intro_requests from authenticated;
  grant select, insert, update on table public.intro_requests to authenticated;
  grant all on table public.intro_requests to service_role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) beta_leads / leads
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.beta_leads') is null then
    raise notice '0069: skip beta_leads — relation does not exist';
  else
    alter table public.beta_leads enable row level security;
    alter table public.beta_leads force row level security;

    drop policy if exists "Users can insert their own beta leads" on public.beta_leads;
    drop policy if exists "Users can view their own beta leads" on public.beta_leads;

    -- beta_leads.user_id is uuid
    create policy "Users can insert their own beta leads"
      on public.beta_leads
      for insert
      to authenticated
      with check (auth.uid() = user_id);

    create policy "Users can view their own beta leads"
      on public.beta_leads
      for select
      to authenticated
      using (auth.uid() = user_id or public.is_admin_user());

    revoke all on table public.beta_leads from anon;
    revoke all on table public.beta_leads from authenticated;
    grant select, insert on table public.beta_leads to authenticated;
    grant all on table public.beta_leads to service_role;
  end if;

  if to_regclass('public.leads') is null then
    raise notice '0069: skip leads — relation does not exist';
  else
    alter table public.leads enable row level security;
    alter table public.leads force row level security;

    drop policy if exists "Users can insert their own leads" on public.leads;
    drop policy if exists "Users can view their own leads" on public.leads;

    -- leads.user_id is uuid
    create policy "Users can insert their own leads"
      on public.leads
      for insert
      to authenticated
      with check (auth.uid() = user_id and user_id is not null);

    create policy "Users can view their own leads"
      on public.leads
      for select
      to authenticated
      using (auth.uid() = user_id or public.is_admin_user());

    revoke all on table public.leads from anon;
    revoke all on table public.leads from authenticated;
    grant select, insert on table public.leads to authenticated;
    grant all on table public.leads to service_role;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9) talent_match_scores
--    employer_id uuid; candidate_id text (policies only use employer_id)
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.talent_match_scores') is null then
    raise notice '0069: skip talent_match_scores — relation does not exist';
    return;
  end if;

  alter table public.talent_match_scores enable row level security;
  alter table public.talent_match_scores force row level security;

  drop policy if exists "Employers can view their talent match scores" on public.talent_match_scores;
  drop policy if exists "Employers can insert their talent match scores" on public.talent_match_scores;
  drop policy if exists "Employers can update their talent match scores" on public.talent_match_scores;
  drop policy if exists "Employers can delete their talent match scores" on public.talent_match_scores;

  create policy "Employers can view their talent match scores"
    on public.talent_match_scores
    for select
    to authenticated
    using (auth.uid() = employer_id);

  create policy "Employers can insert their talent match scores"
    on public.talent_match_scores
    for insert
    to authenticated
    with check (auth.uid() = employer_id);

  create policy "Employers can update their talent match scores"
    on public.talent_match_scores
    for update
    to authenticated
    using (auth.uid() = employer_id)
    with check (auth.uid() = employer_id);

  create policy "Employers can delete their talent match scores"
    on public.talent_match_scores
    for delete
    to authenticated
    using (auth.uid() = employer_id);

  revoke all on table public.talent_match_scores from anon;
  revoke all on table public.talent_match_scores from authenticated;
  grant select, insert, update, delete on table public.talent_match_scores to authenticated;
  grant all on table public.talent_match_scores to service_role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10) external_projects
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.external_projects') is null then
    raise notice '0069: skip external_projects — relation does not exist';
    return;
  end if;

  alter table public.external_projects enable row level security;
  alter table public.external_projects force row level security;

  drop policy if exists "Authenticated users can manage their own external projects"
    on public.external_projects;

  -- external_projects.user_id is uuid
  create policy "Authenticated users can manage their own external projects"
    on public.external_projects
    for all
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

  revoke all on table public.external_projects from anon;
  revoke all on table public.external_projects from authenticated;
  grant select, insert, update, delete on table public.external_projects to authenticated;
  grant all on table public.external_projects to service_role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11) production_audit_history — append-only
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.production_audit_history') is null then
    raise notice '0069: skip production_audit_history — relation does not exist';
    return;
  end if;

  alter table public.production_audit_history enable row level security;
  alter table public.production_audit_history force row level security;

  drop policy if exists "Candidates can read their own production audit history"
    on public.production_audit_history;
  drop policy if exists "Candidates can insert their own production audit history"
    on public.production_audit_history;

  -- production_audit_history.user_id is uuid
  create policy "Candidates can read their own production audit history"
    on public.production_audit_history
    for select
    to authenticated
    using (auth.uid() = user_id);

  create policy "Candidates can insert their own production audit history"
    on public.production_audit_history
    for insert
    to authenticated
    with check (auth.uid() = user_id);

  revoke all on table public.production_audit_history from anon;
  revoke all on table public.production_audit_history from authenticated;
  grant select, insert on table public.production_audit_history to authenticated;
  grant all on table public.production_audit_history to service_role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12) employer_email_verifications — service_role only
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.employer_email_verifications') is null then
    raise notice '0069: skip employer_email_verifications — relation does not exist';
    return;
  end if;

  alter table public.employer_email_verifications enable row level security;
  alter table public.employer_email_verifications force row level security;

  revoke all on table public.employer_email_verifications from anon, authenticated;
  grant all on table public.employer_email_verifications to service_role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 13) Check constraints
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.profiles') is null then
    raise notice '0069: skip profiles integrity check — relation does not exist';
  elsif not exists (
    select 1 from pg_constraint where conname = 'profiles_integrity_score_range'
  ) then
    begin
      alter table public.profiles
        add constraint profiles_integrity_score_range
        check (integrity_score is null or (integrity_score between 0 and 100));
    exception
      when check_violation then
        raise notice 'profiles integrity_score check skipped due to existing data';
      when duplicate_object then
        null;
    end;
  end if;

  if to_regclass('public.candidate_screenings') is null then
    raise notice '0069: skip candidate_screenings integrity check — relation does not exist';
  elsif not exists (
    select 1 from pg_constraint where conname = 'candidate_screenings_integrity_score_range'
  ) then
    begin
      alter table public.candidate_screenings
        add constraint candidate_screenings_integrity_score_range
        check (integrity_score is null or (integrity_score between 0 and 100));
    exception
      when others then
        raise notice 'candidate_screenings integrity check: %', sqlerrm;
    end;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 14) Revoke anon execute on employer helpers
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'current_employer_identity_ids'
  ) then
    execute 'revoke all on function public.current_employer_identity_ids() from public, anon';
  end if;
exception
  when undefined_function then
    null;
end;
$$;

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'current_user_is_employer'
  ) then
    execute 'revoke all on function public.current_user_is_employer() from public, anon';
    execute 'grant execute on function public.current_user_is_employer() to authenticated';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'current_user_is_verified_employer'
  ) then
    execute 'revoke all on function public.current_user_is_verified_employer() from public, anon';
    execute 'grant execute on function public.current_user_is_verified_employer() to authenticated';
  end if;
end;
$$;

notify pgrst, 'reload schema';
