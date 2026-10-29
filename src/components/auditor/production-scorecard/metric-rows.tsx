"use client";
import ProductionScoreVerifiedBadge from "@/components/ProductionScoreVerifiedBadge";
import type { ExecutiveBrief, RecommendedRoleBand } from "@/lib/executive-brief";
import type { PillarSubLog } from "@/lib/forensic-dossier";
import {
  type ProductionAuditMetrics,
  emptyProductionAuditMetrics,
  resolveCodeHealthScore,
  weightedProductionScore,
} from "@/lib/production-audit-metrics";
import { formatCodebaseBenchmark, type CodebaseBenchmark } from "@/lib/codebase-benchmark";
import { clampScore0to100 } from "@/lib/score-scale";

export const METRIC_ROWS: Array<{
  key: "architecture" | "testing" | "devops" | "resilience";
  label: string;
  shortLabel: string;
  microLabel: string;
  countKey:
    | "architecturePathCount"
    | "githubWorkflowCount"
    | "ciWorkflowCount"
    | "testFileCount"
    | "errorBoundaryCount"
    | "handlerCount";
}> = [
  {
    key: "architecture",
    label: "Architecture",
    shortLabel: "Arch",
    microLabel: "structure gaps",
    countKey: "architecturePathCount",
  },
  {
    key: "testing",
    label: "Testing",
    shortLabel: "Tests",
    microLabel: "missing suites",
    countKey: "testFileCount",
  },
  {
    key: "devops",
    label: "DevOps",
    shortLabel: "CI",
    microLabel: "missing workflows",
    countKey: "githubWorkflowCount",
  },
  {
    key: "resilience",
    label: "Resilience",
    shortLabel: "Resilience",
    microLabel: "unhandled errors",
    countKey: "handlerCount",
  },
];
