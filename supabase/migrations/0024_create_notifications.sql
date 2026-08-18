-- In-app notifications for employers (e.g. candidate job interest).

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete set null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.notifications is 'User notifications surfaced in the dashboard bell menu.';

create index if not exists notifications_user_id_idx on public.notifications (user_id);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, is_read, created_at desc);
create index if not exists notifications_created_at_idx
  on public.notifications (created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "Users can view their own notifications" on public.notifications;
create policy "Users can view their own notifications"
  on public.notifications
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can update their own notifications" on public.notifications;
create policy "Users can update their own notifications"
  on public.notifications
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Applicants can notify job owners" on public.notifications;
create policy "Applicants can notify job owners"
  on public.notifications
  for insert
  with check (
    auth.uid() is not null
    and exists (
      select 1
      from public.job_applications ja
      inner join public.jobs j on j.id = ja.job_id
      where ja.candidate_id = auth.uid()
        and j.id = notifications.job_id
        and j.employer_id = notifications.user_id
    )
  );
