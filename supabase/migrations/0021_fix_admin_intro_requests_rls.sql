-- Align intro_requests admin RLS with app-level admin allowlist checks.

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(
      (auth.jwt() ->> 'email') in (
        'eliasdiangelo91@gmail.com',
        'comradeduck1@gmail.com'
      ),
      false
    )
    or coalesce((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin', false)
    or exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    );
$$;

drop policy if exists "Admins can view all intro requests" on public.intro_requests;
create policy "Admins can view all intro requests"
  on public.intro_requests
  for select
  using (public.is_admin_user());

drop policy if exists "Admins can update all intro requests" on public.intro_requests;
create policy "Admins can update all intro requests"
  on public.intro_requests
  for update
  using (public.is_admin_user())
  with check (public.is_admin_user());
