-- Expose integrity score + github lock flags on public profile/showcase RPCs.
-- Ensures screening columns exist (defined in 0011; may be missing on remote DBs).

alter table public.profiles
  add column if not exists integrity_score integer
    check (integrity_score is null or (integrity_score between 1 and 100)),
  add column if not exists audit_data jsonb;

comment on column public.profiles.integrity_score is
  'Latest AI integrity score from deep screening (1-100).';

comment on column public.profiles.audit_data is
  'Full JSON payload from the latest deep screening audit.';

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

comment on function public.resolve_profile_integrity_score(integer, jsonb) is
  'Prefer profiles.integrity_score; fall back to audit_data.integrity_score when present.';

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
      p.updated_at
    from public.profiles p
    where coalesce(p.is_featured, false) = true
      and coalesce(p.is_visible_in_pool, false) = true
    order by p.updated_at desc
    limit greatest(1, least(coalesce(limit_count, 6), 12))
  ) f;
$$;

grant execute on function public.resolve_profile_integrity_score(integer, jsonb) to anon, authenticated;
grant execute on function public.get_public_profile_by_slug(text) to anon, authenticated;
grant execute on function public.get_featured_builders(integer) to anon, authenticated;
