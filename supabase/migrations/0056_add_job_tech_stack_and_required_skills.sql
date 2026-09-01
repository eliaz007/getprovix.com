-- Split the combined jobs.tags field into tech stack vs required skills.
-- tech_stack is nullable so non-technical roles can omit tools/languages.

alter table public.jobs
  add column if not exists tech_stack text[] null;

alter table public.jobs
  add column if not exists required_skills text[] not null default '{}';

comment on column public.jobs.tech_stack is
  'Optional tools, languages, and frameworks (React, TypeScript, Next.js). Null for non-technical roles.';

comment on column public.jobs.required_skills is
  'Methodologies, experience, and general requirements. Comma-separated on input, stored as text[].';

update public.jobs
set required_skills = tags
where
  coalesce(cardinality(required_skills), 0) = 0
  and coalesce(cardinality(tags), 0) > 0;
