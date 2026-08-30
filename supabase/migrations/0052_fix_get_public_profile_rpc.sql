-- Align get_public_profile_by_slug with the Next.js client:
--   supabase.rpc("get_public_profile_by_slug", { slug })
-- 0051 used CREATE OR REPLACE, which cannot drop extra overloads and left
-- PostgREST serving a different argument name. It also GRANTed anon SELECT
-- on a subset of profiles columns, so the service-role fallback select of
-- full profile fields failed with PGRST204.

alter table public.profiles
  add column if not exists university text,
  add column if not exists school text,
  add column if not exists major text,
  add column if not exists degree text,
  add column if not exists gpa text,
  add column if not exists graduation_year integer,
  add column if not exists user_id uuid,
  add column if not exists integrity_score integer,
  add column if not exists audit_data jsonb;

do $$
begin
  revoke select (
    id,
    user_id,
    university,
    school,
    major,
    degree,
    gpa,
    graduation_year
  ) on table public.profiles from anon;
exception
  when others then
    raise notice 'skip revoke anon education column grants: %', sqlerrm;
end;
$$;

grant select, insert, update on table public.profiles to authenticated;

create or replace function public.resolve_profile_integrity_score(
  profile_integrity_score integer,
  profile_audit_data jsonb
)
returns integer
language sql
immutable
as $$
  select coalesce(
    profile_integrity_score,
    case
      when profile_audit_data is not null
        and (profile_audit_data ->> 'integrity_score') ~ '^[0-9]+$'
      then least(
        100,
        greatest(1, (profile_audit_data ->> 'integrity_score')::integer)
      )
      else null
    end
  );
$$;

grant execute on function public.resolve_profile_integrity_score(integer, jsonb)
  to anon, authenticated, service_role;

do $$
declare
  rec record;
begin
  for rec in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_public_profile_by_slug'
  loop
    execute format('drop function if exists %s', rec.sig);
  end loop;
end;
$$;

-- Argument name MUST be `slug` — supabase-js sends { slug }.
create function public.get_public_profile_by_slug(slug text)
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
  where lower(p.profile_slug) = lower(get_public_profile_by_slug.slug)
    and coalesce(p.is_visible_in_pool, false) = true
  limit 1;
$$;

comment on function public.get_public_profile_by_slug(text) is
  'Public /p/[username] lookup. PostgREST argument name is slug.';

grant execute on function public.get_public_profile_by_slug(text)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
