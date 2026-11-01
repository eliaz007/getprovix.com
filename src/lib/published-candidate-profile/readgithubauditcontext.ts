import {
  isEmployeeRole,
  isEmployerRole,
} from "@/lib/dashboard-account";
import { DEFAULT_AVAILABILITY_STATUS } from "@/lib/availability-status";
import { parseExecutiveBrief } from "@/lib/executive-brief";
import {
  githubAuditHasFetchedArtifacts,
  type GitHubAuditContext,
} from "@/lib/github-audit";
import { parseRepoFilesystemEvidence } from "@/lib/repo-filesystem";
import { profileRowIsPublicToEmployers } from "@/lib/opportunities-metrics";
import { clampScore0to100 } from "@/lib/score-scale";
import {
  hasUsableExternalProjects,
  normalizeExternalProjects,
} from "@/lib/external-projects";
import { hasUsableGitHubAuditTarget } from "@/lib/validate-github-url";
import { hasQualifyingTalentPoolAudit } from "@/lib/talent-pool-visibility";
import {
  normalizeContractHourlyRate,
  normalizeContractHoursPerWeek,
} from "@/lib/contract-availability";
import {
  DEFAULT_CANDIDATE_TIMEZONE,
  DEFAULT_WORK_PREFERENCE,
} from "@/lib/work-preference";
import { asRecord } from "./asrecord";

export function readGitHubAuditContext(value: unknown): GitHubAuditContext | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  return {
    repo_url: typeof record.repo_url === "string" ? record.repo_url : "",
    owner: typeof record.owner === "string" ? record.owner : "",
    repo: typeof record.repo === "string" ? record.repo : "",
    stars: typeof record.stars === "number" ? record.stars : null,
    forks: typeof record.forks === "number" ? record.forks : null,
    is_fork: record.is_fork === true,
    parent_full_name:
      typeof record.parent_full_name === "string" && record.parent_full_name.trim()
        ? record.parent_full_name.trim()
        : null,
    template_repository:
      typeof record.template_repository === "string" &&
      record.template_repository.trim()
        ? record.template_repository.trim()
        : null,
    is_upstream_derivative: record.is_upstream_derivative === true,
    created_at: typeof record.created_at === "string" ? record.created_at : null,
    language: typeof record.language === "string" ? record.language : null,
    commit_count_sampled:
      typeof record.commit_count_sampled === "number"
        ? record.commit_count_sampled
        : 0,
    commit_dates: Array.isArray(record.commit_dates)
      ? record.commit_dates.filter((date): date is string => typeof date === "string")
      : [],
    commit_stats: Array.isArray(record.commit_stats)
      ? record.commit_stats.flatMap((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return [];
          }
          const row = entry as Record<string, unknown>;
          if (typeof row.date !== "string" || !row.date.trim()) {
            return [];
          }
          return [
            {
              date: row.date.trim(),
              additions:
                typeof row.additions === "number" ? row.additions : undefined,
              deletions:
                typeof row.deletions === "number" ? row.deletions : undefined,
              filesChanged:
                typeof row.filesChanged === "number"
                  ? row.filesChanged
                  : undefined,
              message:
                typeof row.message === "string" ? row.message : undefined,
              authorLogin:
                typeof row.authorLogin === "string"
                  ? row.authorLogin
                  : undefined,
              authorName:
                typeof row.authorName === "string" ? row.authorName : undefined,
              sha: typeof row.sha === "string" ? row.sha : undefined,
            },
          ];
        })
      : [],
    commit_history_fetched:
      record.commit_history_fetched === true ||
      (record.commit_history_fetched !== false &&
        ((Array.isArray(record.commit_dates) &&
          record.commit_dates.length > 0) ||
          (Array.isArray(record.commit_stats) &&
            record.commit_stats.length > 0))),
    readme_excerpt:
      typeof record.readme_excerpt === "string" ? record.readme_excerpt : null,
    fetch_warnings: Array.isArray(record.fetch_warnings)
      ? record.fetch_warnings.filter(
          (warning): warning is string => typeof warning === "string"
        )
      : [],
    filesystem: parseRepoFilesystemEvidence(record.filesystem),
    executiveBrief: parseExecutiveBrief(record.executiveBrief),
  };
}
