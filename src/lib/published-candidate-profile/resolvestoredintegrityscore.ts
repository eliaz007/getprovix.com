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
import { readNumericScore } from "./readnumericscore";
import { asRecord } from "./asrecord";

export function resolveStoredIntegrityScore(
  row: Pick<
    PublishedCandidateProfileRow,
    "integrity_score" | "audit_data"
  > | null | undefined
): number | null {
  if (!row) {
    return null;
  }

  const fromColumn = readNumericScore(row.integrity_score);
  if (fromColumn != null) {
    return fromColumn;
  }

  const auditData = asRecord(row.audit_data);
  return readNumericScore(auditData?.integrity_score);
}
