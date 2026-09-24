-- Pattern 2: new auth users must not inherit a portal role.
-- Role is chosen on /onboarding/role after GitHub/Google (and email) sign-in.

alter table public.profiles
  alter column role drop default;

alter table public.profiles
  alter column role drop not null;

comment on column public.profiles.role is
  'Account kind: candidate or employer. NULL until the user chooses on /onboarding/role. Legacy value business is treated as employer.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    user_id,
    full_name,
    avatar_url,
    role,
    graduation_year,
    status,
    major,
    is_visible_in_pool,
    is_verified
  )
  values (
    new.id,
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'business_name',
      new.raw_user_meta_data ->> 'name',
      nullif(
        trim(
          coalesce(new.raw_user_meta_data ->> 'first_name', '') || ' ' ||
          coalesce(new.raw_user_meta_data ->> 'last_name', '')
        ),
        ''
      )
    ),
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    ),
    null,
    nullif(new.raw_user_meta_data ->> 'graduation_year', '')::integer,
    new.raw_user_meta_data ->> 'status',
    new.raw_user_meta_data ->> 'major',
    false,
    false
  );

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates a profiles row on auth signup with role NULL. Portal role is assigned on /onboarding/role, not from OAuth metadata.';
