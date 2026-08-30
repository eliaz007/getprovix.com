-- Live employer talent pool: deliver profile visibility changes over Realtime.
-- Replica identity FULL lets employers receive DELETE when a row no longer
-- matches the "visible talent pool" RLS policy after a hide.

alter table public.profiles replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception
  when duplicate_object then
    null;
end $$;
