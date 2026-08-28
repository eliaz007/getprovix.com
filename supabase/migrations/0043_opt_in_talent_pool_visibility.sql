-- Candidate talent-pool visibility is opt-in.
-- New profiles default to hidden; employers only see profiles with is_visible_in_pool = true.

alter table public.profiles
  add column if not exists is_visible_in_pool boolean;

update public.profiles
set is_visible_in_pool = false
where is_visible_in_pool is null;

alter table public.profiles
  alter column is_visible_in_pool set default false;

alter table public.profiles
  alter column is_visible_in_pool set not null;

comment on column public.profiles.is_visible_in_pool is
  'Opt-in talent pool visibility. Defaults to false. When true, the candidate appears in the employer talent pool and public discovery.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  signup_role text;
  normalized_role text;
begin
  signup_role := coalesce(
    new.raw_user_meta_data ->> 'role',
    new.raw_user_meta_data ->> 'account_type'
  );

  normalized_role := case lower(coalesce(signup_role, ''))
    when 'employer' then 'employer'
    when 'business' then 'employer'
    when 'candidate' then 'candidate'
    else null
  end;

  insert into public.profiles (
    id,
    full_name,
    avatar_url,
    role,
    graduation_year,
    status,
    major,
    is_visible_in_pool
  )
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
    normalized_role,
    nullif(new.raw_user_meta_data ->> 'graduation_year', '')::integer,
    new.raw_user_meta_data ->> 'status',
    new.raw_user_meta_data ->> 'major',
    false
  );

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates profiles on auth signup. Talent pool visibility is opt-in (is_visible_in_pool = false).';
