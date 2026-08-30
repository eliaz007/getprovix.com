-- profiles SELECT policies must not query public.profiles directly.
-- The talent-pool policy in 0008/0048 used EXISTS (select from profiles),
-- which re-enters RLS and raises:
--   Infinite recursion detected in policy for relation "profiles"
-- That also breaks own-row lookups and inserts that RETURNING the new row.

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

comment on function public.current_user_is_employer() is
  'SECURITY DEFINER so employer checks do not re-enter profiles RLS.';

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

-- Own-row policies stay column comparisons only (no profiles subquery).
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
