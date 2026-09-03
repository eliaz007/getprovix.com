-- Verified on Provix also requires a successful GitHub integrity audit
-- (persisted integrity_score plus fetched repository artifacts when present).

create or replace function public.profile_has_successful_github_integrity_audit(
  p public.profiles
)
returns boolean
language sql
stable
as $$
  select
    public.resolve_profile_integrity_score(p.integrity_score, p.audit_data) is not null
    and (
      p.audit_data is null
      or p.audit_data -> 'github_audit' is null
      or jsonb_typeof(p.audit_data -> 'github_audit') = 'null'
      or nullif(trim(coalesce(p.audit_data #>> '{github_audit,owner}', '')), '') is not null
      or nullif(trim(coalesce(p.audit_data #>> '{github_audit,repo}', '')), '') is not null
      or coalesce(
           case
             when (p.audit_data #>> '{github_audit,commit_count_sampled}') ~ '^[0-9]+$'
             then (p.audit_data #>> '{github_audit,commit_count_sampled}')::integer
             else 0
           end,
           0
         ) > 0
      or nullif(trim(coalesce(p.audit_data #>> '{github_audit,readme_excerpt}', '')), '') is not null
    );
$$;

comment on function public.profile_has_successful_github_integrity_audit(public.profiles) is
  'True when a GitHub integrity audit produced a score and, if present, fetched repo artifacts.';

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
    and coalesce(p.portfolio_url, '') ~* 'github\.com'
    and public.profile_has_successful_github_integrity_audit(p);
$$;

comment on function public.profile_is_verified_on_provix(public.profiles) is
  'True when every required Profile Studio field is filled and a GitHub integrity audit has succeeded.';

create or replace function public.get_public_profile_by_slug(slug text)
returns json
language sql
security definer
set search_path = public
stable
as $$
  select json_build_object(
    'id', p.id,
    'profile_slug', p.profile_slug,
    'full_name', p.full_name,
    'name', p.name,
    'first_name', p.first_name,
    'last_name', p.last_name,
    'job_title', p.job_title,
    'headline', p.headline,
    'bio', p.bio,
    'skills', coalesce(p.skills, '{}'::text[]),
    'portfolio_url', p.portfolio_url,
    'youtube_url', p.youtube_url,
    'codename_alias', p.codename_alias,
    'availability_status', p.availability_status,
    'availability', p.availability,
    'university', coalesce(nullif(trim(p.university), ''), p.school),
    'major', coalesce(nullif(trim(p.major), ''), p.degree),
    'school', coalesce(nullif(trim(p.school), ''), p.university),
    'degree', coalesce(nullif(trim(p.degree), ''), p.major),
    'gpa', p.gpa,
    'graduation_year', p.graduation_year,
    'experience_level', p.experience_level,
    'country', p.country,
    'timezone', p.timezone,
    'work_preference', p.work_preference,
    'integrity_score', public.resolve_profile_integrity_score(
      p.integrity_score,
      p.audit_data
    ),
    'has_github_repos', coalesce(nullif(trim(p.portfolio_url), ''), null) is not null,
    'is_verified_on_provix', public.profile_is_verified_on_provix(p)
  )
  from public.profiles p
  where lower(p.profile_slug) = lower(get_public_profile_by_slug.slug)
    and coalesce(p.is_visible_in_pool, false) = true
  limit 1;
$$;

grant execute on function public.profile_has_successful_github_integrity_audit(public.profiles)
  to anon, authenticated, service_role;
grant execute on function public.profile_is_verified_on_provix(public.profiles)
  to anon, authenticated, service_role;
grant execute on function public.get_public_profile_by_slug(text)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
