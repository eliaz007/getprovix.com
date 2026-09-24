-- Screening jobs return 202 immediately and finish in the background.
-- status lets the employer UI distinguish a pending queue row from a finished audit.
-- Realtime delivers pending -> processing -> completed/failed to the open panel.

do $$
begin
  if to_regclass('public.candidate_screenings') is null then
    raise notice '0070: skip candidate_screenings status — relation does not exist';
    return;
  end if;

  alter table public.candidate_screenings
    add column if not exists status text;

  update public.candidate_screenings
  set status = 'completed'
  where status is null
    and integrity_score is not null;

  update public.candidate_screenings
  set status = 'pending'
  where status is null;

  alter table public.candidate_screenings
    alter column status set default 'pending';

  alter table public.candidate_screenings
    alter column status set not null;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'candidate_screenings_status_check'
  ) then
    alter table public.candidate_screenings
      add constraint candidate_screenings_status_check
      check (status in ('pending', 'processing', 'completed', 'failed'));
  end if;

  comment on column public.candidate_screenings.status is
    'Background screening job state: pending, processing, completed, or failed.';

  alter table public.candidate_screenings replica identity full;
end;
$$;

do $$
begin
  if to_regclass('public.candidate_screenings') is null then
    return;
  end if;

  alter publication supabase_realtime add table public.candidate_screenings;
exception
  when duplicate_object then
    null;
end;
$$;
