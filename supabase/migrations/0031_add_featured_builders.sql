-- Featured Builders Showcase on the landing page.
-- visible_to_employers is represented by is_visible_in_pool.

alter table public.profiles
  add column if not exists is_featured boolean not null default false;

comment on column public.profiles.is_featured is
  'When true, profile may appear in the landing page Featured Builders Showcase. Requires is_visible_in_pool (visible to employers).';

create index if not exists profiles_featured_visible_idx
  on public.profiles (updated_at desc)
  where is_featured = true and is_visible_in_pool = true;

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
      p.integrity_score,
      p.updated_at
    from public.profiles p
    where coalesce(p.is_featured, false) = true
      and coalesce(p.is_visible_in_pool, false) = true
    order by p.updated_at desc
    limit greatest(1, least(coalesce(limit_count, 6), 12))
  ) f;
$$;

comment on function public.get_featured_builders(integer) is
  'Public-safe featured builder cards for the landing page (is_featured + is_visible_in_pool).';

grant execute on function public.get_featured_builders(integer) to anon, authenticated;
