-- Cap candidate core specializations at 3 so Profile Studio and matching
-- stay focused. Empty arrays remain valid for incomplete profiles.

update public.profiles
set skills = coalesce(
  (
    select array_agg(limited.skill)
    from (
      select trim(t.skill) as skill
      from unnest(coalesce(skills, '{}'::text[])) with ordinality as t(skill, ord)
      where trim(t.skill) <> ''
      order by t.ord
      limit 3
    ) limited
  ),
  '{}'::text[]
)
where cardinality(coalesce(skills, '{}'::text[])) > 3;

alter table public.profiles
  drop constraint if exists profiles_skills_core_specializations_check;

alter table public.profiles
  add constraint profiles_skills_core_specializations_check
  check (
    skills is null
    or cardinality(skills) <= 3
  );

comment on column public.profiles.skills is
  'Up to 3 core specializations for matching and profile display.';
