-- Ensure education/credential columns exist, are granted, and are returned by
-- public profile RPC. Also keep talent-pool SELECT from re-entering profiles RLS.

alter table public.profiles
  add column if not exists university text,
  add column if not exists school text,
  add column if not exists major text,
  add column if not exists degree text,
  add column if not exists gpa text,
  add column if not exists graduation_year integer,
  add column if not exists user_id uuid;

update public.profiles
set university = school
where nullif(trim(coalesce(university, '')), '') is null
  and nullif(trim(coalesce(school, '')), '') is not null;

update public.profiles
set school = university
where nullif(trim(coalesce(school, '')), '') is null
  and nullif(trim(coalesce(university, '')), '') is not null;

update public.profiles
set degree = major
where nullif(trim(coalesce(degree, '')), '') is null
  and nullif(trim(coalesce(major, '')), '') is not null;

update public.profiles
set major = degree
where nullif(trim(coalesce(major, '')), '') is null
  and nullif(trim(coalesce(degree, '')), '') is not null;

update public.profiles
set user_id = id
where user_id is null;

-- Do not GRANT column-level SELECT to anon. Public reads go through
-- get_public_profile_by_slug (SECURITY DEFINER). A narrow column grant
-- makes PostgREST hide the rest of profiles from the API schema cache.
grant select, insert, update on table public.profiles to authenticated;

create or replace function public.current_user_is_employer()
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  jwt_role text;
begin
  jwt_role := lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'role', ''));
  if jwt_role in ('employer', 'business') then
    return true;
  end if;

  return exists (
    select 1
    from public.profiles
    where (id = auth.uid() or user_id = auth.uid())
      and lower(coalesce(role, '')) in ('employer', 'business')
  );
end;
$$;

revoke all on function public.current_user_is_employer() from public;
grant execute on function public.current_user_is_employer() to authenticated;

drop policy if exists "Employers can view visible talent pool profiles" on public.profiles;
create policy "Employers can view visible talent pool profiles"
  on public.profiles
  for select
  to authenticated
  using (
    coalesce(is_visible_in_pool, false) = true
    and (
      lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'role', ''))
        in ('employer', 'business')
      or public.current_user_is_employer()
    )
  );

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
    'has_github_repos', coalesce(nullif(trim(p.portfolio_url), ''), null) is not null
  )
  from public.profiles p
  where lower(p.profile_slug) = lower(slug)
    and coalesce(p.is_visible_in_pool, false) = true
  limit 1;
$$;

grant execute on function public.get_public_profile_by_slug(text) to anon, authenticated;

notify pgrst, 'reload schema';
