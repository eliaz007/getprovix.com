-- Contract sprint fields for job postings (weekly bandwidth + hourly rate range).

alter table public.jobs
  add column if not exists contract_hours_per_week text null;

alter table public.jobs
  add column if not exists hourly_rate_range text null;

comment on column public.jobs.contract_hours_per_week is
  'Weekly capped retainer bandwidth for contract jobs: 10, 20, or 30+ hrs/week.';

comment on column public.jobs.hourly_rate_range is
  'Target hourly rate range for contract jobs (e.g. $80 - $120 / hr).';

alter table public.jobs
  drop constraint if exists jobs_contract_hours_per_week_check;

alter table public.jobs
  add constraint jobs_contract_hours_per_week_check
  check (
    contract_hours_per_week is null
    or contract_hours_per_week in (
      '10 hrs/week (Fractional / Nights & Weekends)',
      '20 hrs/week (Part-Time Core Sprint)',
      '30+ hrs/week (Dedicated Fractional)'
    )
  );

notify pgrst, 'reload schema';
