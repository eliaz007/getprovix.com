-- Developer contract / full-time availability preferences for Profile Studio.

alter table public.profiles
  add column if not exists open_to_fulltime boolean not null default false;

alter table public.profiles
  add column if not exists open_to_contract boolean not null default false;

alter table public.profiles
  add column if not exists contract_hours_per_week text null;

alter table public.profiles
  add column if not exists contract_hourly_rate integer null;

comment on column public.profiles.open_to_fulltime is
  'True when the candidate is open to full-time roles.';

comment on column public.profiles.open_to_contract is
  'True when the candidate is open to contract / freelance work.';

comment on column public.profiles.contract_hours_per_week is
  'Weekly contract bandwidth: < 10 hrs/week, 10-20 hrs/week, or 20-40 hrs/week.';

comment on column public.profiles.contract_hourly_rate is
  'Optional target contract hourly rate in USD.';

alter table public.profiles
  drop constraint if exists profiles_contract_hours_per_week_check;

alter table public.profiles
  add constraint profiles_contract_hours_per_week_check
  check (
    contract_hours_per_week is null
    or contract_hours_per_week in (
      '< 10 hrs/week',
      '10-20 hrs/week',
      '20-40 hrs/week'
    )
  );

alter table public.profiles
  drop constraint if exists profiles_contract_hourly_rate_check;

alter table public.profiles
  add constraint profiles_contract_hourly_rate_check
  check (
    contract_hourly_rate is null
    or contract_hourly_rate >= 0
  );

notify pgrst, 'reload schema';
