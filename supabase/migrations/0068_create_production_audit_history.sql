-- Append-only history of production audits claimed or run by a candidate.
-- Latest score remains on profiles.*; this table retains every past run.

create table if not exists public.production_audit_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  production_score integer not null,
  audited_repo_url text not null default '',
  audited_at timestamptz not null default now(),
  ci_cd_score integer not null default 0,
  test_density integer not null default 0,
  error_handling integer not null default 0,
  created_at timestamptz not null default now(),
  constraint production_audit_history_score_check
    check (production_score between 0 and 100),
  constraint production_audit_history_ci_cd_check
    check (ci_cd_score between 0 and 100),
  constraint production_audit_history_test_density_check
    check (test_density between 0 and 100),
  constraint production_audit_history_error_handling_check
    check (error_handling between 0 and 100)
);

comment on table public.production_audit_history is
  'Per-audit history rows: overall score, repo URL, date, and CI/CD / test density / error-boundary sub-metrics.';

create index if not exists production_audit_history_user_id_created_at_idx
  on public.production_audit_history (user_id, created_at desc);

alter table public.production_audit_history enable row level security;

drop policy if exists "Candidates can read their own production audit history"
  on public.production_audit_history;
create policy "Candidates can read their own production audit history"
  on public.production_audit_history
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Candidates can insert their own production audit history"
  on public.production_audit_history;
create policy "Candidates can insert their own production audit history"
  on public.production_audit_history
  for insert
  to authenticated
  with check (auth.uid() = user_id);

grant select, insert on table public.production_audit_history to authenticated;
grant all on table public.production_audit_history to service_role;

notify pgrst, 'reload schema';
