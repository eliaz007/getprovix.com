-- Corporate work-email verification for employer / company profiles.
-- Free webmail domains cannot unlock verified employer dashboard features.

alter table public.profiles
  add column if not exists is_verified boolean not null default false;

comment on column public.profiles.is_verified is
  'True when an employer registered or saved a corporate work email (not Gmail/Yahoo/Hotmail/Outlook/iCloud). Gates verified employer dashboard features.';

create or replace function public.extract_email_domain(email text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      lower(split_part(trim(coalesce(email, '')), '@', 2)),
      '\.+$',
      ''
    ),
    ''
  );
$$;

create or replace function public.is_free_webmail_domain(domain text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(domain, '')) in (
    'gmail.com',
    'yahoo.com',
    'hotmail.com',
    'outlook.com',
    'icloud.com'
  );
$$;

create or replace function public.is_corporate_work_email(email text)
returns boolean
language sql
immutable
as $$
  select
    email is not null
    and position('@' in trim(email)) > 1
    and public.extract_email_domain(email) is not null
    and position('.' in public.extract_email_domain(email)) > 0
    and not public.is_free_webmail_domain(public.extract_email_domain(email));
$$;

revoke all on function public.extract_email_domain(text) from public;
revoke all on function public.is_free_webmail_domain(text) from public;
revoke all on function public.is_corporate_work_email(text) from public;
grant execute on function public.extract_email_domain(text) to authenticated, service_role;
grant execute on function public.is_free_webmail_domain(text) to authenticated, service_role;
grant execute on function public.is_corporate_work_email(text) to authenticated, service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  signup_role text;
  normalized_role text;
  employer_verified boolean;
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

  employer_verified :=
    normalized_role = 'employer'
    and public.is_corporate_work_email(new.email);

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
    false,
    employer_verified
  );

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates profiles on auth signup. Employer signups get role = employer, is_visible_in_pool = false, and is_verified from corporate work-email checks.';

-- Backfill existing employer rows from stored work email or auth email.
update public.profiles p
set is_verified = true
from auth.users u
where u.id = coalesce(p.user_id, p.id)
  and lower(coalesce(p.role, '')) in ('employer', 'business')
  and public.is_corporate_work_email(
    coalesce(nullif(trim(p.contact_email), ''), nullif(trim(p.email), ''), u.email)
  );

update public.profiles
set is_verified = false
where lower(coalesce(role, '')) not in ('employer', 'business')
  and is_verified is distinct from false;

create or replace function public.current_user_is_verified_employer()
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  return exists (
    select 1
    from public.profiles
    where (id = auth.uid() or user_id = auth.uid())
      and lower(coalesce(role, '')) in ('employer', 'business')
      and coalesce(is_verified, false) = true
  );
end;
$$;

revoke all on function public.current_user_is_verified_employer() from public;
grant execute on function public.current_user_is_verified_employer() to authenticated;

comment on function public.current_user_is_verified_employer() is
  'True when the signed-in user is an employer with is_verified from a corporate work email.';

drop policy if exists "Employers can view visible talent pool profiles" on public.profiles;
create policy "Employers can view visible talent pool profiles"
  on public.profiles
  for select
  to authenticated
  using (
    coalesce(is_visible_in_pool, false) = true
    and public.current_user_is_verified_employer()
  );

drop policy if exists "Employers can insert their own jobs" on public.jobs;
drop policy if exists "Verified employers can insert their own jobs" on public.jobs;
create policy "Verified employers can insert their own jobs"
  on public.jobs
  for insert
  to authenticated
  with check (
    auth.uid() = employer_id
    and public.current_user_is_verified_employer()
  );
