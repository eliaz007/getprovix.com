-- Shareable production-audit snapshots. Public pages read a single row
-- with the service role. Anonymous clients cannot list the table.

create table if not exists public.shared_audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

comment on table public.shared_audits is
  'Read-only public snapshot of a completed production audit, addressed by id.';

create index if not exists shared_audits_user_id_created_at_idx
  on public.shared_audits (user_id, created_at desc);

alter table public.shared_audits enable row level security;
alter table public.shared_audits force row level security;

drop policy if exists "Candidates can insert their own shared audits"
  on public.shared_audits;
create policy "Candidates can insert their own shared audits"
  on public.shared_audits
  for insert
  to authenticated
  with check (auth.uid() = user_id);

revoke all on table public.shared_audits from anon;
revoke all on table public.shared_audits from authenticated;
grant insert on table public.shared_audits to authenticated;
grant all on table public.shared_audits to service_role;

notify pgrst, 'reload schema';
