-- Reset every RLS policy on public.profiles.
-- A leftover recursive SELECT policy (EXISTS on profiles from inside a
-- profiles policy) still causes: Infinite recursion detected in policy
-- for relation "profiles". 0049 only replaced known names.

alter table public.profiles enable row level security;

alter table public.profiles
  add column if not exists user_id uuid;

-- Explicit drops for every profiles policy name used in this repo and
-- common Supabase starter templates.
drop policy if exists "Users can view their own profile" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Employers can view visible talent pool profiles" on public.profiles;
drop policy if exists "Employers can view profiles of their job applicants" on public.profiles;
drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
drop policy if exists "Public profiles are viewable by everyone." on public.profiles;
drop policy if exists "Users can insert their own profile." on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can update their own profile." on public.profiles;
drop policy if exists "Enable read access for all users" on public.profiles;
drop policy if exists "Enable insert for authenticated users only" on public.profiles;
drop policy if exists "Enable update for users based on user_id" on public.profiles;
drop policy if exists "Enable update for users based on email" on public.profiles;
drop policy if exists "Profiles are viewable by authenticated users" on public.profiles;

-- Catch any remaining policies regardless of name.
do $$
declare
  rec record;
begin
  for rec in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
  loop
    execute format(
      'drop policy if exists %I on public.profiles',
      rec.policyname
    );
  end loop;
end;
$$;

-- Bypass RLS inside this helper. Querying profiles from a profiles policy
-- without this setting re-enters RLS even when the function is SECURITY DEFINER.
create or replace function public.current_user_is_employer()
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  jwt_role text;
begin
  jwt_role := lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'role', ''));
  if jwt_role in ('employer', 'business') then
    return true;
  end if;

  return exists (
    select 1
    from public.profiles
    where (id = auth.uid() or user_id = auth.uid())
      and lower(coalesce(role, '')) in ('employer', 'business')
  );
end;
$$;

revoke all on function public.current_user_is_employer() from public;
grant execute on function public.current_user_is_employer() to authenticated;

comment on function public.current_user_is_employer() is
  'SECURITY DEFINER with row_security off so employer checks never re-enter profiles RLS.';

-- SELECT: own row (column compare only — no profiles subquery).
create policy "Users can view their own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id or auth.uid() = user_id);

-- SELECT: visible talent-pool rows for employers.
create policy "Employers can view visible talent pool profiles"
  on public.profiles
  for select
  to authenticated
  using (
    coalesce(is_visible_in_pool, false) = true
    and public.current_user_is_employer()
  );

-- SELECT: applicant profiles for jobs the employer owns (joins jobs, not profiles).
create policy "Employers can view profiles of their job applicants"
  on public.profiles
  for select
  to authenticated
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

-- INSERT: own row only.
create policy "Users can insert their own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id or auth.uid() = user_id);

-- UPDATE: own row only.
create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id or auth.uid() = user_id)
  with check (auth.uid() = id or auth.uid() = user_id);

grant select, insert, update on table public.profiles to authenticated;
