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
import { secureQuery306 } from "@/app/actions/secure-query";

type TrendPoint = {
  id: string;
  contractScore: number;
  fullTimeScore: number;
  at: string;
  repoUrl: string;
  commitSha: string | null;
};

type FocusMode = "both" | "contract" | "fulltime";

type ScoreTrendChartProps = {
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

const HISTORY_LIMIT = 40;
const VIEW_WIDTH = 640;
const VIEW_HEIGHT = 228;
const PAD = { top: 18, right: 16, bottom: 34, left: 36 };

const CONTRACT_STROKE = "#10b981";
const CONTRACT_FILL = "#10b981";
const FULLTIME_STROKE = "#8b5cf6";
const FULLTIME_FILL = "#8b5cf6";

function canonicalRepoKey(url: string | null | undefined): string {
  const trimmed = (url ?? "").trim();
  if (!trimmed) {
    return "";
  }

  const parsed = parseGitHubUrl(trimmed);
  if (parsed?.repo) {
    return `${parsed.owner.toLowerCase()}/${parsed.repo.toLowerCase()}`;
  }
  if (parsed?.owner) {
    return parsed.owner.toLowerCase();
  }
  return trimmed.toLowerCase();
}

function timestampOf(point: TrendPoint): number {
  const parsed = Date.parse(point.at);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortChronological(points: TrendPoint[]): TrendPoint[] {
  return [...points].sort((a, b) => {
    const delta = timestampOf(a) - timestampOf(b);
    return delta !== 0 ? delta : a.id.localeCompare(b.id);
  });
}

function formatAxisDate(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return "";
  }

  return new Date(parsed).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function shortSha(sha: string | null | undefined): string | null {
  if (!sha?.trim()) {
    return null;
  }
  return sha.trim().slice(0, 7);
}

function formatPercentChange(first: number, latest: number): {
  label: string;
  tone: "up" | "down" | "flat";
} {
  if (first <= 0) {
    const delta = latest - first;
    if (delta === 0) {
      return { label: "0% since first audit", tone: "flat" };
    }
    return {
      label: `${delta > 0 ? "+" : ""}${delta} pts since first audit`,
      tone: delta > 0 ? "up" : "down",
    };
  }

  const percent = ((latest - first) / first) * 100;
  if (Math.abs(percent) < 0.05) {
    return { label: "0% since first audit", tone: "flat" };
  }

  const abs = Math.abs(percent);
  const rounded = abs >= 10 ? abs.toFixed(0) : abs.toFixed(1);
  return {
    label: `${percent > 0 ? "+" : "−"}${rounded}% since first audit`,
    tone: percent > 0 ? "up" : "down",
  };
}

function yTicks(min: number, max: number): number[] {
  const span = Math.max(1, max - min);
  const step = span <= 20 ? 5 : span <= 40 ? 10 : 25;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= max; value += step) {
    ticks.push(value);
  }
  if (!ticks.includes(min)) {
    ticks.unshift(min);
  }
  if (!ticks.includes(max)) {
    ticks.push(max);
  }
  return ticks;
}

function scoreDomain(scores: number[]): { min: number; max: number } {
  if (scores.length === 0) {
    return { min: 0, max: 100 };
  }

  const low = Math.min(...scores);
  const high = Math.max(...scores);
  const pad = Math.max(8, Math.round((high - low) * 0.25));
  let min = Math.max(0, Math.floor((low - pad) / 5) * 5);
  let max = Math.min(100, Math.ceil((high + pad) / 5) * 5);
  if (max - min < 20) {
    min = Math.max(0, min - 10);
    max = Math.min(100, max + 10);
  }
  return { min, max };
}

/** Monotone cubic Hermite (Fritsch–Carlson) — no overshoot between samples. */
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

function areaUnderPath(
  linePath: string,
  points: Array<{ x: number; y: number }>
): string {
  if (!linePath || points.length === 0) {
    return "";
  }
  const baseline = VIEW_HEIGHT - PAD.bottom;
  return `${linePath} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`;
}

type MappedPoint = TrendPoint & {
  x: number;
  contractY: number;
  fullTimeY: number;
};

function chartGeometry(points: TrendPoint[]) {
  const innerWidth = VIEW_WIDTH - PAD.left - PAD.right;
  const innerHeight = VIEW_HEIGHT - PAD.top - PAD.bottom;
  const domain = scoreDomain(
    points.flatMap((point) => [point.contractScore, point.fullTimeScore])
  );
  const times = points.map(timestampOf);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const useTimeScale = maxTime - minTime > 60_000;

  const mapped: MappedPoint[] = points.map((point, index) => {
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

function historyToTrendPoint(entry: ProductionAuditHistoryEntry): TrendPoint {
  return {
    id: entry.id,
    contractScore: entry.contractScore,
    fullTimeScore: entry.fullTimeScore,
    at: entry.auditedAt || entry.createdAt,
    repoUrl: entry.auditedRepoUrl,
    commitSha: entry.commitSha,
  };
}

async function loadVerifiedRepoUrl(
  userId: string,
  fallbackUrl: string
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("repo_verifications")
    .select("repo_url")
    .eq("user_id", userId)
    .eq("is_verified", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && !isSupabaseSchemaError(error)) {
    console.error("[score-trend] verified repo lookup failed:", error.message);
  }

  if (typeof data?.repo_url === "string" && data.repo_url.trim()) {
    return data.repo_url.trim();
  }

  return fallbackUrl;
}

async function loadAuditHistory(userId: string): Promise<TrendPoint[]> {
  const supabase = createClient();
  const { data, error } = await secureQuery306(userId, HISTORY_LIMIT);

  if (error) {
    if (!isSupabaseSchemaError(error)) {
      console.error("[score-trend] history lookup failed:", error.message);
    }
    return [];
  }

  return (data ?? [])
    .map((row) => parseProductionAuditHistoryRow(row as Record<string, unknown>))
    .filter((entry): entry is ProductionAuditHistoryEntry => Boolean(entry))
    .map(historyToTrendPoint);
}

function mergeCurrentPoint(
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

function pickSeries(
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
    ? points.filter((point) => canonicalRepoKey(point.repoUrl) === latestKey)
    : points;

  return {
    repoUrl: latest.repoUrl || verifiedRepoUrl,
    points: sortChronological(matched),
  };
}

function seriesOpacity(focus: FocusMode, series: "contract" | "fulltime"): number {
  if (focus === "both") {
    return 1;
  }
  return focus === series ? 1 : 0.3;
}

export default function ScoreTrendChart({
  repoUrl = "",
  current = null,
  className,
  variant = "standalone",
}: ScoreTrendChartProps) {
  const embedded = variant === "embedded";
  const reactId = useId().replace(/:/g, "");
  const contractFillId = `score-trend-contract-fill-${reactId}`;
  const fulltimeFillId = `score-trend-fulltime-fill-${reactId}`;
  const contractGlowId = `score-trend-contract-glow-${reactId}`;
  const fulltimeGlowId = `score-trend-fulltime-glow-${reactId}`;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<TrendPoint[]>([]);
  const [activeRepo, setActiveRepo] = useState(repoUrl);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusMode>("both");

  const currentScore = current?.score;
  const currentAt = current?.auditedAt;
  const currentRepo = current?.repoUrl;
  const currentArchitecture = current?.architecture;
  const currentTesting = current?.testing;
  const currentDevops = current?.devops;
  const currentResilience = current?.resilience;
  const currentContract = current?.contractScore;
  const currentFullTime = current?.fullTimeScore;
  const currentSha = current?.commitSha;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || !data.user) {
        setPoints([]);
        setActiveRepo(repoUrl);
        return;
      }

      const currentPoint =
        currentScore == null
          ? null
          : {
              score: currentScore,
              auditedAt: currentAt,
              repoUrl: currentRepo,
              architecture: currentArchitecture,
              testing: currentTesting,
              devops: currentDevops,
              resilience: currentResilience,
              contractScore: currentContract,
              fullTimeScore: currentFullTime,
              commitSha: currentSha,
            };

      const [history, verifiedUrl] = await Promise.all([
        loadAuditHistory(data.user.id),
        loadVerifiedRepoUrl(data.user.id, repoUrl || currentRepo || ""),
      ]);
      const merged = mergeCurrentPoint(history, currentPoint);
      const series = pickSeries(
        merged,
        verifiedUrl || repoUrl || currentRepo || ""
      );
      setActiveRepo(series.repoUrl);
      setPoints(series.points);
    } catch (loadError) {
      console.error("[score-trend] failed to load:", loadError);
      setError("Could not load score history.");
      setPoints([]);
    } finally {
      setLoading(false);
    }
  }, [
    currentArchitecture,
    currentAt,
    currentContract,
    currentDevops,
    currentFullTime,
    currentRepo,
    currentResilience,
    currentScore,
    currentSha,
    currentTesting,
    repoUrl,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onUpdated = () => {
      void load();
    };
    window.addEventListener(PRODUCTION_AUDIT_UPDATED_EVENT, onUpdated);
    return () => {
      window.removeEventListener(PRODUCTION_AUDIT_UPDATED_EVENT, onUpdated);
    };
  }, [load]);

  const geometry = useMemo(
    () => (points.length > 0 ? chartGeometry(points) : null),
    [points]
  );
  const mapped = useMemo(() => geometry?.mapped ?? [], [geometry]);

  const contractPoints = useMemo(
    () => mapped.map((point) => ({ x: point.x, y: point.contractY })),
    [mapped]
  );
  const fulltimePoints = useMemo(
    () => mapped.map((point) => ({ x: point.x, y: point.fullTimeY })),
    [mapped]
  );

  const contractLine = useMemo(
    () => toMonotonePath(contractPoints),
    [contractPoints]
  );
  const fulltimeLine = useMemo(
    () => toMonotonePath(fulltimePoints),
    [fulltimePoints]
  );
  const contractArea = useMemo(
    () => areaUnderPath(contractLine, contractPoints),
    [contractLine, contractPoints]
  );
  const fulltimeArea = useMemo(
    () => areaUnderPath(fulltimeLine, fulltimePoints),
    [fulltimeLine, fulltimePoints]
  );

  const first = points[0];
  const latest = points[points.length - 1];
  const change =
    first && latest
      ? formatPercentChange(first.contractScore, latest.contractScore)
      : null;
  const hovered =
    mapped.find((point) => point.id === hoverId) ??
    (mapped.length > 0 ? mapped[mapped.length - 1] : null);
  const repoLabel = activeRepo ? formatAuditedRepoLabel(activeRepo) : "";
  const canChart = points.length >= 2;

  const latestContract = latest?.contractScore ?? null;
  const latestFullTime = latest?.fullTimeScore ?? null;

  const toggleFocus = (series: "contract" | "fulltime") => {
    setFocus((prev) => (prev === series ? "both" : series));
  };

  const contractOpacity = seriesOpacity(focus, "contract");
  const fulltimeOpacity = seriesOpacity(focus, "fulltime");

  const tooltipMeta = hovered
    ? [
        formatAuditedAt(hovered.at),
        shortSha(hovered.commitSha) ? shortSha(hovered.commitSha) : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <section
      className={cn(
        embedded
          ? "flex min-h-0 flex-col"
          : "flex h-full flex-col rounded-xl border border-white/[0.08] bg-[#131316]/90 p-4 shadow-2xl backdrop-blur-xl sm:p-5",
        className
      )}
      aria-labelledby={embedded ? undefined : "score-trend-heading"}
    >
      {!embedded ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              Code health
            </p>
            <h3
              id="score-trend-heading"
              className="mt-1 text-sm font-bold tracking-tight text-zinc-100"
            >
              Score trend
            </h3>
            <p className="mt-1 truncate text-xs text-zinc-500">
              {repoLabel
                ? `Verified repository · ${repoLabel}`
                : "Past production audits for your verified repository"}
            </p>
          </div>

          {change && !loading ? (
            <p
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                change.tone === "up" &&
                  "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
                change.tone === "down" &&
                  "border-red-500/20 bg-red-500/10 text-red-300",
                change.tone === "flat" &&
                  "border-zinc-700/60 bg-zinc-950/60 text-zinc-400"
              )}
            >
              {change.tone === "up" ? (
                <TrendingUp className="h-3.5 w-3.5" aria-hidden />
              ) : change.tone === "down" ? (
                <TrendingDown className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Minus className="h-3.5 w-3.5" aria-hidden />
              )}
              {change.label}
            </p>
          ) : null}
        </div>
      ) : null}

      {!loading && !error && points.length > 0 ? (
        <div
          className={cn(
            "flex flex-wrap items-center gap-2",
            embedded ? "mb-2" : "mt-3 mb-1"
          )}
          role="group"
          aria-label="Score mode legend"
        >
          <button
            type="button"
            onClick={() => toggleFocus("contract")}
            aria-pressed={focus === "contract"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-opacity",
              "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
              focus === "fulltime" && "opacity-40"
            )}
          >
            <span
              className="h-1.5 w-1.5 rounded-full bg-emerald-400"
              aria-hidden
            />
            Contract Work:{" "}
            <span className="font-mono tabular-nums">
              {latestContract == null ? "—" : latestContract}
            </span>
          </button>
          <button
            type="button"
            onClick={() => toggleFocus("fulltime")}
            aria-pressed={focus === "fulltime"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-opacity",
              "border-violet-500/25 bg-violet-500/10 text-violet-300",
              focus === "contract" && "opacity-40"
            )}
          >
            <span
              className="h-1.5 w-1.5 rounded-full bg-violet-400"
              aria-hidden
            />
            Full-Time:{" "}
            <span className="font-mono tabular-nums">
              {latestFullTime == null ? "—" : latestFullTime}
            </span>
          </button>
        </div>
      ) : null}

      <div className={cn("relative min-h-0 flex-1", !embedded && "mt-1")}>
        {loading ? (
          <div
            className="flex h-[188px] items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950/50"
            aria-busy="true"
          >
            <Loader2
              className="h-5 w-5 animate-spin text-zinc-400"
              aria-hidden
            />
            <span className="sr-only">Loading score history</span>
          </div>
        ) : error ? (
          <p
            role="alert"
            className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-8 text-center text-sm text-red-300"
          >
            {error}
          </p>
        ) : points.length === 0 ? (
          <p className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-10 text-center text-sm text-zinc-500">
            Run a production audit on your repository to start tracking code
            health over time.
          </p>
        ) : (
          <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-1 py-1">
            <svg
              role="img"
              aria-label={
                latest
                  ? `Dual-mode score trend. Contract ${latest.contractScore}, Full-Time ${latest.fullTimeScore}`
                  : "Dual-mode production score trend"
              }
              viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
              className="h-[188px] w-full"
              onMouseLeave={() => setHoverId(null)}
              onMouseMove={(event) => {
                if (mapped.length === 0) {
                  return;
                }
                const rect = event.currentTarget.getBoundingClientRect();
                const x =
                  ((event.clientX - rect.left) / Math.max(1, rect.width)) *
                  VIEW_WIDTH;
                let nearest = mapped[0];
                let best = Number.POSITIVE_INFINITY;
                for (const point of mapped) {
                  const distance = Math.abs(point.x - x);
                  if (distance < best) {
                    best = distance;
                    nearest = point;
                  }
                }
                setHoverId(nearest.id);
              }}
            >
              <defs>
                <linearGradient id={contractFillId} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={CONTRACT_FILL}
                    stopOpacity="0.10"
                  />
                  <stop
                    offset="100%"
                    stopColor={CONTRACT_FILL}
                    stopOpacity="0"
                  />
                </linearGradient>
                <linearGradient id={fulltimeFillId} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={FULLTIME_FILL}
                    stopOpacity="0.10"
                  />
                  <stop
                    offset="100%"
                    stopColor={FULLTIME_FILL}
                    stopOpacity="0"
                  />
                </linearGradient>
                <filter
                  id={contractGlowId}
                  x="-20%"
                  y="-20%"
                  width="140%"
                  height="140%"
                >
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter
                  id={fulltimeGlowId}
                  x="-20%"
                  y="-20%"
                  width="140%"
                  height="140%"
                >
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {geometry
                ? yTicks(geometry.domain.min, geometry.domain.max).map(
                    (tick) => {
                      const yRatio =
                        (tick - geometry.domain.min) /
                        Math.max(1, geometry.domain.max - geometry.domain.min);
                      const y = PAD.top + (1 - yRatio) * geometry.innerHeight;
                      return (
                        <g key={tick}>
                          <line
                            x1={PAD.left}
                            x2={VIEW_WIDTH - PAD.right}
                            y1={y}
                            y2={y}
                            className="stroke-zinc-800"
                            strokeWidth="1"
                          />
                          <text
                            x={PAD.left - 8}
                            y={y + 3}
                            textAnchor="end"
                            className="fill-zinc-500"
                            fontSize="10"
                          >
                            {tick}
                          </text>
                        </g>
                      );
                    }
                  )
                : null}

              {canChart ? (
                <>
                  <g opacity={fulltimeOpacity}>
                    <path d={fulltimeArea} fill={`url(#${fulltimeFillId})`} />
                    <path
                      d={fulltimeLine}
                      fill="none"
                      stroke={FULLTIME_STROKE}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      filter={`url(#${fulltimeGlowId})`}
                    />
                  </g>
                  <g opacity={contractOpacity}>
                    <path d={contractArea} fill={`url(#${contractFillId})`} />
                    <path
                      d={contractLine}
                      fill="none"
                      stroke={CONTRACT_STROKE}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      filter={`url(#${contractGlowId})`}
                    />
                  </g>
                </>
              ) : mapped[0] ? (
                <>
                  <line
                    x1={PAD.left}
                    x2={VIEW_WIDTH - PAD.right}
                    y1={mapped[0].fullTimeY}
                    y2={mapped[0].fullTimeY}
                    stroke={FULLTIME_STROKE}
                    strokeDasharray="4 6"
                    strokeOpacity={0.45 * fulltimeOpacity}
                  />
                  <line
                    x1={PAD.left}
                    x2={VIEW_WIDTH - PAD.right}
                    y1={mapped[0].contractY}
                    y2={mapped[0].contractY}
                    stroke={CONTRACT_STROKE}
                    strokeDasharray="4 6"
                    strokeOpacity={0.45 * contractOpacity}
                  />
                </>
              ) : null}

              {mapped.map((point) => {
                const active = hovered?.id === point.id;
                return (
                  <g key={point.id}>
                    <circle
                      cx={point.x}
                      cy={(point.contractY + point.fullTimeY) / 2}
                      r={active ? 14 : 10}
                      className="fill-transparent"
                      onMouseEnter={() => setHoverId(point.id)}
                    />
                    <circle
                      cx={point.x}
                      cy={point.fullTimeY}
                      r={active ? 4.25 : 3}
                      fill={active ? "#ffffff" : "#a78bfa"}
                      stroke={FULLTIME_STROKE}
                      strokeWidth="2"
                      opacity={fulltimeOpacity}
                      className="pointer-events-none"
                    />
                    <circle
                      cx={point.x}
                      cy={point.contractY}
                      r={active ? 4.25 : 3}
                      fill={active ? "#ffffff" : "#34d399"}
                      stroke={CONTRACT_STROKE}
                      strokeWidth="2"
                      opacity={contractOpacity}
                      className="pointer-events-none"
                    />
                  </g>
                );
              })}

              {first ? (
                <text
                  x={PAD.left}
                  y={VIEW_HEIGHT - 10}
                  className="fill-zinc-500"
                  fontSize="10"
                >
                  {formatAxisDate(first.at)}
                </text>
              ) : null}
              {latest && points.length > 1 ? (
                <text
                  x={VIEW_WIDTH - PAD.right}
                  y={VIEW_HEIGHT - 10}
                  textAnchor="end"
                  className="fill-zinc-500"
                  fontSize="10"
                >
                  {formatAxisDate(latest.at)}
                </text>
              ) : null}

              {hovered ? (
                <g className="pointer-events-none">
                  <line
                    x1={hovered.x}
                    x2={hovered.x}
                    y1={PAD.top}
                    y2={VIEW_HEIGHT - PAD.bottom}
                    stroke="#71717a"
                    strokeOpacity="0.45"
                    strokeDasharray="3 4"
                  />
                  {(() => {
                    const tipWidth = 220;
                    const tipHeight = 72;
                    const tipX = Math.min(
                      Math.max(hovered.x - tipWidth / 2, PAD.left),
                      VIEW_WIDTH - PAD.right - tipWidth
                    );
                    const tipY = Math.max(
                      Math.min(hovered.contractY, hovered.fullTimeY) -
                        tipHeight -
                        10,
                      6
                    );
                    const contractTier = assignAuditTier(
                      "contract",
                      hovered.contractScore
                    );
                    const fulltimeTier = assignAuditTier(
                      "fulltime",
                      hovered.fullTimeScore
                    );
                    return (
                      <>
                        <rect
                          x={tipX}
                          y={tipY}
                          width={tipWidth}
                          height={tipHeight}
                          rx="8"
                          className="fill-[#0B0B0D] stroke-zinc-700/80"
                          strokeWidth="1"
                        />
                        <text
                          x={tipX + 10}
                          y={tipY + 14}
                          className="fill-zinc-400"
                          fontSize="9"
                        >
                          {tooltipMeta || formatAuditedAt(hovered.at)}
                        </text>
                        <text
                          x={tipX + 10}
                          y={tipY + 34}
                          className="fill-emerald-300"
                          fontSize="10"
                          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                        >
                          {`Contract ${hovered.contractScore}`}
                          <tspan className="fill-zinc-500" fontSize="8">
                            {`  ${contractTier}`}
                          </tspan>
                        </text>
                        <text
                          x={tipX + 10}
                          y={tipY + 54}
                          className="fill-violet-300"
                          fontSize="10"
                          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                        >
                          {`Full-Time ${hovered.fullTimeScore}`}
                          <tspan className="fill-zinc-500" fontSize="8">
                            {`  ${fulltimeTier}`}
                          </tspan>
                        </text>
                      </>
                    );
                  })()}
                </g>
              ) : null}
            </svg>
            {points.length === 1 ? (
              <p className="px-3 pb-3 text-center text-[11px] text-zinc-500">
                Run another audit to plot improvement over time.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
