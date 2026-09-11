-- Candidates can update their own scorecard visibility.
-- profiles.id and profiles.user_id are uuid, matching auth.uid().

do $$
begin
  if to_regclass('public.profiles') is null then
    raise notice '0071: skip profiles visibility RLS — relation does not exist';
    return;
  end if;

  alter table public.profiles enable row level security;
  alter table public.profiles force row level security;

  drop policy if exists "Users can update their own profile" on public.profiles;
  create policy "Users can update their own profile"
    on public.profiles
    for update
    to authenticated
    using (auth.uid() = id or auth.uid() = user_id)
    with check (auth.uid() = id or auth.uid() = user_id);

  grant update on table public.profiles to authenticated;
end;
$$;

do $$
begin
  if to_regclass('public.profiles') is null then
    return;
  end if;

  grant update (is_publicly_visible) on table public.profiles to authenticated;
exception
  when undefined_column then
    raise notice '0071: is_publicly_visible grant skipped — column missing';
end;
$$;

do $$
begin
  if to_regclass('public.profiles') is null then
    return;
  end if;

  grant update (is_visible_in_pool) on table public.profiles to authenticated;
exception
  when undefined_column then
    raise notice '0071: is_visible_in_pool grant skipped — column missing';
end;
$$;
