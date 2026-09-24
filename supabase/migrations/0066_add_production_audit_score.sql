-- Persist public Repo Auditor scores onto candidate profiles so
-- developers and employers can both view a verified Production Audit Score.

alter table public.profiles
  add column if not exists production_score integer,
  add column if not exists audit_breakdown jsonb,
  add column if not exists is_audit_verified boolean not null default false;

comment on column public.profiles.production_score is
  'Public Repo Auditor production score (0-100) claimed onto the candidate profile.';
comment on column public.profiles.audit_breakdown is
  'Repo Auditor sub-metrics: ci_cd_score, test_density, error_handling, audited_repo_url, audited_at.';
comment on column public.profiles.is_audit_verified is
  'True after an authenticated candidate claims or runs a production audit.';

update public.profiles
set is_audit_verified = false
where is_audit_verified is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_production_score_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_production_score_check
      check (
        production_score is null
        or (production_score between 0 and 100)
      );
  end if;
end $$;

notify pgrst, 'reload schema';
