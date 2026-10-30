"use client";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Loader2, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { assignAuditTier, deriveDualModeScores } from "@/lib/audit-mode";
import { cn } from "@/lib/cn";
import {
  formatAuditedAt,
  formatAuditedRepoLabel,
  parseProductionAuditHistoryRow,
  PRODUCTION_AUDIT_UPDATED_EVENT,
  type ProductionAuditHistoryEntry,
} from "@/lib/production-audit";
import { isSupabaseSchemaError } from "@/lib/supabase-schema-errors";
import { parseGitHubUrl } from "@/lib/validate-github-url";
import { createClient } from "@/utils/supabase/client";

export type ScoreTrendChartProps = {
  repoUrl?: string;
  current?: {
    score: number;
    auditedAt?: string;
    repoUrl?: string;
    architecture?: number;
    testing?: number;
    devops?: number;
    resilience?: number;
    contractScore?: number;
    fullTimeScore?: number;
    commitSha?: string | null;
  } | null;
  className?: string;
  /** Nested under Verification Dossier — no outer chrome / title. */
  variant?: "standalone" | "embedded";
};
