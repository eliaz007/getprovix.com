-- Profile Studio fields for candidates (Overview, Academics, Portfolio tabs).

alter table public.profiles
  add column if not exists bio text,
  add column if not exists school text,
  add column if not exists skills text[],
  add column if not exists portfolio_url text;

comment on column public.profiles.bio is 'Candidate bio / headline shown in Profile Studio.';
comment on column public.profiles.school is 'School or institution for the candidate profile.';
comment on column public.profiles.skills is 'Skill tags for matching and profile display.';
comment on column public.profiles.portfolio_url is 'GitHub, portfolio, or personal site URL.';
