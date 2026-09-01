import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeStringArray } from "@/lib/match-heuristic";
import {
  isSupabaseSchemaError,
  schemaErrorMentionsColumn,
} from "@/lib/supabase-schema-errors";

export type JobRow = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  salary_range: string | null;
  tags: string[] | null;
  tech_stack?: string[] | null;
  required_skills?: string[] | null;
  employer_id: string;
  status: string | null;
  created_at?: string | null;
  description?: string | null;
};

export const JOB_FEED_COLUMNS =
  "id, title, company, location, salary_range, tags, tech_stack, required_skills, employer_id, status, created_at";

const JOB_FEED_COLUMNS_LEGACY =
  "id, title, company, location, salary_range, tags, employer_id, status, created_at";

type JobFeedError = {
  message: string;
  details?: string | null;
  hint?: string | null;
};

export function parseJobListInput(value: unknown): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of normalizeStringArray(value)) {
    const key = item.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }

  return result;
}

export function jobDisplayTags(job: {
  tech_stack?: string[] | string | null;
  required_skills?: string[] | string | null;
  tags?: string[] | string | null;
}): string[] {
  const combined = parseJobListInput([
    ...normalizeStringArray(job.tech_stack),
    ...normalizeStringArray(job.required_skills),
  ]);

  if (combined.length > 0) {
    return combined;
  }

  return parseJobListInput(job.tags);
}

export function toJobMatchJobPayload(job: JobRow) {
  const techStack = parseJobListInput(job.tech_stack);
  const requiredSkills = parseJobListInput(job.required_skills);

  return {
    jobId: job.id,
    title: job.title ?? "",
    company: job.company ?? "",
    techStack,
    requiredSkills:
      requiredSkills.length > 0 ? requiredSkills : parseJobListInput(job.tags),
    description: job.description ?? "",
  };
}

function shouldFallBackToLegacyColumns(error: JobFeedError | null): boolean {
  return (
    isSupabaseSchemaError(error) &&
    (schemaErrorMentionsColumn(error, "tech_stack") ||
      schemaErrorMentionsColumn(error, "required_skills"))
  );
}

export async function fetchPublicJobFeed(supabase: SupabaseClient): Promise<{
  data: JobRow[];
  error: JobFeedError | null;
}> {
  const first = await supabase
    .from("jobs")
    .select(JOB_FEED_COLUMNS)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  const result = shouldFallBackToLegacyColumns(first.error)
    ? await supabase
        .from("jobs")
        .select(JOB_FEED_COLUMNS_LEGACY)
        .eq("status", "active")
        .order("created_at", { ascending: false })
    : first;

  if (result.error) {
    return { data: [], error: result.error };
  }

  return { data: (result.data ?? []) as JobRow[], error: null };
}

export async function fetchDashboardJobs(supabase: SupabaseClient): Promise<{
  data: JobRow[];
  error: { message: string } | null;
}> {
  const first = await supabase
    .from("jobs")
    .select(JOB_FEED_COLUMNS)
    .order("created_at", { ascending: false });

  const result = shouldFallBackToLegacyColumns(first.error)
    ? await supabase
        .from("jobs")
        .select(JOB_FEED_COLUMNS_LEGACY)
        .order("created_at", { ascending: false })
    : first;

  if (result.error) {
    return { data: [], error: result.error };
  }

  return { data: (result.data ?? []) as JobRow[], error: null };
}
