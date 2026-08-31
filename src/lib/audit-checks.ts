export type AuditCheckId =
  | "artifact_analysis"
  | "architecture_review"
  | "api_resiliency";

export type AuditCheck = {
  id: AuditCheckId;
  title: string;
  summary: string;
};

export const CANONICAL_AUDIT_CHECKS: readonly {
  id: AuditCheckId;
  title: string;
}[] = [
  { id: "artifact_analysis", title: "Artifact Analysis (Check 1)" },
  { id: "architecture_review", title: "Architecture Review (Check 2)" },
  {
    id: "api_resiliency",
    title: "API & Data Resiliency Check (Check 3)",
  },
] as const;

export function defaultAuditCheckSummary(id: AuditCheckId): string {
  switch (id) {
    case "artifact_analysis":
      return "Artifact evidence was too thin to verify README quality, commit history, or language signals against the claimed role.";
    case "architecture_review":
      return "Architecture signals were limited. No clear module structure, design notes, or system-level ownership could be confirmed from the provided artifacts.";
    case "api_resiliency":
      return "API and data-resiliency evidence was not found. Error handling, persistence, and production hardening could not be verified.";
  }
}

function parseCheckRecord(value: unknown): {
  id: string;
  title: string;
  summary: string;
} | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const summarySource =
    record.summary ?? record.analysis ?? record.body ?? record.text;
  const summary =
    typeof summarySource === "string" ? summarySource.trim() : "";

  if (!summary) {
    return null;
  }

  return {
    id: typeof record.id === "string" ? record.id.trim() : "",
    title: typeof record.title === "string" ? record.title.trim() : "",
    summary,
  };
}

export function normalizeAuditChecks(raw: unknown): AuditCheck[] {
  const parsed = Array.isArray(raw)
    ? raw
        .map(parseCheckRecord)
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
    : [];

  return CANONICAL_AUDIT_CHECKS.map((canonical, index) => {
    const byId = parsed.find((item) => item.id === canonical.id);
    const titleNeedle =
      canonical.title.split("(")[0]?.trim().toLowerCase() ?? "";
    const byTitle = parsed.find((item) =>
      item.title.toLowerCase().includes(titleNeedle)
    );
    const byIndex = parsed[index];
    const match = byId ?? byTitle ?? byIndex;

    return {
      id: canonical.id,
      title: canonical.title,
      summary: match?.summary || defaultAuditCheckSummary(canonical.id),
    };
  });
}
