-- Only return published, proof-backed featured builder profiles.

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

comment on function public.get_featured_builders(integer) is
  'Public featured builder cards: is_featured + is_visible_in_pool + profile_slug + proof-of-work + bio/job title.';

grant execute on function public.get_featured_builders(integer) to anon, authenticated;
