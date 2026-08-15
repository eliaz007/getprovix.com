-- Pro tier flags and candidate contact fields for employer unlock flow.

alter table public.profiles
  add column if not exists tier text default 'free',
  add column if not exists is_pro boolean not null default false,
  add column if not exists phone text,
  add column if not exists linkedin_url text,
  add column if not exists contact_email text;

comment on column public.profiles.tier is 'Subscription tier label (e.g. free, pro).';
comment on column public.profiles.is_pro is 'Whether the account has an active Pro subscription.';
comment on column public.profiles.phone is 'Contact phone for talent pool unlock (Pro employers).';
comment on column public.profiles.linkedin_url is 'LinkedIn profile URL for talent pool unlock.';
comment on column public.profiles.contact_email is 'Contact email shown to Pro employers.';

-- Employers may read visible talent-pool profiles (contact fields gated in app by Pro tier).
drop policy if exists "Employers can view visible talent pool profiles" on public.profiles;
create policy "Employers can view visible talent pool profiles"
  on public.profiles
  for select
  using (
    coalesce(is_visible_in_pool, false) = true
    and auth.uid() is not null
    and exists (
      select 1
      from public.profiles as viewer
      where viewer.id = auth.uid()
        and viewer.role in ('employer', 'business')
    )
  );
