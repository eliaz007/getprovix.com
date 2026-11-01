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
import type { ProductionAuditBreakdown } from "./productionauditbreakdown";

export function parseProductionAuditBreakdown(
  value: unknown
): ProductionAuditBreakdown | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const repo =
    typeof record.audited_repo_url === "string"
      ? record.audited_repo_url.trim()
      : "";
  const auditedAt =
    typeof record.audited_at === "string" ? record.audited_at.trim() : "";

  if (!repo) {
    return null;
  }

  const hygieneRaw = record.delivery_hygiene_score;
  const hygiene =
    typeof hygieneRaw === "number" && Number.isFinite(hygieneRaw)
      ? clampScore0to100(hygieneRaw)
      : undefined;

  return {
    architecture_score: clampScore0to100(record.architecture_score),
    ci_cd_score: clampScore0to100(record.ci_cd_score),
    test_density: clampScore0to100(record.test_density),
    error_handling: clampScore0to100(record.error_handling),
    audited_repo_url: repo,
    audited_at: auditedAt || new Date().toISOString(),
    delivery_hygiene_score: hygiene,
    commit_history_fetched:
      typeof record.commit_history_fetched === "boolean"
        ? record.commit_history_fetched
        : undefined,
  };
}
