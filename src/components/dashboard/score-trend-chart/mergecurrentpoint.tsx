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
import type { TrendPoint } from "./trendpoint";
import type { ScoreTrendChartProps } from "./scoretrendchartprops";
import { timestampOf } from "./timestampof";

export function mergeCurrentPoint(
  points: TrendPoint[],
  current: ScoreTrendChartProps["current"]
): TrendPoint[] {
  if (!current || !Number.isFinite(current.score)) {
    return points;
  }

  const dual = deriveDualModeScores({
    productionScore: current.score,
    contractScore: current.contractScore,
    fullTimeScore: current.fullTimeScore,
    architecture: current.architecture,
    testing: current.testing,
    devops: current.devops,
    resilience: current.resilience,
  });
  const repoUrl = current.repoUrl?.trim() ?? "";
  const at = current.auditedAt?.trim() || new Date().toISOString();
  const alreadyPresent = points.some(
    (point) =>
      point.contractScore === dual.contractScore &&
      point.fullTimeScore === dual.fullTimeScore &&
      Math.abs(timestampOf(point) - Date.parse(at)) < 60_000
  );

  if (alreadyPresent) {
    return points;
  }

  return [
    ...points,
    {
      id: "current-profile-audit",
      contractScore: dual.contractScore,
      fullTimeScore: dual.fullTimeScore,
      at,
      repoUrl,
      commitSha: current.commitSha ?? null,
    },
  ];
}
