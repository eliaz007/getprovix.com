-- Admin pipeline access and rejected status for intro_requests.

alter table public.intro_requests
  drop constraint if exists intro_requests_status_check;

alter table public.intro_requests
  add constraint intro_requests_status_check
  check (status in ('pending', 'approved', 'rejected', 'declined', 'completed'));

drop policy if exists "Admins can view all intro requests" on public.intro_requests;
create policy "Admins can view all intro requests"
  on public.intro_requests
  for select
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

drop policy if exists "Admins can update all intro requests" on public.intro_requests;
create policy "Admins can update all intro requests"
  on public.intro_requests
  for update
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );
