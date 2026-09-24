-- Link GitHub OAuth identity onto profiles so talent-pool visibility
-- can require a verified GitHub account, not just a pasted URL.

alter table public.profiles
  add column if not exists github_username text;

alter table public.profiles
  add column if not exists github_verified boolean not null default false;

comment on column public.profiles.github_username is
  'GitHub login from OAuth (user_name / preferred_username). Null when the account has no GitHub identity.';

comment on column public.profiles.github_verified is
  'True only when the user authenticated or linked a GitHub OAuth identity.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  has_github boolean;
  github_handle text;
begin
  has_github :=
    coalesce(new.raw_app_meta_data ->> 'provider', '') = 'github'
    or coalesce(new.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'github';

  github_handle := nullif(
    trim(both from regexp_replace(
      coalesce(
        new.raw_user_meta_data ->> 'user_name',
        new.raw_user_meta_data ->> 'preferred_username',
        ''
      ),
      '^@+',
      ''
    )),
    ''
  );

  insert into public.profiles (
    id,
    user_id,
    full_name,
    avatar_url,
    role,
    graduation_year,
    status,
    major,
    is_visible_in_pool,
    is_verified,
    github_username,
    github_verified
  )
  values (
    new.id,
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'business_name',
      new.raw_user_meta_data ->> 'name',
      nullif(
        trim(
          coalesce(new.raw_user_meta_data ->> 'first_name', '') || ' ' ||
          coalesce(new.raw_user_meta_data ->> 'last_name', '')
        ),
        ''
      )
    ),
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    ),
    null,
    nullif(new.raw_user_meta_data ->> 'graduation_year', '')::integer,
    new.raw_user_meta_data ->> 'status',
    new.raw_user_meta_data ->> 'major',
    false,
    false,
    case when has_github then github_handle else null end,
    has_github
  );

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates a profiles row on auth signup with role NULL. GitHub OAuth sets github_username + github_verified; email/other providers leave them unset.';
