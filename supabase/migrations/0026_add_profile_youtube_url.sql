-- Video intro / demo link for candidate Profile Studio (Portfolio tab).

alter table public.profiles
  add column if not exists youtube_url text;

comment on column public.profiles.youtube_url is 'YouTube video intro or demo link for the candidate profile.';
