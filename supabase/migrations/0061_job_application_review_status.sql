-- Employer hiring pipeline statuses for candidates who expressed interest.
-- New interest / intro requested / rejected. Contact unlock stays a separate flag.

alter table public.job_applications
  add column if not exists review_status text;

update public.job_applications
set review_status = 'new'
where review_status is null or btrim(review_status) = '';

alter table public.job_applications
  alter column review_status set default 'new';

alter table public.job_applications
  drop constraint if exists job_applications_review_status_check;

alter table public.job_applications
  add constraint job_applications_review_status_check
  check (review_status in ('new', 'intro_requested', 'rejected'));

alter table public.job_applications
  alter column review_status set not null;

comment on column public.job_applications.review_status is
  'Employer pipeline status: new, intro_requested, or rejected.';
