-- Allow uppercase APPROVED status for admin pipeline updates.

alter table public.intro_requests
  drop constraint if exists intro_requests_status_check;

alter table public.intro_requests
  add constraint intro_requests_status_check
  check (
    status in (
      'pending',
      'approved',
      'APPROVED',
      'rejected',
      'REJECTED',
      'declined',
      'completed'
    )
  );
