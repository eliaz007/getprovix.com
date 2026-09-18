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

const JOB_FEED_LIMIT = 20;
const JOB_FEED_TIMEOUT_MS = 8000;

async function withJobFeedTimeout<T>(
  promise: PromiseLike<T>,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${JOB_FEED_TIMEOUT_MS}ms`));
        }, JOB_FEED_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function logJobFeed(
  label: string,
  startedAt: number,
  count: number,
  error: JobFeedError | { message: string } | null
) {
  const ms = Math.round(
    (typeof performance !== "undefined" ? performance.now() : Date.now()) -
      startedAt
  );
  if (error) {
    console.warn(`[jobs] ${label} failed`, {
      ms,
      message: error.message,
      details: "details" in error ? error.details : undefined,
      hint: "hint" in error ? error.hint : undefined,
    });
    return;
  }
  console.info(`[jobs] ${label}`, { ms, count, limit: JOB_FEED_LIMIT });
}

export async function fetchPublicJobFeed(supabase: SupabaseClient): Promise<{
  data: JobRow[];
  error: JobFeedError | null;
}> {
  const startedAt =
    typeof performance !== "undefined" ? performance.now() : Date.now();

  try {
    const first = await withJobFeedTimeout(
      supabase
        .from("jobs")
        .select(JOB_FEED_COLUMNS)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(JOB_FEED_LIMIT),
      "public job feed"
    );

    const result = shouldFallBackToLegacyColumns(first.error)
      ? await withJobFeedTimeout(
          supabase
            .from("jobs")
            .select(JOB_FEED_COLUMNS_LEGACY)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(JOB_FEED_LIMIT),
          "public job feed (legacy columns)"
        )
      : first;

    if (result.error) {
      logJobFeed("public feed", startedAt, 0, result.error);
      return { data: [], error: result.error };
    }

    const data = (result.data ?? []) as JobRow[];
    logJobFeed("public feed", startedAt, data.length, null);
    return { data, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Job feed failed.";
    logJobFeed("public feed", startedAt, 0, { message });
    return { data: [], error: { message } };
  }
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

export async function deleteOwnedJob(
  supabase: SupabaseClient,
  jobId: string,
  ownerId: string
): Promise<{ deletedId: string | null; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from("jobs")
    .delete()
    .eq("id", jobId)
    .eq("employer_id", ownerId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { deletedId: null, error };
  }

  const deletedId =
    data && typeof data.id === "string" && data.id.trim() ? data.id : null;

  return { deletedId, error: null };
}
