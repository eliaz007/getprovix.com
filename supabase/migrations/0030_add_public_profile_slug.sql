-- Public shareable candidate profiles (/p/[username]).
-- is_visible_in_pool maps to "visible to employers" for public discovery.

alter table public.profiles
  add column if not exists profile_slug text;

comment on column public.profiles.profile_slug is
  'URL slug for public profile pages at /p/[profile_slug]. Requires is_visible_in_pool = true.';

create unique index if not exists profiles_profile_slug_unique_idx
  on public.profiles (lower(profile_slug))
  where profile_slug is not null;

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
    'timezone', p.timezone
  )
  from public.profiles p
  where lower(p.profile_slug) = lower(slug)
    and coalesce(p.is_visible_in_pool, false) = true
  limit 1;
$$;

grant execute on function public.get_public_profile_by_slug(text) to anon, authenticated;
