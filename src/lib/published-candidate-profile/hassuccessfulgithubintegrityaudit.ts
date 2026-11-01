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
import type { PublishedCandidateProfileRow } from "./publishedcandidateprofilerow";
import { asRecord } from "./asrecord";
import { readGitHubAuditContext } from "./readgithubauditcontext";
import { resolveStoredIntegrityScore } from "./resolvestoredintegrityscore";

/**
 * True when a GitHub integrity audit finished and produced repo artifacts
 * (or a persisted integrity score from an older audit that predated github_audit).
 */
export function hasSuccessfulGitHubIntegrityAudit(
  row:
    | Pick<
        PublishedCandidateProfileRow,
        "integrity_score" | "audit_data" | "github_audit"
      >
    | null
    | undefined
): boolean {
  if (!row) {
    return false;
  }

  if (resolveStoredIntegrityScore(row) == null) {
    return false;
  }

  const auditData = asRecord(row.audit_data);
  const githubAudit = readGitHubAuditContext(
    row.github_audit ?? auditData?.github_audit
  );

  if (!githubAudit) {
    return true;
  }

  return githubAuditHasFetchedArtifacts(githubAudit);
}
