-- GitHub App installations and the repositories each signed-in user granted.
-- The install callback writes these rows with the user session.

create table if not exists public.github_app_installations (
  user_id uuid not null references auth.users (id) on delete cascade,
  installation_id bigint not null,
  setup_action text,
  account_login text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, installation_id)
);

comment on table public.github_app_installations is
  'Provix GitHub App installation recorded after GitHub redirects back from the install screen.';

create table if not exists public.github_app_repositories (
  user_id uuid not null references auth.users (id) on delete cascade,
  installation_id bigint not null,
  full_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, full_name),
  constraint github_app_repositories_full_name_check
    check (full_name ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')
);

comment on table public.github_app_repositories is
  'Repositories visible to a user through their Provix GitHub App installation.';

alter table public.github_app_installations enable row level security;
alter table public.github_app_installations force row level security;
alter table public.github_app_repositories enable row level security;
alter table public.github_app_repositories force row level security;

drop policy if exists "Users read their GitHub App installations" on public.github_app_installations;
create policy "Users read their GitHub App installations"
  on public.github_app_installations
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users insert their GitHub App installations" on public.github_app_installations;
create policy "Users insert their GitHub App installations"
  on public.github_app_installations
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users update their GitHub App installations" on public.github_app_installations;
create policy "Users update their GitHub App installations"
  on public.github_app_installations
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users read their GitHub App repositories" on public.github_app_repositories;
create policy "Users read their GitHub App repositories"
  on public.github_app_repositories
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users insert their GitHub App repositories" on public.github_app_repositories;
create policy "Users insert their GitHub App repositories"
  on public.github_app_repositories
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users update their GitHub App repositories" on public.github_app_repositories;
create policy "Users update their GitHub App repositories"
  on public.github_app_repositories
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on table public.github_app_installations from public, anon;
revoke all on table public.github_app_repositories from public, anon;
grant select, insert, update on table public.github_app_installations to authenticated;
grant select, insert, update on table public.github_app_repositories to authenticated;
grant all on table public.github_app_installations to service_role;
grant all on table public.github_app_repositories to service_role;

notify pgrst, 'reload schema';
