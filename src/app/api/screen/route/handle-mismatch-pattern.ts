import { GoogleGenAI, Type } from "@google/genai";
import { after, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/admin-access";
import { requireAiApiUser, rejectUnlessVerifiedEmployer } from "@/lib/api-auth";
import {
  hasUsableExternalProjects,
  normalizeExternalProjects,
  type ExternalProjectRecord,
} from "@/lib/external-projects";
import {
  emptyGitHubAuditContext,
  fetchGitHubAudit,
  githubAuditHasFetchedArtifacts,
  type GitHubAuditContext,
} from "@/lib/github-audit";
import { profileRowIsPublicToEmployers } from "@/lib/opportunities-metrics";
import { parseJsonWithSchema } from "@/lib/parse-request-json";
import {
  employerHasApplicantForProfile,
  fetchProfileForCandidateId,
  hydrateScreenCandidateFromProfile,
  isProfileUuid,
  resolvedProfileId,
} from "@/lib/resolve-candidate-profile";
import {
  deterministicMetricsPayload,
  finalizeExecutiveBrief,
  parseExecutiveBrief,
  type ExecutiveBrief,
} from "@/lib/executive-brief";
import { clampScore0to100 } from "@/lib/score-scale";
import {
  applyFilesystemScoreCap,
  buildFilesystemScorePolicy,
  compactFilesystemForPrompt,
  emptyScoreCapAudit,
  parseScoreCapAudit,
  type ScoreCapAudit,
} from "@/lib/repo-filesystem";
import {
  applyUpstreamDerivativePenalty,
  computeProductionAuditMetrics,
  emptyProductionAuditMetrics,
  UPSTREAM_DERIVATIVE_PENALTY,
  UPSTREAM_DERIVATIVE_WARNING,
  type ProductionAuditMetrics,
} from "@/lib/production-audit-metrics";
import {
  CANONICAL_AUDIT_CHECKS,
  defaultAuditCheckSummary,
  normalizeAuditChecks,
  type AuditCheck,
} from "@/lib/audit-checks";
import { formatGpa } from "@/lib/gpa";
import {
  parseProductionAuditBreakdown,
  type ProductionAuditBreakdown,
} from "@/lib/production-audit";
import {
  completeScreeningRun,
  enqueuePendingScreening,
  failScreeningRun,
  markScreeningProcessing,
  readQueuedRunId,
  type ScreeningJobInput,
} from "@/lib/screening-queue";
import { createClient } from "@/utils/supabase/server";

export const HANDLE_MISMATCH_PATTERN =
  /\b(mismatch|does not match|doesn't match|do not match|don't match|inconsistent|discrepan|unrelated|not (the )?same|differs? from|no(t)? overlap)\b/i;
