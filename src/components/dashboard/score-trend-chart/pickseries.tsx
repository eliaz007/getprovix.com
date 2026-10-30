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
import { canonicalRepoKey } from "./canonicalrepokey";
import { sortChronological } from "./sortchronological";

export function pickSeries(
  points: TrendPoint[],
  verifiedRepoUrl: string
): { repoUrl: string; points: TrendPoint[] } {
  const verifiedKey = canonicalRepoKey(verifiedRepoUrl);
  if (verifiedKey) {
    const matched = points.filter(
      (point) => canonicalRepoKey(point.repoUrl) === verifiedKey
    );
    if (matched.length > 0) {
      return { repoUrl: verifiedRepoUrl, points: sortChronological(matched) };
    }
  }

  const latest = points[points.length - 1];
  if (!latest) {
    return { repoUrl: verifiedRepoUrl, points: [] };
  }

  const latestKey = canonicalRepoKey(latest.repoUrl);
  const matched = latestKey
    ? points.filter((point: (typeof points)[number]) => canonicalRepoKey(point.repoUrl) === latestKey)
    : points;

  return {
    repoUrl: latest.repoUrl || verifiedRepoUrl,
    points: sortChronological(matched),
  };
}
