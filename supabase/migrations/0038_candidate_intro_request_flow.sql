-- Candidate-driven intro request flow with accept/decline.

alter table public.intro_requests
  add column if not exists company_email text,
  add column if not exists target_role text,
  add column if not exists compensation_range text,
  add column if not exists tos_accepted_at timestamptz,
  add column if not exists response_token uuid default gen_random_uuid();

update public.intro_requests
set
  company_email = coalesce(company_email, work_email),
  target_role = coalesce(target_role, role_title),
  compensation_range = coalesce(compensation_range, compensation_band),
  tos_accepted_at = coalesce(tos_accepted_at, terms_agreed_at)
where company_email is null
   or target_role is null
   or compensation_range is null
   or tos_accepted_at is null;

update public.intro_requests
set response_token = gen_random_uuid()
where response_token is null;

alter table public.intro_requests
  alter column response_token set not null;

create unique index if not exists intro_requests_response_token_idx
  on public.intro_requests (response_token);

alter table public.intro_requests
  drop constraint if exists intro_requests_status_check;

alter table public.intro_requests
  add constraint intro_requests_status_check
  check (
    status in (
      'pending',
      'accepted',
      'declined',
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

comment on column public.intro_requests.company_email is 'Employer work email for intro coordination.';
comment on column public.intro_requests.target_role is 'Role the employer is hiring for.';
comment on column public.intro_requests.compensation_range is 'Target compensation band for the role.';
comment on column public.intro_requests.tos_accepted_at is 'When the employer accepted Provix placement terms.';
comment on column public.intro_requests.response_token is 'Signed token for candidate email accept/decline links.';

drop policy if exists "Candidates can view intro requests for them" on public.intro_requests;
create policy "Candidates can view intro requests for them"
  on public.intro_requests
  for select
  using (auth.uid()::text = candidate_id);

drop policy if exists "Candidates can update their intro request status" on public.intro_requests;
create policy "Candidates can update their intro request status"
  on public.intro_requests
  for update
  using (auth.uid()::text = candidate_id)
  with check (auth.uid()::text = candidate_id);
