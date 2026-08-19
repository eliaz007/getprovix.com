-- Sync public.profiles with every column the Next.js app selects or updates.
-- Safe to run on databases that skipped intermediate migrations (0002–0035).
-- Idempotent: only adds missing columns, defaults, indexes, and backfills.

-- ---------------------------------------------------------------------------
-- 1. Core columns (0001 + auth bootstrap)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists full_name text,
  add column if not exists avatar_url text,
  add column if not exists updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- 2. Account type & onboarding (0002, 0003, 0005)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists role text,
  add column if not exists graduation_year integer,
  add column if not exists status text,
  add column if not exists major text,
  add column if not exists job_title text,
  add column if not exists company_name text,
  add column if not exists industry text,
  add column if not exists company_size text,
  add column if not exists hiring_preferences text;

-- Signup / dossier identity fields queried by talent pool & admin routes
alter table public.profiles
  add column if not exists name text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists headline text,
  add column if not exists email text;

comment on column public.profiles.name is 'Legacy display name; prefer full_name when set.';
comment on column public.profiles.first_name is 'Signup first name mirrored from auth metadata.';
comment on column public.profiles.last_name is 'Signup last name mirrored from auth metadata.';
comment on column public.profiles.headline is 'Public headline; often mirrors job_title for dossiers.';
comment on column public.profiles.email is 'Contact email mirror for dossier unlock (fallback to contact_email).';

-- ---------------------------------------------------------------------------
-- 3. Candidate Profile Studio (0006, 0012, 0014, 0025, 0026)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists bio text,
  add column if not exists school text,
  add column if not exists skills text[],
  add column if not exists portfolio_url text,
  add column if not exists experience_level text,
  add column if not exists availability_status text,
  add column if not exists availability text,
  add column if not exists university text,
  add column if not exists degree text,
  add column if not exists youtube_url text;

comment on column public.profiles.availability is
  'Legacy availability label; prefer availability_status. Kept for older selects.';

-- ---------------------------------------------------------------------------
-- 4. Talent pool visibility (0004)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_visible_in_pool boolean;

update public.profiles
set is_visible_in_pool = true
where is_visible_in_pool is null;

alter table public.profiles
  alter column is_visible_in_pool set default true;

update public.profiles
set is_visible_in_pool = false
where role in ('employer', 'business');

-- ---------------------------------------------------------------------------
-- 5. Pro tier & contact dossier (0008)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists tier text,
  add column if not exists is_pro boolean,
  add column if not exists phone text,
  add column if not exists linkedin_url text,
  add column if not exists contact_email text;

update public.profiles set tier = 'free' where tier is null;
update public.profiles set is_pro = false where is_pro is null;

alter table public.profiles
  alter column tier set default 'free',
  alter column is_pro set default false;

-- ---------------------------------------------------------------------------
-- 6. Anonymized talent pool cards (0020)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists codename_alias text,
  add column if not exists country text,
  add column if not exists timezone text;

-- ---------------------------------------------------------------------------
-- 7. Deep screening & featured builders (0011, 0031)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists integrity_score integer,
  add column if not exists audit_data jsonb,
  add column if not exists is_featured boolean;

update public.profiles set is_featured = false where is_featured is null;

alter table public.profiles
  alter column is_featured set default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_integrity_score_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_integrity_score_check
      check (integrity_score is null or (integrity_score between 1 and 100));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Public profile slug (0030)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists profile_slug text;

create unique index if not exists profiles_profile_slug_unique_idx
  on public.profiles (lower(profile_slug))
  where profile_slug is not null;

-- ---------------------------------------------------------------------------
-- 9. Work preference (0034)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists work_preference text;

update public.profiles
set work_preference = 'remote_global'
where work_preference is null;

alter table public.profiles
  alter column work_preference set default 'remote_global',
  alter column timezone set default 'US_ET';

-- ---------------------------------------------------------------------------
-- 10. Defaults for nullable columns added above
-- ---------------------------------------------------------------------------
update public.profiles
set availability_status = 'Available Now'
where availability_status is null;

alter table public.profiles
  alter column availability_status set default 'Available Now';

-- ---------------------------------------------------------------------------
-- 11. Backfills from related columns / auth metadata
-- ---------------------------------------------------------------------------
update public.profiles
set headline = job_title
where headline is null
  and job_title is not null;

update public.profiles
set availability = availability_status
where availability is null
  and availability_status is not null;

update public.profiles
set availability_status = coalesce(availability, 'Available Now')
where availability_status is null;

update public.profiles
set university = school
where university is null
  and school is not null;

update public.profiles
set degree = major
where degree is null
  and major is not null;

update public.profiles
set full_name = nullif(
  trim(
    coalesce(first_name, '') || ' ' || coalesce(last_name, '')
  ),
  ''
)
where (full_name is null or trim(full_name) = '')
  and (coalesce(first_name, '') <> '' or coalesce(last_name, '') <> '');

update public.profiles p
set
  email = coalesce(p.email, p.contact_email, u.email),
  first_name = coalesce(p.first_name, u.raw_user_meta_data ->> 'first_name'),
  last_name = coalesce(p.last_name, u.raw_user_meta_data ->> 'last_name')
from auth.users u
where p.id = u.id;

update public.profiles p
set role = case
  when lower(coalesce(u.raw_user_meta_data ->> 'role', u.raw_user_meta_data ->> 'account_type', ''))
    in ('employer', 'business') then 'employer'
  when lower(coalesce(u.raw_user_meta_data ->> 'role', '')) = 'candidate' then 'candidate'
  else p.role
end
from auth.users u
where p.id = u.id
  and (p.role is null or p.role in ('business'));

-- ---------------------------------------------------------------------------
-- 12. Helpful indexes for dashboard queries
-- ---------------------------------------------------------------------------
create index if not exists profiles_visible_in_pool_idx
  on public.profiles (is_visible_in_pool)
  where is_visible_in_pool = true;

create index if not exists profiles_role_idx
  on public.profiles (role);

create index if not exists profiles_featured_visible_idx
  on public.profiles (updated_at desc)
  where is_featured = true and is_visible_in_pool = true;

-- ---------------------------------------------------------------------------
-- 13. Column comments (documentation for Supabase UI)
-- ---------------------------------------------------------------------------
comment on column public.profiles.role is
  'Account kind: candidate or employer (legacy value business is normalized to employer).';
comment on column public.profiles.is_visible_in_pool is
  'When true, candidate appears in employer talent pool and public discovery.';
comment on column public.profiles.work_preference is
  'Work arrangement slug: remote_global, remote_americas, remote_emea, hybrid_onsite.';
comment on column public.profiles.timezone is
  'Timezone slug for public cards (US_ET, US_PT, LATAM, etc.).';
comment on column public.profiles.profile_slug is
  'URL slug for /p/[profile_slug]; requires is_visible_in_pool = true.';
comment on column public.profiles.integrity_score is
  'Latest AI integrity score from deep screening (1-100).';
comment on column public.profiles.audit_data is
  'Full JSON payload from the latest deep screening audit.';
comment on column public.profiles.is_featured is
  'When true, profile may appear on the landing page Featured Builders showcase.';

comment on table public.profiles is
  'Public profile row for each auth user. Schema synced by migration 0036 for frontend selects.';
