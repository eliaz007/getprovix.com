-- Parsed resume content for Proof of Work uploads and AI auditor cross-reference.

alter table public.profiles
  add column if not exists resume_text text,
  add column if not exists resume_filename text,
  add column if not exists resume_uploaded_at timestamptz;

comment on column public.profiles.resume_text is
  'Extracted plain text from the candidate resume upload (PDF or text). Used by the GitHub & Resume Auditor.';
comment on column public.profiles.resume_filename is
  'Original filename of the uploaded resume.';
comment on column public.profiles.resume_uploaded_at is
  'When the current resume file was last uploaded and parsed.';
