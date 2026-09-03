-- Let candidates trash or dismiss intro requests without deleting the row.

alter table public.intro_requests
  add column if not exists candidate_dismissed_at timestamptz;

comment on column public.intro_requests.candidate_dismissed_at is
  'When the candidate dismissed this intro request from their inbox.';

create index if not exists intro_requests_candidate_dismissed_at_idx
  on public.intro_requests (candidate_id, candidate_dismissed_at);

alter table public.intro_requests
  drop constraint if exists intro_requests_status_check;

alter table public.intro_requests
  add constraint intro_requests_status_check
  check (
    status in (
      'pending',
      'accepted',
      'declined',
      'dismissed',
      'trashed',
      'pending_admin_approval',
      'approved_intro_sent',
      'interviewing',
      'hired',
      'passed',
      'approved',
      'APPROVED',
      'rejected',
      'REJECTED',
      'completed'
    )
  );
