-- Employment type for opportunities feed Full-Time / Contract filtering.

alter table public.jobs
  add column if not exists employment_type text not null default 'full-time';

comment on column public.jobs.employment_type is
  'Job engagement type for candidate filtering: full-time or contract.';

alter table public.jobs
  drop constraint if exists jobs_employment_type_check;

alter table public.jobs
  add constraint jobs_employment_type_check
  check (employment_type in ('full-time', 'contract'));

notify pgrst, 'reload schema';
