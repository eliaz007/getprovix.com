-- Repair script if 0027 partially failed because status updates ran before the constraint was dropped.

alter table public.intro_requests
  add column if not exists agreed_first_year_compensation numeric,
  add column if not exists candidate_bonus_allocated numeric;

alter table public.intro_requests
  drop constraint if exists intro_requests_status_check;

update public.intro_requests
set status = 'pending_admin_approval'
where lower(status) = 'pending';

update public.intro_requests
set status = 'approved_intro_sent'
where lower(status) in ('approved', 'completed');

update public.intro_requests
set status = 'passed'
where lower(status) in ('rejected', 'declined');

alter table public.intro_requests
  drop constraint if exists intro_requests_status_check;

alter table public.intro_requests
  add constraint intro_requests_status_check
  check (
    status in (
      'pending_admin_approval',
      'approved_intro_sent',
      'interviewing',
      'hired',
      'passed',
      'pending',
      'approved',
      'APPROVED',
      'rejected',
      'REJECTED',
      'declined',
      'completed'
    )
  );
