-- Allow any authenticated session to read published talent-pool profiles.
-- Employers still use the same visibility column; role is no longer required
-- so local candidate/admin testing does not get an empty directory.

drop policy if exists "Employers can view visible talent pool profiles" on public.profiles;

create policy "Authenticated users can view visible talent pool profiles"
  on public.profiles
  for select
  to authenticated
  using (coalesce(is_visible_in_pool, false) = true);

comment on policy "Authenticated users can view visible talent pool profiles" on public.profiles is
  'Published talent-pool rows (is_visible_in_pool = true) are readable by any authenticated user.';
