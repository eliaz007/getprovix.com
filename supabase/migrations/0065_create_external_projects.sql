-- Manual project portfolio artifacts for candidates whose GitHub work is
-- private, enterprise-only, or otherwise not publicly auditable.

create table if not exists public.external_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_title text,
  project_url text,
  description text,
  created_at timestamptz not null default now()
);

comment on table public.external_projects is
  'Candidate-submitted project artifacts (live/docs URLs and technical breakdowns) used when a public GitHub repository is unavailable.';

create index if not exists external_projects_user_id_idx
  on public.external_projects (user_id);

create index if not exists external_projects_created_at_idx
  on public.external_projects (created_at desc);

alter table public.external_projects enable row level security;

drop policy if exists "Authenticated users can manage their own external projects"
  on public.external_projects;
create policy "Authenticated users can manage their own external projects"
  on public.external_projects
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on table public.external_projects to authenticated;
grant all on table public.external_projects to service_role;

create or replace function public.profile_has_successful_external_projects_audit(
  p public.profiles
)
returns boolean
language sql
stable
as $$
  select
    public.resolve_profile_integrity_score(p.integrity_score, p.audit_data) is not null
    and (
      lower(coalesce(p.audit_data #>> '{source}', '')) in (
        'external_projects_audit',
        'external_projects',
        'hybrid_artifact_audit'
      )
      or (
        jsonb_typeof(p.audit_data -> 'external_projects') = 'array'
        and jsonb_array_length(p.audit_data -> 'external_projects') > 0
      )
    )
    and exists (
      select 1
      from public.external_projects ep
      where ep.user_id = p.id
        and nullif(trim(coalesce(ep.project_title, '')), '') is not null
        and (
          nullif(trim(coalesce(ep.project_url, '')), '') is not null
          or nullif(trim(coalesce(ep.description, '')), '') is not null
        )
    );
$$;

comment on function public.profile_has_successful_external_projects_audit(public.profiles) is
  'True when an integrity audit scored submitted external_projects artifacts.';

create or replace function public.profile_is_verified_on_provix(p public.profiles)
returns boolean
language sql
stable
as $$
  select
    (
      nullif(trim(coalesce(p.full_name, '')), '') is not null
      or nullif(trim(coalesce(p.name, '')), '') is not null
      or nullif(trim(coalesce(p.first_name, '')), '') is not null
      or nullif(trim(coalesce(p.last_name, '')), '') is not null
    )
    and (
      nullif(trim(coalesce(p.job_title, '')), '') is not null
      or nullif(trim(coalesce(p.headline, '')), '') is not null
    )
    and nullif(trim(coalesce(p.bio, '')), '') is not null
    and exists (
      select 1
      from unnest(coalesce(p.skills, '{}'::text[])) as skill
      where nullif(trim(skill), '') is not null
    )
    and nullif(trim(coalesce(p.experience_level, '')), '') is not null
    and (
      nullif(trim(coalesce(p.university, '')), '') is not null
      or nullif(trim(coalesce(p.school, '')), '') is not null
    )
    and (
      nullif(trim(coalesce(p.major, '')), '') is not null
      or nullif(trim(coalesce(p.degree, '')), '') is not null
    )
    and (
      nullif(trim(coalesce(p.availability_status, '')), '') is not null
      or nullif(trim(coalesce(p.availability, '')), '') is not null
    )
    and nullif(trim(coalesce(p.work_preference, '')), '') is not null
    and nullif(trim(coalesce(p.timezone, '')), '') is not null
    and (
      coalesce(p.portfolio_url, '') ~* 'github\.com'
      or exists (
        select 1
        from public.external_projects ep
        where ep.user_id = p.id
          and nullif(trim(coalesce(ep.project_title, '')), '') is not null
          and (
            nullif(trim(coalesce(ep.project_url, '')), '') is not null
            or nullif(trim(coalesce(ep.description, '')), '') is not null
          )
      )
    )
    and (
      public.profile_has_successful_github_integrity_audit(p)
      or public.profile_has_successful_external_projects_audit(p)
    );
$$;

comment on function public.profile_is_verified_on_provix(public.profiles) is
  'True when required Profile Studio fields are filled and a GitHub or external-project integrity audit has succeeded.';

grant execute on function public.profile_has_successful_external_projects_audit(public.profiles)
  to anon, authenticated, service_role;
grant execute on function public.profile_is_verified_on_provix(public.profiles)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
