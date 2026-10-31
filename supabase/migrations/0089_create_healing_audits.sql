-- Healing audit log read by /history. Service role writes a row when an
-- autofix pull request is opened. Signed-in and anonymous clients may read it.

create table if not exists public.healing_audits (
  id uuid primary key default gen_random_uuid(),
  file_path text not null,
  branch_name text,
  category text not null default 'violations' check (category in ('violations', 'leaks')),
  status text not null default 'open' check (status in ('open', 'pending', 'merged', 'closed')),
  commit_message text,
  created_at timestamptz not null default now()
);

comment on table public.healing_audits is
  'Autonomous code interventions shown on the healing audit log.';

create index if not exists healing_audits_created_at_idx
  on public.healing_audits (created_at desc);

alter table public.healing_audits enable row level security;

drop policy if exists healing_audits_select on public.healing_audits;
create policy healing_audits_select
  on public.healing_audits
  for select
  to anon, authenticated
  using (true);

revoke insert, update, delete on table public.healing_audits from anon, authenticated;
grant select on table public.healing_audits to anon, authenticated;
grant all on table public.healing_audits to service_role;

notify pgrst, 'reload schema';
