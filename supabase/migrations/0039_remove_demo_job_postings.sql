-- Remove placeholder/demo job postings that were created during testing.

delete from public.job_applications
where job_id in (
  select id
  from public.jobs
  where trim(coalesce(company, '')) ilike 'Acme Talent Partners'
    or coalesce(salary_range, '') ilike '%10,000%'
    or regexp_replace(coalesce(salary_range, ''), '[^0-9]', '', 'g') = '10000'
);

delete from public.jobs
where trim(coalesce(company, '')) ilike 'Acme Talent Partners'
  or coalesce(salary_range, '') ilike '%10,000%'
  or regexp_replace(coalesce(salary_range, ''), '[^0-9]', '', 'g') = '10000';
