import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { readJsonResponse } from "@/lib/read-json-response";
import { isEmployerRole } from "@/lib/dashboard-account";
import { parseGitHubUrl } from "@/lib/validate-github-url";
import type {
  RepoFilesystemEvidence,
  ScoreCapAudit,
} from "@/lib/repo-filesystem";
import { deriveDualModeScores } from "@/lib/audit-mode";
import { meetsProvixVerifiedGates } from "@/lib/audit-readiness";
import { computeProductionAuditMetrics } from "@/lib/production-audit-metrics";
import { clampScore0to100 } from "@/lib/score-scale";
import {
  findMentionedColumn,
  isSupabaseSchemaError,
} from "@/lib/supabase-schema-errors";
import {
  meetsTalentPoolAutoPublishCriteria,
  talentPoolMetadataDefaults,
  type PublishedCandidateProfileRow,
} from "@/lib/published-candidate-profile";
import { PRIVATE_AUDITED_REPO_LABEL } from "./private-audited-repo-label";

export function formatAuditedRepoLabel(url: string): string {
  const trimmed = url.trim();
  if (!trimmed || trimmed === PRIVATE_AUDITED_REPO_LABEL) {
    return PRIVATE_AUDITED_REPO_LABEL;
  }

  const parsed = parseGitHubUrl(trimmed);
  if (!parsed) {
    return trimmed || "Public repository";
  }

  return parsed.repo ? `${parsed.owner}/${parsed.repo}` : parsed.owner;
}
