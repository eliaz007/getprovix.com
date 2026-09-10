-- Scorecard publication: 75+ audits can be shown to employers.
-- Private diagnostics stay on the candidate dashboard only.

alter table public.profiles
  add column if not exists is_publicly_visible boolean not null default false;

comment on column public.profiles.is_publicly_visible is
  'When true, the candidate production scorecard is shown to employers. Requires a 75+ production_score. Defaults to false (private diagnostic).';

update public.profiles
set is_publicly_visible = false
where is_publicly_visible is null;

notify pgrst, 'reload schema';
