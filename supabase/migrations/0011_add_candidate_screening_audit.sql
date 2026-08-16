-- Persist AI deep screening audits for talent pool candidates.

alter table public.profiles
  add column if not exists integrity_score integer
    check (integrity_score is null or (integrity_score between 1 and 100)),
  add column if not exists audit_data jsonb;

comment on column public.profiles.integrity_score is 'Latest AI integrity score from deep screening (1-100).';
comment on column public.profiles.audit_data is 'Full JSON payload from the latest deep screening audit.';

create table if not exists public.candidate_screenings (
  candidate_key text primary key,
  profile_id uuid references public.profiles (id) on delete set null,
  integrity_score integer check (integrity_score between 1 and 100),
  audit_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.candidate_screenings is 'Cached deep screening audits keyed by profile id or seed candidate id.';

create or replace function public.handle_candidate_screening_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_candidate_screenings_updated_at on public.candidate_screenings;
create trigger set_candidate_screenings_updated_at
  before update on public.candidate_screenings
  for each row
  execute procedure public.handle_candidate_screening_updated_at();

alter table public.candidate_screenings enable row level security;

drop policy if exists "Authenticated users can read screenings" on public.candidate_screenings;
create policy "Authenticated users can read screenings"
  on public.candidate_screenings
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can upsert screenings" on public.candidate_screenings;
create policy "Authenticated users can upsert screenings"
  on public.candidate_screenings
  for all
  to authenticated
  using (true)
  with check (true);
