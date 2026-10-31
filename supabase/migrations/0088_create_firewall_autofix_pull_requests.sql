-- Files with an open autofix pull request. The violations view hides these
-- paths until the pull request is no longer open or pending.
-- Written and read by the service role. Browser clients cannot list the table.

create table if not exists public.firewall_autofix_pull_requests (
  id uuid primary key default gen_random_uuid(),
  owner text not null,
  repo text not null,
  file_path text not null,
  status text not null default 'open' check (status in ('open', 'pending', 'merged', 'closed')),
  pull_number integer,
  pull_url text,
  branch text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint firewall_autofix_pull_requests_repo_file_key unique (owner, repo, file_path)
);

comment on table public.firewall_autofix_pull_requests is
  'Autofix pull requests that should hide the matching file from the active violation list.';

create index if not exists firewall_autofix_pull_requests_repo_status_idx
  on public.firewall_autofix_pull_requests (owner, repo, status);

alter table public.firewall_autofix_pull_requests enable row level security;
alter table public.firewall_autofix_pull_requests force row level security;

revoke all on table public.firewall_autofix_pull_requests from anon;
revoke all on table public.firewall_autofix_pull_requests from authenticated;
grant all on table public.firewall_autofix_pull_requests to service_role;

notify pgrst, 'reload schema';
