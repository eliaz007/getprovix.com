-- Fix Postgres 42501 on shared_audits.
-- Returning the new id (INSERT ... RETURNING / .select('id')) needs SELECT.
-- Public audit pages read with the anon key, not the service role.

grant select, insert on table public.shared_audits to anon;
grant select, insert on table public.shared_audits to authenticated;
grant all on table public.shared_audits to service_role;

alter table public.shared_audits enable row level security;

drop policy if exists "Public can read shared audits"
  on public.shared_audits;
create policy "Public can read shared audits"
  on public.shared_audits
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Candidates can insert their own shared audits"
  on public.shared_audits;
drop policy if exists "Authenticated users can insert their own shared audits"
  on public.shared_audits;
create policy "Authenticated users can insert their own shared audits"
  on public.shared_audits
  for insert
  to authenticated
  with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
