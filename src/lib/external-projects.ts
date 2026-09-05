export type ExternalProjectRecord = {
  id?: string;
  project_title: string;
  project_url: string;
  description: string;
  created_at?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asTrimmedText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeExternalProject(
  value: unknown
): ExternalProjectRecord | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const project_title = asTrimmedText(
    record.project_title ?? record.projectTitle ?? record.title ?? record.name
  );
  const project_url = asTrimmedText(
    record.project_url ?? record.projectUrl ?? record.url ?? record.link
  );
  const description = asTrimmedText(
    record.description ??
      record.technical_breakdown ??
      record.technicalBreakdown ??
      record.summary
  );

  if (!project_title && !project_url && !description) {
    return null;
  }

  const id = asTrimmedText(record.id) || undefined;
  const created_at = asTrimmedText(record.created_at ?? record.createdAt) || undefined;

  return {
    ...(id ? { id } : {}),
    project_title,
    project_url,
    description,
    ...(created_at ? { created_at } : {}),
  };
}

export function normalizeExternalProjects(value: unknown): ExternalProjectRecord[] {
  if (!Array.isArray(value)) {
    const single = normalizeExternalProject(value);
    return single ? [single] : [];
  }

  return value
    .map(normalizeExternalProject)
    .filter((item): item is ExternalProjectRecord => item !== null);
}

export function hasUsableExternalProjects(
  projects: readonly ExternalProjectRecord[] | null | undefined
): boolean {
  if (!projects?.length) {
    return false;
  }

  return projects.some(
    (project) =>
      Boolean(project.project_title.trim()) &&
      (Boolean(project.project_url.trim()) || Boolean(project.description.trim()))
  );
}

export function mergeExternalProjects(
  ...lists: Array<readonly ExternalProjectRecord[] | null | undefined>
): ExternalProjectRecord[] {
  const merged: ExternalProjectRecord[] = [];
  const seen = new Set<string>();

  for (const list of lists) {
    if (!list) {
      continue;
    }

    for (const project of list) {
      const key = [
        project.id?.trim() || "",
        project.project_title.trim().toLowerCase(),
        project.project_url.trim().toLowerCase(),
      ].join("|");

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      merged.push(project);
    }
  }

  return merged;
}

export function parseWorkIsPrivate(value: unknown): boolean {
  if (value === true) {
    return true;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return (
      normalized === "true" ||
      normalized === "1" ||
      normalized === "on" ||
      normalized === "yes" ||
      normalized === "private" ||
      normalized === "enterprise"
    );
  }

  return false;
}

export function shouldUseExternalProjectFallback(options: {
  workIsPrivate: boolean;
  githubUrl: string;
  githubAuditSucceeded: boolean;
  hasExternalProjects: boolean;
}): boolean {
  if (!options.hasExternalProjects) {
    return false;
  }

  if (options.workIsPrivate) {
    return true;
  }

  if (!options.githubUrl.trim()) {
    return true;
  }

  return !options.githubAuditSucceeded;
}
