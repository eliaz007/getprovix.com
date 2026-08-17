-- Permanent public codename aliases and standardized location fields for talent pool anonymity.

alter table public.profiles
  add column if not exists codename_alias text,
  add column if not exists country text,
  add column if not exists timezone text;

comment on column public.profiles.codename_alias is 'Permanent public codename shown to employers before intro approval (e.g. Engineer Cobalt Atlas).';
comment on column public.profiles.country is 'Public country label shown on anonymized candidate cards.';
comment on column public.profiles.timezone is 'Public timezone label shown on anonymized candidate cards (e.g. MT (UTC-6)).';

alter table public.candidates
  add column if not exists codename_alias text,
  add column if not exists country text,
  add column if not exists timezone text;

comment on column public.candidates.codename_alias is 'Public codename alias for seed/marketing candidate previews.';
