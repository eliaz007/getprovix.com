-- Ensure authenticated users can read, insert, and update their own profiles row.
-- Fixes Profile Studio saves failing when RLS policies were missing or too strict.

alter table public.profiles enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

grant select, insert, update on table public.profiles to authenticated;

comment on policy "Users can view their own profile" on public.profiles is
  'Candidates and employers can read their own profiles row in Profile Studio.';
comment on policy "Users can insert their own profile" on public.profiles is
  'Allows fallback profile creation when auth trigger did not create a row.';
comment on policy "Users can update their own profile" on public.profiles is
  'Profile Studio Save Changes updates the authenticated user profiles row.';
