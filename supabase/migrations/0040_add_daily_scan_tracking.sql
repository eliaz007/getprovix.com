-- Track per-user AI auditor scan usage so the API can enforce a daily cap.

alter table public.profiles
  add column if not exists daily_scans integer,
  add column if not exists last_scan_date date;

update public.profiles
set daily_scans = 0
where daily_scans is null;

alter table public.profiles
  alter column daily_scans set default 0,
  alter column daily_scans set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_daily_scans_nonnegative'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_daily_scans_nonnegative
      check (daily_scans >= 0);
  end if;
end $$;

comment on column public.profiles.daily_scans is
  'Number of AI auditor scans consumed on last_scan_date (resets when the UTC date changes).';
comment on column public.profiles.last_scan_date is
  'UTC calendar date of the most recent successful AI auditor scan.';
