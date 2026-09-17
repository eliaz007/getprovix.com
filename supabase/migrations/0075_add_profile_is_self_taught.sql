-- Optional self-taught flag for candidates who skip formal education entries.

alter table public.profiles
  add column if not exists is_self_taught boolean not null default false;

comment on column public.profiles.is_self_taught is
  'True when the candidate identifies as a self-taught / non-traditional engineer.';

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
    'education', coalesce(p.education, '[]'::jsonb),
    'is_self_taught', coalesce(p.is_self_taught, false),
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

notify pgrst, 'reload schema';
