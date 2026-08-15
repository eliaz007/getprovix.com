-- Employer onboarding fields (Company Name, Industry, Company Size,
-- Hiring Preferences) plus a dedicated job_title so candidate onboarding
-- can store a title without overwriting the account-type `role`.

alter table public.profiles
  add column if not exists job_title text,
  add column if not exists company_name text,
  add column if not exists industry text,
  add column if not exists company_size text,
  add column if not exists hiring_preferences text;

comment on column public.profiles.job_title is 'Candidate job title / intended role, collected during onboarding.';
comment on column public.profiles.company_name is 'Employer company name, collected during business onboarding.';
comment on column public.profiles.industry is 'Employer industry, collected during business onboarding.';
comment on column public.profiles.company_size is 'Employer company size band, collected during business onboarding.';
comment on column public.profiles.hiring_preferences is 'Free-form hiring preferences from business onboarding.';
