-- Front-page 75+ claims can enroll a candidate in the talent pool after
-- GitHub ownership verification. Defaults stay off for every other path.

alter table public.profiles
  add column if not exists is_in_talent_pool boolean not null default false;

alter table public.profiles
  add column if not exists verification_status text not null default 'unverified';

alter table public.profiles
  add column if not exists audit_score integer;

comment on column public.profiles.is_in_talent_pool is
  'Talent pool enrollment. Schema default is false; set true only after a verified front-page 75+ claim.';

comment on column public.profiles.verification_status is
  'GitHub ownership verification for a claimed dossier: unverified | verified.';

comment on column public.profiles.audit_score is
  'Latest claimed production audit score from the front-page qualification flow.';
