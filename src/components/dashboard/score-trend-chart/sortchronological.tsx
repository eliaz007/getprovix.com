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
import { timestampOf } from "./timestampof";

export function sortChronological(points: TrendPoint[]): TrendPoint[] {
  return [...points].sort((a, b) => {
    const delta = timestampOf(a) - timestampOf(b);
    return delta !== 0 ? delta : a.id.localeCompare(b.id);
  });
}
