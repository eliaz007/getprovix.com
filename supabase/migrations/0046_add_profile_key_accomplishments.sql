-- Candidate key accomplishments from Profile Studio (Proof of Work).

alter table public.profiles
  add column if not exists key_accomplishments text;

comment on column public.profiles.key_accomplishments is
  'Freeform key accomplishments / project highlights from Profile Studio Proof of Work.';
