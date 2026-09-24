-- Store candidate education as a JSON array (max 3). Education is optional.

alter table public.profiles
  add column if not exists education jsonb not null default '[]'::jsonb;

update public.profiles
set education = jsonb_build_array(
  jsonb_strip_nulls(
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'institution', coalesce(nullif(trim(coalesce(university, '')), ''), nullif(trim(coalesce(school, '')), '')),
      'credentialType',
        case
          when lower(coalesce(degree, major, '')) ~ 'phd|doctor|master' then 'Master''s/PhD'
          when lower(coalesce(degree, major, '')) ~ 'associate' then 'Associate'
          when lower(coalesce(degree, major, '')) ~ 'bootcamp|certificate|certificat' then 'Bootcamp/Certificate'
          when lower(coalesce(degree, major, '')) ~ 'bachelor|b\.s|b\.a' then 'Bachelor''s'
          else 'Other'
        end,
      'fieldOfStudy', coalesce(nullif(trim(coalesce(major, '')), ''), nullif(trim(coalesce(degree, '')), '')),
      'graduationYear',
        case
          when graduation_year is not null then graduation_year::text
          else ''
        end
    )
  )
)
where coalesce(education, '[]'::jsonb) = '[]'::jsonb
  and (
    nullif(trim(coalesce(university, '')), '') is not null
    or nullif(trim(coalesce(school, '')), '') is not null
    or nullif(trim(coalesce(major, '')), '') is not null
    or nullif(trim(coalesce(degree, '')), '') is not null
    or graduation_year is not null
  );

alter table public.profiles
  drop constraint if exists profiles_education_array_check;

alter table public.profiles
  add constraint profiles_education_array_check
  check (
    jsonb_typeof(education) = 'array'
    and jsonb_array_length(education) <= 3
  );

comment on column public.profiles.education is
  'Optional JSON array of up to 3 education entries: institution, credentialType, fieldOfStudy, graduationYear.';

create or replace function public.profile_is_verified_on_provix(p public.profiles)
returns boolean
language sql
stable
as $$
  select
    (
      nullif(trim(coalesce(p.full_name, '')), '') is not null
      or nullif(trim(coalesce(p.name, '')), '') is not null
      or nullif(trim(coalesce(p.first_name, '')), '') is not null
      or nullif(trim(coalesce(p.last_name, '')), '') is not null
    )
    and (
      nullif(trim(coalesce(p.job_title, '')), '') is not null
      or nullif(trim(coalesce(p.headline, '')), '') is not null
    )
    and nullif(trim(coalesce(p.bio, '')), '') is not null
    and exists (
      select 1
      from unnest(coalesce(p.skills, '{}'::text[])) as skill
      where nullif(trim(skill), '') is not null
    )
    and nullif(trim(coalesce(p.experience_level, '')), '') is not null
    and (
      nullif(trim(coalesce(p.availability_status, '')), '') is not null
      or nullif(trim(coalesce(p.availability, '')), '') is not null
    )
    and nullif(trim(coalesce(p.work_preference, '')), '') is not null
    and nullif(trim(coalesce(p.timezone, '')), '') is not null
    and (
      coalesce(p.portfolio_url, '') ~* 'github\.com'
      or exists (
        select 1
        from public.external_projects ep
        where ep.user_id = p.id
          and nullif(trim(coalesce(ep.project_title, '')), '') is not null
          and (
            nullif(trim(coalesce(ep.project_url, '')), '') is not null
            or nullif(trim(coalesce(ep.description, '')), '') is not null
          )
      )
    )
    and (
      public.profile_has_successful_github_integrity_audit(p)
      or public.profile_has_successful_external_projects_audit(p)
    );
$$;

comment on function public.profile_is_verified_on_provix(public.profiles) is
  'True when required Profile Studio fields are filled and a GitHub or external-project integrity audit has succeeded. Education is optional.';

create or replace function public.get_public_profile_by_slug(slug text)
returns json
language sql
security definer
set search_path = public
stable
as $$
  select json_build_object(
    'id', p.id,
    'profile_slug', p.profile_slug,
    'full_name', p.full_name,
    'name', p.name,
    'first_name', p.first_name,
    'last_name', p.last_name,
    'job_title', p.job_title,
    'headline', p.headline,
    'bio', p.bio,
    'skills', coalesce(p.skills, '{}'::text[]),
    'portfolio_url', p.portfolio_url,
    'youtube_url', p.youtube_url,
    'codename_alias', p.codename_alias,
    'availability_status', p.availability_status,
    'availability', p.availability,
    'university', coalesce(nullif(trim(p.university), ''), p.school),
    'major', coalesce(nullif(trim(p.major), ''), p.degree),
    'school', coalesce(nullif(trim(p.school), ''), p.university),
    'degree', coalesce(nullif(trim(p.degree), ''), p.major),
    'gpa', p.gpa,
    'graduation_year', p.graduation_year,
    'education', coalesce(p.education, '[]'::jsonb),
    'experience_level', p.experience_level,
    'country', p.country,
    'timezone', p.timezone,
    'work_preference', p.work_preference,
    'integrity_score', public.resolve_profile_integrity_score(
      p.integrity_score,
      p.audit_data
    ),
    'has_github_repos', coalesce(nullif(trim(p.portfolio_url), ''), null) is not null,
    'is_verified_on_provix', public.profile_is_verified_on_provix(p)
  )
  from public.profiles p
  where lower(p.profile_slug) = lower(get_public_profile_by_slug.slug)
    and coalesce(p.is_visible_in_pool, false) = true
  limit 1;
$$;

notify pgrst, 'reload schema';
