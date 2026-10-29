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
import { SCREEN_CHECK_SCHEMA } from "./screen-check-schema";

export const SCREEN_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    integrity_score: {
      type: Type.INTEGER,
      description:
        "Integrity score from 0 to 100 based on code artifacts. Do not lower the score for a missing resume. Max 60 if any core file-system artifact is missing, max 50 if two or more are missing or the file tree was not inspected, and above 80 only with file-system proof of tests, CI, and error handling.",
    },
    timeline_flags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Red flags from artifact or timeline review. Do not include GitHub handle vs display-name/codename mismatch. Do not include a missing resume.",
    },
    artifact_analysis: {
      type: Type.STRING,
    },
    technical_depth_summary: {
      type: Type.STRING,
    },
    interview_questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          category: { type: Type.STRING },
          what_to_listen_for: { type: Type.STRING },
        },
        required: ["question", "category", "what_to_listen_for"],
      },
    },
    checks: {
      type: Type.ARRAY,
      description:
        "Exactly three artifact checks: Artifact Analysis, Architecture Review, and API & Data Resiliency.",
      items: SCREEN_CHECK_SCHEMA,
    },
    executiveBrief: {
      type: Type.OBJECT,
      properties: {
        employerSummary: {
          type: Type.STRING,
          description:
            "2-3 concise sentences on production risk and team fit for a founder.",
        },
        developerSummary: {
          type: Type.STRING,
          description:
            "2-3 direct sentences of peer review and the highest-leverage architectural fix.",
        },
        recommendedRoleBand: {
          type: Type.STRING,
          description:
            "Mode tier from deterministicMetrics. Never invent Mid-Level or Early-Stage Generalist.",
        },
      },
      required: [
        "employerSummary",
        "developerSummary",
        "recommendedRoleBand",
      ],
    },
  },
  required: [
    "integrity_score",
    "timeline_flags",
    "artifact_analysis",
    "technical_depth_summary",
    "interview_questions",
    "checks",
    "executiveBrief",
  ],
};
