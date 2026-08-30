-- Candidate GPA collected on Profile Studio (Academics).

alter table public.profiles
  add column if not exists gpa text;

comment on column public.profiles.gpa is
  'Candidate-reported GPA from Profile Studio Academics (stored as entered, e.g. 3.85).';
