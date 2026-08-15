-- Adds the extra fields collected during onboarding (src/app/onboarding/page.tsx)
-- on top of the base profiles table from 0001_create_profiles.sql.

alter table public.profiles
  add column if not exists graduation_year integer,
  add column if not exists role text;

comment on column public.profiles.graduation_year is 'Expected/actual graduation year, collected during onboarding.';
comment on column public.profiles.role is 'Free-form role/title the user selected during onboarding (e.g. "Student", "Business").';

-- Signup already tags accounts with a role in auth user_metadata (see the
-- Candidate/Business toggle in src/app/login/page.tsx). Carry that over onto
-- the profile row at creation time so it's not blank until onboarding runs.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'business_name'),
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'role'
  );
  return new;
end;
$$;
