-- Proof-of-ownership records: a candidate places a unique token in
-- provix.txt at the repo root, then /api/verify-repo confirms it.

create table if not exists public.repo_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  repo_url text not null,
  token text not null,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  constraint repo_verifications_repo_url_check
    check (char_length(trim(repo_url)) > 0),
  constraint repo_verifications_token_check
    check (char_length(trim(token)) > 0)
);

comment on table public.repo_verifications is
  'GitHub repository ownership proofs. is_verified is set only after /api/verify-repo matches provix.txt to the stored token.';
comment on column public.repo_verifications.repo_url is
  'Canonical GitHub repository URL (https://github.com/owner/repo).';
comment on column public.repo_verifications.token is
  'Secret placed in the repository root as provix.txt.';
comment on column public.repo_verifications.is_verified is
  'True only after the GitHub raw file content matches token. Clients cannot set this flag.';
comment on column public.repo_verifications.created_at is
  'When the verification row was created.';

create unique index if not exists repo_verifications_user_id_repo_url_uidx
  on public.repo_verifications (user_id, repo_url);

create index if not exists repo_verifications_user_id_created_at_idx
  on public.repo_verifications (user_id, created_at desc);

create index if not exists repo_verifications_user_id_token_idx
  on public.repo_verifications (user_id, token);

alter table public.repo_verifications enable row level security;
alter table public.repo_verifications force row level security;

drop policy if exists "Users can read their own repo verifications"
  on public.repo_verifications;
create policy "Users can read their own repo verifications"
  on public.repo_verifications
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own pending repo verifications"
  on public.repo_verifications;
create policy "Users can insert their own pending repo verifications"
  on public.repo_verifications
  for insert
  to authenticated
  with check (auth.uid() = user_id and is_verified is not true);

drop policy if exists "Users can update their own pending repo verifications"
  on public.repo_verifications;
create policy "Users can update their own pending repo verifications"
  on public.repo_verifications
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and is_verified is not true);

drop policy if exists "Users can delete their own repo verifications"
  on public.repo_verifications;
create policy "Users can delete their own repo verifications"
  on public.repo_verifications
  for delete
  to authenticated
  using (auth.uid() = user_id);

revoke all on table public.repo_verifications from public, anon;
grant select, insert, update, delete on table public.repo_verifications to authenticated;
grant all on table public.repo_verifications to service_role;

-- Clients may create pending rows, but only service_role can mark them verified.
create or replace function public.protect_repo_verification_is_verified()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_verified is true and auth.role() is distinct from 'service_role' then
      new.is_verified := false;
    end if;
    return new;
  end if;

  if new.is_verified is true and old.is_verified is not true then
    if auth.role() is distinct from 'service_role' then
      new.is_verified := old.is_verified;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_repo_verification_is_verified on public.repo_verifications;
create trigger protect_repo_verification_is_verified
  before insert or update on public.repo_verifications
  for each row
  execute procedure public.protect_repo_verification_is_verified();

notify pgrst, 'reload schema';
