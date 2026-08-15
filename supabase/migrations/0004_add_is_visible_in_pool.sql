-- Talent Pool Visibility: candidates appear in the employer pool unless they
-- opt out. Default is ON (true) so new and existing rows are visible.

alter table public.profiles
  add column if not exists is_visible_in_pool boolean not null default true;

comment on column public.profiles.is_visible_in_pool is 'When true, the candidate is listed in the employer talent pool.';
