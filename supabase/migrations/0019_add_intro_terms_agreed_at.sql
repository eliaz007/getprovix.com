-- Record when an employer accepted Provix intro terms.

alter table public.intro_requests
  add column if not exists terms_agreed_at timestamptz;

comment on column public.intro_requests.terms_agreed_at is 'Timestamp when the employer accepted Provix terms of service and direct placement policy.';
comment on column public.intro_requests.terms_accepted is 'Employer agreed to Provix terms of service and direct placement policy (terms_agreed).';
