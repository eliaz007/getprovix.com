-- Mark a candidate as Verified on Provix only when every required
-- Profile Studio field is filled (no null / blank / whitespace-only values).

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
    and coalesce(p.portfolio_url, '') ~* 'github\.com';
$$;

comment on function public.profile_is_verified_on_provix(public.profiles) is
  'True only when every required candidate Profile Studio field is non-empty, including a GitHub portfolio URL.';

create or replace function public.get_featured_builders(limit_count integer default 6)
returns json
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    json_agg(row_to_json(f) order by f.updated_at desc),
    '[]'::json
  )
  from (
    select
      p.id,
      p.profile_slug,
      p.full_name,
      p.name,
      p.first_name,
      p.last_name,
      p.job_title,
      p.headline,
      p.bio,
      coalesce(p.skills, '{}'::text[]) as skills,
      p.avatar_url,
      p.codename_alias,
      public.resolve_profile_integrity_score(
        p.integrity_score,
        p.audit_data
      ) as integrity_score,
      coalesce(nullif(trim(p.portfolio_url), ''), null) is not null as has_github_repos,
      p.portfolio_url,
      p.youtube_url,
      p.experience_level,
      p.availability_status,
      p.availability,
      p.university,
      p.school,
      p.major,
      p.degree,
      p.work_preference,
      p.timezone,
      p.role,
      p.is_visible_in_pool,
      p.updated_at
    from public.profiles p
    where coalesce(p.is_featured, false) = true
      and coalesce(p.is_visible_in_pool, false) = true
      and nullif(trim(p.profile_slug), '') is not null
      and public.profile_is_verified_on_provix(p)
    order by p.updated_at desc
    limit greatest(1, least(coalesce(limit_count, 6), 12))
  ) f;
$$;

comment on function public.get_featured_builders(integer) is
  'Public featured builder cards: is_featured + visible + complete verified Profile Studio fields.';

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
    'university', p.university,
    'major', p.major,
    'school', p.school,
    'degree', p.degree,
    'experience_level', p.experience_level,
    'country', p.country,
    'timezone', p.timezone,
    'work_preference', p.work_preference,
    'integrity_score', public.resolve_profile_integrity_score(
      p.integrity_score,
      p.audit_data
    ),
    'has_github_repos', coalesce(nullif(trim(p.portfolio_url), ''), null) is not null
  )
  from public.profiles p
  where lower(p.profile_slug) = lower(slug)
    and coalesce(p.is_visible_in_pool, false) = true
  limit 1;
$$;

grant execute on function public.get_featured_builders(integer) to anon, authenticated;
grant execute on function public.get_public_profile_by_slug(text) to anon, authenticated;
