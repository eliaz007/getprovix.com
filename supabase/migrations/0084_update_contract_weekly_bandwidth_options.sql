-- Capped Weekly Retainer bandwidth options for contractor availability.

-- Migrate legacy bandwidth labels to the new retainer tiers.
update public.profiles
set contract_hours_per_week = case contract_hours_per_week
  when '< 10 hrs/week' then '10 hrs/week (Fractional / Nights & Weekends)'
  when '10-20 hrs/week' then '20 hrs/week (Part-Time Core Sprint)'
  when '20-40 hrs/week' then '30+ hrs/week (Dedicated Fractional)'
  else contract_hours_per_week
end
where contract_hours_per_week in (
  '< 10 hrs/week',
  '10-20 hrs/week',
  '20-40 hrs/week'
);

alter table public.profiles
  drop constraint if exists profiles_contract_hours_per_week_check;

alter table public.profiles
  add constraint profiles_contract_hours_per_week_check
  check (
    contract_hours_per_week is null
    or contract_hours_per_week in (
      '10 hrs/week (Fractional / Nights & Weekends)',
      '20 hrs/week (Part-Time Core Sprint)',
      '30+ hrs/week (Dedicated Fractional)'
    )
  );

comment on column public.profiles.contract_hours_per_week is
  'Weekly contract bandwidth for capped retainer: 10, 20, or 30+ hrs/week.';

comment on column public.profiles.contract_hourly_rate is
  'Contractor take-home net hourly payout in USD. Founders see rate * 1.25.';

notify pgrst, 'reload schema';
