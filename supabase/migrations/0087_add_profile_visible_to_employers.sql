-- Alias column still written by onboarding / dashboard / production-audit.
-- Canonical talent-pool flag remains is_visible_in_pool; keep them aligned.

alter table public.profiles
  add column if not exists visible_to_employers boolean not null default false;

comment on column public.profiles.visible_to_employers is
  'Employer-facing visibility alias written by the app. Prefer is_visible_in_pool as the source of truth; this column is kept for PostgREST writes that still send visible_to_employers.';

-- Backfill from the existing opt-in talent-pool flag.
update public.profiles
set visible_to_employers = coalesce(is_visible_in_pool, false)
where visible_to_employers is distinct from coalesce(is_visible_in_pool, false);

notify pgrst, 'reload schema';
