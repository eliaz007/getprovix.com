-- The job-interest trigger and API insert a notifications.title value, but
-- 0024 created the table without that column. Add it so those inserts succeed.

alter table public.notifications
  add column if not exists title text not null default 'New Candidate Interest';

comment on column public.notifications.title is
  'Short heading for the in-app notification, e.g. New Candidate Interest.';
