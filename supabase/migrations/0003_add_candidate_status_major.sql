-- Adds the extra candidate fields now collected at signup time via the
-- "Candidate Sign Up" form (see src/app/login/page.tsx): Current Status and
-- Major / Specialization (on top of full_name, graduation_year, and role
-- from 0001/0002).

alter table public.profiles
  add column if not exists status text,
  add column if not exists major text;

comment on column public.profiles.status is 'Candidate''s current status at signup (e.g. "High School Student", "College Student", "Professional").';
comment on column public.profiles.major is 'Candidate''s major/specialization (or intended major, for high school students).';

-- Candidate signups now collect first/last name, status, major, and
-- graduation year up front, so carry all of it over onto the profile row at
-- creation time instead of leaving it blank until /onboarding runs.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, role, graduation_year, status, major)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'business_name',
      nullif(
        trim(
          coalesce(new.raw_user_meta_data ->> 'first_name', '') || ' ' ||
          coalesce(new.raw_user_meta_data ->> 'last_name', '')
        ),
        ''
      )
    ),
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'role',
    -- graduation_year arrives as a string from the signup form; guard
    -- against '' (empty/untouched field) so the cast never throws and
    -- blocks account creation.
    nullif(new.raw_user_meta_data ->> 'graduation_year', '')::integer,
    new.raw_user_meta_data ->> 'status',
    new.raw_user_meta_data ->> 'major'
  );
  return new;
end;
$$;
