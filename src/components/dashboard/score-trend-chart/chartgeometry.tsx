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
import { VIEW_WIDTH } from "./view-width";
import { VIEW_HEIGHT } from "./view-height";
import { PAD } from "./pad";
import { timestampOf } from "./timestampof";
import { scoreDomain } from "./scoredomain";
import type { MappedPoint } from "./mappedpoint";

export function chartGeometry(points: TrendPoint[]) {
  const innerWidth = VIEW_WIDTH - PAD.left - PAD.right;
  const innerHeight = VIEW_HEIGHT - PAD.top - PAD.bottom;
  const domain = scoreDomain(
    points.flatMap((point: (typeof points)[number]) => [point.contractScore, point.fullTimeScore])
  );
  const times = points.map(timestampOf);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const useTimeScale = maxTime - minTime > 60_000;

  const mapped: MappedPoint[] = points.map((point: (typeof points)[number], index: number) => {
    const xRatio = useTimeScale
      ? (timestampOf(point) - minTime) / Math.max(1, maxTime - minTime)
      : points.length === 1
        ? 0.5
        : index / (points.length - 1);
    const contractRatio =
      (point.contractScore - domain.min) /
      Math.max(1, domain.max - domain.min);
    const fullTimeRatio =
      (point.fullTimeScore - domain.min) /
      Math.max(1, domain.max - domain.min);
    return {
      ...point,
      x: PAD.left + xRatio * innerWidth,
      contractY: PAD.top + (1 - contractRatio) * innerHeight,
      fullTimeY: PAD.top + (1 - fullTimeRatio) * innerHeight,
    };
  });

  return { mapped, domain, innerHeight };
}
