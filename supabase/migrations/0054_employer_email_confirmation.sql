-- Active employer verification: confirmation link click, not domain-only checks.

alter table public.profiles
  add column if not exists email_verified_at timestamptz;

comment on column public.profiles.is_verified is
  'True only after the employer clicks the confirmation link sent to their corporate work email.';
comment on column public.profiles.email_verified_at is
  'Timestamp of the last successful work-email confirmation click.';

create table if not exists public.employer_email_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists employer_email_verifications_token_hash_uidx
  on public.employer_email_verifications (token_hash);

create index if not exists employer_email_verifications_user_id_idx
  on public.employer_email_verifications (user_id, created_at desc);

comment on table public.employer_email_verifications is
  'Hashed one-time tokens for employer work-email confirmation links.';

alter table public.employer_email_verifications enable row level security;

revoke all on table public.employer_email_verifications from anon, authenticated;
grant all on table public.employer_email_verifications to service_role;

-- Clients may clear verification when the work email changes, but cannot set it true.
create or replace function public.protect_employer_is_verified()
returns trigger
language plpgsql
as $$
begin
  if new.is_verified is true and old.is_verified is not true then
    if auth.role() is distinct from 'service_role' then
      new.is_verified := old.is_verified;
      new.email_verified_at := old.email_verified_at;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_employer_is_verified on public.profiles;
create trigger protect_employer_is_verified
  before update on public.profiles
  for each row
  execute procedure public.protect_employer_is_verified();

-- Signup no longer auto-verifies from domain matching.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  signup_role text;
  normalized_role text;
begin
  signup_role := coalesce(
    new.raw_user_meta_data ->> 'role',
    new.raw_user_meta_data ->> 'account_type'
  );

  normalized_role := case lower(coalesce(signup_role, ''))
    when 'employer' then 'employer'
    when 'business' then 'employer'
    when 'candidate' then 'candidate'
    else null
  end;

  insert into public.profiles (
    id,
    user_id,
    full_name,
    avatar_url,
    role,
    graduation_year,
    status,
    major,
    is_visible_in_pool,
    is_verified
  )
  values (
    new.id,
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'business_name',
      nullif(
        trim(
          coalesce(new.raw_user_meta_data ->> 'first_name', '') || ' ' ||
          coalesce(new.raw_user_meta_data ->> 'last_name', '')
        ),
        ''
      )
    ),
    new.raw_user_meta_data ->> 'avatar_url',
    normalized_role,
    nullif(new.raw_user_meta_data ->> 'graduation_year', '')::integer,
    new.raw_user_meta_data ->> 'status',
    new.raw_user_meta_data ->> 'major',
    false,
    false
  );

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates profiles on auth signup. Employers start unverified until they confirm a corporate work email.';

-- Domain-only auto-verifications from 0053 must confirm via email going forward.
update public.profiles
set is_verified = false
where lower(coalesce(role, '')) in ('employer', 'business')
  and email_verified_at is null
  and is_verified is distinct from false;
