"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Loader2, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  formatAuditedAt,
  formatAuditedRepoLabel,
  parseProductionAuditHistoryRow,
  PRODUCTION_AUDIT_UPDATED_EVENT,
  type ProductionAuditHistoryEntry,
} from "@/lib/production-audit";
import { clampScore0to100 } from "@/lib/score-scale";
import { isSupabaseSchemaError } from "@/lib/supabase-schema-errors";
import { parseGitHubUrl } from "@/lib/validate-github-url";
import { createClient } from "@/utils/supabase/client";

type TrendPoint = {
  id: string;
  score: number;
  at: string;
  repoUrl: string;
};

type ScoreTrendChartProps = {
  repoUrl?: string;
  current?: {
    score: number;
    auditedAt?: string;
    repoUrl?: string;
  } | null;
  className?: string;
  /** Nested under Verification Dossier — no outer chrome / title. */
  variant?: "standalone" | "embedded";
};

const HISTORY_LIMIT = 40;
const VIEW_WIDTH = 640;
const VIEW_HEIGHT = 228;
const PAD = { top: 18, right: 16, bottom: 34, left: 36 };

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

function toSmoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) {
    return "";
  }
  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  const parts = [`M ${points[0].x} ${points[0].y}`];
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const midX = (from.x + to.x) / 2;
    parts.push(`C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`);
  }
  return parts.join(" ");
}

function chartGeometry(points: TrendPoint[]) {
  const innerWidth = VIEW_WIDTH - PAD.left - PAD.right;
  const innerHeight = VIEW_HEIGHT - PAD.top - PAD.bottom;
  const domain = scoreDomain(points.map((point) => point.score));
  const times = points.map(timestampOf);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const useTimeScale = maxTime - minTime > 60_000;

  const mapped = points.map((point, index) => {
    const xRatio = useTimeScale
      ? (timestampOf(point) - minTime) / Math.max(1, maxTime - minTime)
      : points.length === 1
        ? 0.5
        : index / (points.length - 1);
    const yRatio = (point.score - domain.min) / Math.max(1, domain.max - domain.min);
    return {
      ...point,
      x: PAD.left + xRatio * innerWidth,
      y: PAD.top + (1 - yRatio) * innerHeight,
    };
  });

  return { mapped, domain, innerHeight };
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
  const { data, error } = await supabase
    .from("production_audit_history")
    .select(
      "id, production_score, audited_repo_url, audited_at, created_at"
    )
    .eq("user_id", userId)
    .order("audited_at", { ascending: true })
    .limit(HISTORY_LIMIT);

  if (error) {
    if (!isSupabaseSchemaError(error)) {
      console.error("[score-trend] history lookup failed:", error.message);
    }
    return [];
  }

  return (data ?? [])
    .map((row) => parseProductionAuditHistoryRow(row as Record<string, unknown>))
    .filter((entry): entry is ProductionAuditHistoryEntry => Boolean(entry))
    .map((entry) => ({
      id: entry.id,
      score: entry.productionScore,
      at: entry.auditedAt || entry.createdAt,
      repoUrl: entry.auditedRepoUrl,
    }));
}

