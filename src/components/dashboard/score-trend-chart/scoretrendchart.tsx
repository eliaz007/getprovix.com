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
import type { FocusMode } from "./focusmode";
import type { ScoreTrendChartProps } from "./scoretrendchartprops";
import { VIEW_WIDTH } from "./view-width";
import { VIEW_HEIGHT } from "./view-height";
import { PAD } from "./pad";
import { CONTRACT_STROKE } from "./contract-stroke";
import { CONTRACT_FILL } from "./contract-fill";
import { FULLTIME_STROKE } from "./fulltime-stroke";
import { FULLTIME_FILL } from "./fulltime-fill";
import { formatAxisDate } from "./formataxisdate";
import { shortSha } from "./shortsha";
import { formatPercentChange } from "./formatpercentchange";
import { yTicks } from "./yticks";
import { toMonotonePath } from "./tomonotonepath";
import { areaUnderPath } from "./areaunderpath";
import { chartGeometry } from "./chartgeometry";
import { loadVerifiedRepoUrl } from "./loadverifiedrepourl";
import { loadAuditHistory } from "./loadaudithistory";
import { mergeCurrentPoint } from "./mergecurrentpoint";
import { pickSeries } from "./pickseries";
import { seriesOpacity } from "./seriesopacity";

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
    () => mapped.map((point: (typeof mapped)[number]) => ({ x: point.x, y: point.contractY })),
    [mapped]
  );
  const fulltimePoints = useMemo(
    () => mapped.map((point: (typeof mapped)[number]) => ({ x: point.x, y: point.fullTimeY })),
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
    mapped.find((point: (typeof mapped)[number]) => point.id === hoverId) ??
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

              {mapped.map((point: (typeof mapped)[number]) => {
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
