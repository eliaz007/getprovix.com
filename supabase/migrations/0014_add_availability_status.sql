-- Candidate hiring availability shown in Profile Studio and recruiter filters.
alter table public.profiles
  add column if not exists availability_status text not null default 'Available Now';

comment on column public.profiles.availability_status is
  'Candidate hiring availability: Available Now, Interviewing, or Not Available.';
