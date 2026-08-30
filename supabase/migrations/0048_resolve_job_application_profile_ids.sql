-- job_applications.candidate_id references auth.users(id).
-- Profile education and screening data live on public.profiles, which may
-- use a separate profiles.id from that auth uid (linked via user_id).
-- Keep both IDs queryable and let employers read applicant profile rows.

alter table public.profiles
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

update public.profiles
set user_id = id
where user_id is null;

create unique index if not exists profiles_user_id_uidx
  on public.profiles (user_id)
  where user_id is not null;

comment on column public.profiles.user_id is
  'Auth user id for this profile. Matches job_applications.candidate_id even when profiles.id differs.';

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
    user_id,
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

drop policy if exists "Employers can view profiles of their job applicants" on public.profiles;
create policy "Employers can view profiles of their job applicants"
  on public.profiles
  for select
  using (
    exists (
      select 1
      from public.job_applications ja
      inner join public.jobs j on j.id = ja.job_id
      where j.employer_id = auth.uid()
        and (
          ja.candidate_id = profiles.id
          or ja.candidate_id = profiles.user_id
        )
    )
  );

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id or auth.uid() = user_id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id or auth.uid() = user_id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id or auth.uid() = user_id)
  with check (auth.uid() = id or auth.uid() = user_id);

create or replace function public.current_user_is_employer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(
      lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'role', ''))
        in ('employer', 'business'),
      false
    )
    or exists (
      select 1
      from public.profiles
      where (id = auth.uid() or user_id = auth.uid())
        and lower(coalesce(role, '')) in ('employer', 'business')
    );
$$;

revoke all on function public.current_user_is_employer() from public;
grant execute on function public.current_user_is_employer() to authenticated;

drop policy if exists "Employers can view visible talent pool profiles" on public.profiles;
create policy "Employers can view visible talent pool profiles"
  on public.profiles
  for select
  to authenticated
  using (
    coalesce(is_visible_in_pool, false) = true
    and auth.uid() is not null
    and public.current_user_is_employer()
  );
