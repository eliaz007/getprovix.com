-- Let the confirmation callback set is_verified even when JWT role is not visible
-- to auth.role() (a common service-role trigger miss).

create or replace function public.protect_employer_is_verified()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('app.allow_employer_verify', true), '') = 'true' then
    return new;
  end if;

  if new.is_verified is true and old.is_verified is not true then
    if coalesce(auth.role(), '') not in ('service_role', 'supabase_admin')
       and current_setting('role', true) is distinct from 'service_role' then
      new.is_verified := old.is_verified;
      new.email_verified_at := old.email_verified_at;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.mark_employer_email_verified(
  p_user_id uuid,
  p_email text
)
returns table (id uuid, is_verified boolean)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  normalized_email text;
begin
  if p_user_id is null then
    return;
  end if;

  normalized_email := nullif(lower(trim(coalesce(p_email, ''))), '');
  perform set_config('app.allow_employer_verify', 'true', true);

  return query
  update public.profiles as p
  set
    is_verified = true,
    email_verified_at = now(),
    contact_email = coalesce(normalized_email, p.contact_email),
    email = coalesce(normalized_email, p.email)
  where p.id = p_user_id
     or p.user_id = p_user_id
  returning p.id, p.is_verified;
end;
$$;

revoke all on function public.mark_employer_email_verified(uuid, text) from public;
revoke all on function public.mark_employer_email_verified(uuid, text) from anon, authenticated;
grant execute on function public.mark_employer_email_verified(uuid, text) to service_role;
