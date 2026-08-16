-- Candidate career stage for matching, onboarding, and employer filters.

alter table public.profiles
  add column if not exists experience_level text;

comment on column public.profiles.experience_level is 'Candidate career stage: Student / Intern, Junior / Entry-Level, Mid-Level, or Senior+.';
