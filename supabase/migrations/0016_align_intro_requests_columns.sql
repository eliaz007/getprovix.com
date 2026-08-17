-- Align intro_requests columns with RequestIntroModal payload keys.

alter table public.intro_requests
  add column if not exists candidate_name text,
  add column if not exists company_name text,
  add column if not exists work_email text,
  add column if not exists compensation_band text,
  add column if not exists terms_accepted boolean not null default false;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'intro_requests'
      and column_name = 'employer_company'
  ) then
    update public.intro_requests
    set
      company_name = coalesce(company_name, employer_company),
      work_email = coalesce(work_email, employer_email),
      compensation_band = coalesce(compensation_band, comp_band)
    where company_name is null
       or work_email is null
       or compensation_band is null;
  end if;
end $$;

alter table public.intro_requests drop column if exists employer_company;
alter table public.intro_requests drop column if exists employer_email;
alter table public.intro_requests drop column if exists comp_band;

comment on column public.intro_requests.candidate_name is 'Display name of candidate at time of request.';
comment on column public.intro_requests.terms_accepted is 'Employer accepted Provix Placement Terms.';
