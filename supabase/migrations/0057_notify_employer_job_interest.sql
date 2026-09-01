-- Notify employers when a candidate expresses interest in a job.
-- job_applications is the connections table linking candidate_id + job_id.

create or replace function public.notify_employer_of_job_interest()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  listing_title text;
  employer uuid;
begin
  select j.title, j.employer_id
    into listing_title, employer
  from public.jobs j
  where j.id = new.job_id;

  if employer is null or employer = new.candidate_id then
    return new;
  end if;

  insert into public.notifications (user_id, job_id, message, is_read)
  values (
    employer,
    new.job_id,
    format(
      'A candidate expressed interest in your role: %s',
      coalesce(nullif(trim(listing_title), ''), 'Open Role')
    ),
    false
  );

  return new;
end;
$$;

drop trigger if exists job_applications_notify_employer on public.job_applications;
create trigger job_applications_notify_employer
  after insert on public.job_applications
  for each row
  execute procedure public.notify_employer_of_job_interest();

alter table public.job_applications replica identity full;
alter table public.notifications replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.job_applications;
exception
  when duplicate_object then
    null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then
    null;
end $$;