function mergeCurrentPoint(
  points: TrendPoint[],
  current: ScoreTrendChartProps["current"]
): TrendPoint[] {
  if (!current || !Number.isFinite(current.score)) {
    return points;
  }

  const score = clampScore0to100(current.score);
  const repoUrl = current.repoUrl?.trim() ?? "";
  const at = current.auditedAt?.trim() || new Date().toISOString();
  const alreadyPresent = points.some(
    (point) =>
      point.score === score &&
      Math.abs(timestampOf(point) - Date.parse(at)) < 60_000
  );

  if (alreadyPresent) {
    return points;
  }

  return [
    ...points,
    {
      id: "current-profile-audit",
      score,
      at,
      repoUrl,
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

export default function ScoreTrendChart({
  repoUrl = "",
  current = null,
  className,
  variant = "standalone",
}: ScoreTrendChartProps) {
  const embedded = variant === "embedded";
  const reactId = useId().replace(/:/g, "");
  const fillId = `score-trend-fill-${reactId}`;
  const glowId = `score-trend-glow-${reactId}`;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<TrendPoint[]>([]);
  const [activeRepo, setActiveRepo] = useState(repoUrl);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const currentScore = current?.score;
  const currentAt = current?.auditedAt;
  const currentRepo = current?.repoUrl;

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
  }, [currentAt, currentRepo, currentScore, repoUrl]);

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
  const mapped = geometry?.mapped ?? [];
  const linePath = useMemo(() => toSmoothPath(mapped), [mapped]);
  const areaPath =
    mapped.length === 0
      ? ""
      : `${linePath} L ${mapped[mapped.length - 1].x} ${VIEW_HEIGHT - PAD.bottom} L ${mapped[0].x} ${VIEW_HEIGHT - PAD.bottom} Z`;

  const first = points[0];
  const latest = points[points.length - 1];
  const change =
    first && latest ? formatPercentChange(first.score, latest.score) : null;
  const hovered =
    mapped.find((point) => point.id === hoverId) ??
    (mapped.length > 0 ? mapped[mapped.length - 1] : null);
  const repoLabel = activeRepo ? formatAuditedRepoLabel(activeRepo) : "";
  const canChart = points.length >= 2;

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

      <div className={cn("relative min-h-0 flex-1", !embedded && "mt-3")}>
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
                first && latest
                  ? `Production score trend from ${first.score} to ${latest.score}`
                  : "Production score trend"
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
                <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
                </linearGradient>
                <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="2.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {geometry
                ? yTicks(geometry.domain.min, geometry.domain.max).map((tick) => {
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
                  })
                : null}

              {canChart ? (
                <>
                  <path d={areaPath} fill={`url(#${fillId})`} />
                  <path
                    d={linePath}
                    fill="none"
                    stroke="#F59E0B"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter={`url(#${glowId})`}
                  />
                </>
              ) : mapped[0] ? (
                <line
                  x1={PAD.left}
                  x2={VIEW_WIDTH - PAD.right}
                  y1={mapped[0].y}
                  y2={mapped[0].y}
                  stroke="#F59E0B"
                  strokeDasharray="4 6"
                  strokeOpacity="0.45"
                />
              ) : null}

              {mapped.map((point) => {
                const active = hovered?.id === point.id;
                return (
                  <g key={point.id}>
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={active ? 11 : 8}
                      className="fill-transparent"
                      onMouseEnter={() => setHoverId(point.id)}
                    />
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={active ? 4.5 : 3.25}
                      fill={active ? "#FDE68A" : "#0B0B0D"}
                      stroke="#F59E0B"
                      strokeWidth="2"
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
                    stroke="#F59E0B"
                    strokeOpacity="0.35"
                    strokeDasharray="3 4"
                  />
                  <rect
                    x={Math.min(
                      Math.max(hovered.x - 54, PAD.left),
                      VIEW_WIDTH - PAD.right - 108
                    )}
                    y={Math.max(hovered.y - 42, 6)}
                    width="108"
                    height="32"
                    rx="8"
                    className="fill-[#0B0B0D] stroke-white/[0.12]"
                    strokeWidth="1"
                  />
                  <text
                    x={
                      Math.min(
                        Math.max(hovered.x - 54, PAD.left),
                        VIEW_WIDTH - PAD.right - 108
                      ) + 54
                    }
                    y={Math.max(hovered.y - 42, 6) + 14}
                    textAnchor="middle"
                    className="fill-zinc-100"
                    fontSize="11"
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  >
                    {hovered.score}/100
                  </text>
                  <text
                    x={
                      Math.min(
                        Math.max(hovered.x - 54, PAD.left),
                        VIEW_WIDTH - PAD.right - 108
                      ) + 54
                    }
                    y={Math.max(hovered.y - 42, 6) + 26}
                    textAnchor="middle"
                    className="fill-zinc-400"
                    fontSize="9"
                  >
                    {formatAuditedAt(hovered.at)}
                  </text>
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
