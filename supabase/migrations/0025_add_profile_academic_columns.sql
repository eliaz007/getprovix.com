-- Academic profile fields used by Profile Studio (Academics & Major).

alter table public.profiles
  add column if not exists university text,
  add column if not exists degree text;

comment on column public.profiles.university is 'University or institution name for the candidate profile.';
comment on column public.profiles.degree is 'Degree program or credential (e.g. B.S. Computer Science).';

update public.profiles
set university = school
where university is null
  and school is not null;

update public.profiles
set degree = major
where degree is null
  and major is not null;
