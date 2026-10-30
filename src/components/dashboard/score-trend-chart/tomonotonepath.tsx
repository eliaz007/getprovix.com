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

export /** Monotone cubic Hermite (Fritsch–Carlson) — no overshoot between samples. */
function toMonotonePath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) {
    return "";
  }
  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  const n = points.length;
  const dx: number[] = [];
  const dy: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const xSpan = points[i + 1].x - points[i].x;
    dx.push(xSpan);
    dy.push(points[i + 1].y - points[i].y);
    slope.push(xSpan === 0 ? 0 : dy[i] / xSpan);
  }

  const tangent = new Array<number>(n).fill(0);
  tangent[0] = slope[0];
  tangent[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i += 1) {
    if (slope[i - 1] * slope[i] <= 0) {
      tangent[i] = 0;
    } else {
      const harmonic =
        (2 * slope[i - 1] * slope[i]) / (slope[i - 1] + slope[i]);
      tangent[i] = Number.isFinite(harmonic) ? harmonic : 0;
    }
  }

  const parts = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 0; i < n - 1; i += 1) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const span = dx[i] / 3;
    parts.push(
      `C ${p0.x + span} ${p0.y + tangent[i] * span}, ${p1.x - span} ${
        p1.y - tangent[i + 1] * span
      }, ${p1.x} ${p1.y}`
    );
  }
  return parts.join(" ");
}
