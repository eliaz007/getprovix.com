-- Cap candidate bios at 350 characters. Employer company bios on the same
-- column are left unchanged.

update public.profiles
set bio = left(bio, 350)
where bio is not null
  and char_length(bio) > 350
  and coalesce(role, '') not in ('employer', 'business');

alter table public.profiles
  drop constraint if exists profiles_candidate_bio_length_check;

alter table public.profiles
  add constraint profiles_candidate_bio_length_check
  check (
    bio is null
    or char_length(bio) <= 350
    or coalesce(role, '') in ('employer', 'business')
  );

comment on column public.profiles.bio is
  'Candidate bio / headline (max 350 chars). Employer rows may store a company bio.';
