-- Public seed candidates for homepage preview and talent directory parity.
create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  alias text,
  role text not null,
  skills text[] not null default '{}',
  tags text[] not null default '{}',
  integrity_score integer,
  execution_score integer,
  score integer,
  bio text,
  repos_count integer not null default 0,
  audited_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.candidates is 'Curated seed candidates surfaced on the marketing homepage and talent previews.';

alter table public.candidates enable row level security;

drop policy if exists "Anyone can read seed candidates" on public.candidates;
create policy "Anyone can read seed candidates"
  on public.candidates
  for select
  using (true);

insert into public.candidates (
  id,
  name,
  role,
  skills,
  tags,
  integrity_score,
  execution_score,
  score,
  bio,
  repos_count,
  audited_at,
  created_at
) values
  (
    'a8010001-0000-4000-8000-000000000001',
    'Priya Nair',
    'AI/ML Engineer',
    array['PyTorch', 'RAG Pipelines', 'MLOps'],
    array['PyTorch', 'RAG Pipelines', 'MLOps'],
    98,
    98,
    98,
    'Shipped production RAG systems with traceable eval harnesses. Commit history shows deep model iteration.',
    11,
    '2026-08-14T18:00:00.000Z',
    '2026-08-14T18:00:00.000Z'
  ),
  (
    'a8010001-0000-4000-8000-000000000002',
    'Marcus Vance',
    'Senior Full-Stack',
    array['Next.js', 'TypeScript', 'Supabase'],
    array['Next.js', 'TypeScript', 'Supabase'],
    96,
    96,
    96,
    'Architected production SaaS boilerplates with RLS security policies and clean TypeScript types.',
    9,
    '2026-08-13T16:30:00.000Z',
    '2026-08-13T16:30:00.000Z'
  ),
  (
    'a8010001-0000-4000-8000-000000000003',
    'Elena Rostova',
    'Systems Backend',
    array['Go', 'Rust', 'gRPC', 'Distributed Systems'],
    array['Go', 'Rust', 'gRPC', 'Distributed Systems'],
    99,
    99,
    99,
    'Engineered low-latency event-driven workers handling 20k+ req/sec with zero-allocation buffers.',
    10,
    '2026-08-12T12:00:00.000Z',
    '2026-08-12T12:00:00.000Z'
  ),
  (
    'a8010001-0000-4000-8000-000000000004',
    'Devon Reed',
    'DevOps / Platform',
    array['Kubernetes', 'Terraform', 'AWS', 'Docker'],
    array['Kubernetes', 'Terraform', 'AWS', 'Docker'],
    94,
    94,
    94,
    'Maintains production multi-region Terraform modules and automated GitHub Actions CI/CD pipelines.',
    8,
    '2026-08-11T09:15:00.000Z',
    '2026-08-11T09:15:00.000Z'
  ),
  (
    'a8010001-0000-4000-8000-000000000005',
    'Sofia Chen',
    'Mobile Engineer',
    array['React Native', 'Swift', 'iOS Architecture'],
    array['React Native', 'Swift', 'iOS Architecture'],
    95,
    95,
    95,
    'Built offline-first React Native architecture with smooth 60fps reanimated physics and SQLite sync.',
    7,
    '2026-08-10T14:45:00.000Z',
    '2026-08-10T14:45:00.000Z'
  )
on conflict (id) do update set
  name = excluded.name,
  role = excluded.role,
  skills = excluded.skills,
  tags = excluded.tags,
  integrity_score = excluded.integrity_score,
  execution_score = excluded.execution_score,
  score = excluded.score,
  bio = excluded.bio,
  repos_count = excluded.repos_count,
  audited_at = excluded.audited_at;
