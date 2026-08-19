-- Normalize employer/business signups to role = 'employer' and hide from talent pool.

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
    case when normalized_role = 'employer' then false else true end
  );

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates profiles on auth signup. Employer/business signups get role = employer and is_visible_in_pool = false.';
