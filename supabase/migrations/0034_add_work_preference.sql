-- Candidate work preference + structured timezone slugs for public cards.

alter table public.profiles
  add column if not exists work_preference text default 'remote_global';

comment on column public.profiles.work_preference is
  'Candidate work arrangement preference slug (remote_global, remote_americas, remote_emea, hybrid_onsite).';

alter table public.profiles
  alter column timezone set default 'US_ET';

comment on column public.profiles.timezone is
  'Candidate timezone slug for public cards (US_ET, US_PT, LATAM, etc.).';

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
    'job_title', p.job_title,
    'bio', p.bio,
    'skills', coalesce(p.skills, '{}'::text[]),
    'portfolio_url', p.portfolio_url,
    'youtube_url', p.youtube_url,
    'codename_alias', p.codename_alias,
    'availability_status', p.availability_status,
    'university', p.university,
    'major', p.major,
    'school', p.school,
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
      p.job_title,
      p.bio,
      coalesce(p.skills, '{}'::text[]) as skills,
      p.avatar_url,
      p.codename_alias,
      public.resolve_profile_integrity_score(
        p.integrity_score,
        p.audit_data
      ) as integrity_score,
      coalesce(nullif(trim(p.portfolio_url), ''), null) is not null as has_github_repos,
      p.work_preference,
      p.timezone,
      p.updated_at
    from public.profiles p
    where coalesce(p.is_featured, false) = true
      and coalesce(p.is_visible_in_pool, false) = true
      and nullif(trim(p.profile_slug), '') is not null
      and nullif(trim(p.job_title), '') is not null
      and nullif(trim(p.bio), '') is not null
      and (
        nullif(trim(p.portfolio_url), '') is not null
        or nullif(trim(p.youtube_url), '') is not null
      )
    order by p.updated_at desc
    limit greatest(1, least(coalesce(limit_count, 6), 12))
  ) f;
$$;

grant execute on function public.get_public_profile_by_slug(text) to anon, authenticated;
grant execute on function public.get_featured_builders(integer) to anon, authenticated;
