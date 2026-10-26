import { describe, expect, it } from "vitest";
import {
  analyzeCommitHistory,
  applyCommitHistoryScaleWeight,
  classifyCommitHistoryScale,
  scoreCommitHistoryPenalty,
  stripAiAssistedTrailers,
  type CommitHistoryStat,
} from "@/lib/commit-history-score";
import {
  assignVerificationTier,
  DELIVERY_HYGIENE_VERIFIED_THRESHOLD,
  VERIFICATION_TIER_NEEDS_REFINEMENT,
  VERIFICATION_TIER_PROVIX,
} from "@/lib/audit-readiness";
import {
  computeProductionAuditMetrics,
  deliveryHygieneScoreFromPenalty,
} from "@/lib/production-audit-metrics";
import { classifyRepoFilesystem } from "@/lib/repo-filesystem";

const WEB_APP_PATHS = [
  "package.json",
  "src/app/page.tsx",
  "src/app/layout.tsx",
  "src/components/Button.tsx",
  "src/lib/api.ts",
  ".github/workflows/ci.yml",
  "src/app/error.tsx",
  "src/app/api/hello/route.ts",
  "src/foo.test.ts",
];

function daysAgo(days: number, hour = 12): string {
  const date = new Date(Date.UTC(2026, 9, 25, hour, 0, 0));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

function realEngineerHistory(): CommitHistoryStat[] {
  const login = "walterdev";
  return [
    {
      date: daysAgo(60),
      message: "feat: scaffold app shell",
      authorLogin: login,
    },
    {
      date: daysAgo(52),
      message: "feat: add auth routes",
      authorLogin: login,
    },
    {
      date: daysAgo(45),
      message:
        "fix: handle expired session cookies\n\nCo-authored-by: Cursor <cursoragent@cursor.com>",
      authorLogin: login,
    },
    {
      date: daysAgo(38),
      message: "refactor: extract billing client",
      authorLogin: login,
    },
    {
      date: daysAgo(30),
      message: "test: cover webhook retries",
      authorLogin: login,
    },
    {
      date: daysAgo(21),
      message: "feat: employer match drawer\n\nGenerated with Claude",
      authorLogin: login,
    },
    {
      date: daysAgo(14),
      message: "fix: race on dossier publish",
      authorLogin: login,
    },
    {
      date: daysAgo(7),
      message: "chore: bump vitest",
      authorLogin: login,
    },
  ];
}

function oneDumpHistory(): CommitHistoryStat[] {
  return [
    {
      date: "2026-10-20T10:00:00.000Z",
      message: "Initial commit",
      authorLogin: "dumpuser",
    },
    {
      date: "2026-10-20T10:20:00.000Z",
      message: "Initial commit",
      authorLogin: "dumpuser",
    },
  ];
}

function largeSquashedHistory(): CommitHistoryStat[] {
  return Array.from({ length: 12 }, (_, index) => ({
    date: `2026-10-18T${String(10 + Math.floor(index / 3)).padStart(2, "0")}:${String(
      (index % 3) * 15
    ).padStart(2, "0")}:00.000Z`,
    message: index === 0 ? "Import production monorepo" : `Snapshot chunk ${index}`,
    authorLogin: "importer",
  }));
}

describe("commit-history-score", () => {
  it("applies zero penalty when history was never fetched", () => {
    expect(scoreCommitHistoryPenalty(null, undefined, null)).toBe(0);
    expect(scoreCommitHistoryPenalty(undefined, undefined, undefined)).toBe(0);
    expect(analyzeCommitHistory(null, null)).toBeNull();
  });

  it("ignores Cursor / AI co-author trailers for message cleanup", () => {
    const cleaned = stripAiAssistedTrailers(
      "fix: timeout on upload\n\nCo-authored-by: Cursor <cursoragent@cursor.com>\nCo-authored-by: Claude <noreply@anthropic.com>"
    );
    expect(cleaned).toBe("fix: timeout on upload");
  });

  it("real engineer / got-like history: multi-week + follow-up → History 100 unchanged", () => {
    const stats = realEngineerHistory();
    const dates = stats.map((stat) => stat.date);
    const signals = analyzeCommitHistory(dates, stats);
    expect(signals?.hasMultiWeekSpread).toBe(true);
    expect(signals?.hasFollowUpFix).toBe(true);
    expect(signals?.isExempt).toBe(true);
    expect(scoreCommitHistoryPenalty(dates, undefined, stats)).toBe(0);

    const filesystem = classifyRepoFilesystem(WEB_APP_PATHS, { inspected: true });
    const metrics = computeProductionAuditMetrics(filesystem, "fulltime", {
      commitDates: dates,
      commitStats: stats,
    });
    expect(metrics.commitHistoryPenalty).toBe(0);
    expect(metrics.deliveryHygieneScore).toBe(100);
    expect(metrics.productionScore).toBe(metrics.codeHealthScore);
    expect(
      assignVerificationTier(
        metrics.codeHealthScore ?? metrics.productionScore,
        metrics.deliveryHygieneScore ?? 100
      )
    ).toBe(
      (metrics.codeHealthScore ?? 0) >= 75
        ? VERIFICATION_TIER_PROVIX
        : VERIFICATION_TIER_NEEDS_REFINEMENT
    );
  });

  it("one-dump / 2-commit repo: stub penalty ≈ History 40 on a small tree", () => {
    const stats = oneDumpHistory();
    const dates = stats.map((stat) => stat.date);
    const penalty = scoreCommitHistoryPenalty(dates, undefined, stats, {
      fileCount: 20,
      authoredLoc: 2_000,
    });
    expect(penalty).toBe(-60);
    expect(deliveryHygieneScoreFromPenalty(60)).toBe(40);

    const filesystem = classifyRepoFilesystem(WEB_APP_PATHS, { inspected: true });
    const metrics = computeProductionAuditMetrics(filesystem, "contract", {
      commitDates: dates,
      commitStats: stats,
    });
    expect(metrics.commitHistoryPenalty).toBe(60);
    expect(metrics.deliveryHygieneScore).toBe(40);
    expect(metrics.deliveryHygieneScore!).toBeLessThan(
      DELIVERY_HYGIENE_VERIFIED_THRESHOLD
    );
    expect(metrics.productionScore).toBe(metrics.codeHealthScore);
    expect(
      assignVerificationTier(90, metrics.deliveryHygieneScore ?? 0)
    ).toBe(VERIFICATION_TIER_NEEDS_REFINEMENT);
  });

  it("large squashed repo: reduced penalty, never bypassed", () => {
    const stats = largeSquashedHistory();
    const dates = stats.map((stat) => stat.date);
    const scale = { fileCount: 400, authoredLoc: 40_000 };
    expect(classifyCommitHistoryScale(scale)).toBe("large");

    const raw = scoreCommitHistoryPenalty(dates, undefined, stats, {
      fileCount: 20,
      authoredLoc: 1_000,
    });
    const reduced = scoreCommitHistoryPenalty(dates, undefined, stats, scale);

    expect(raw).toBeLessThan(0);
    expect(reduced).toBeLessThan(0);
    expect(Math.abs(reduced)).toBeLessThan(Math.abs(raw));
    expect(Math.abs(reduced)).toBeGreaterThan(0);
    expect(applyCommitHistoryScaleWeight(raw, scale)).toBe(reduced);

    const signals = analyzeCommitHistory(dates, stats);
    expect(signals?.isExempt).toBe(false);
    expect(signals?.hasMultipleHumanAuthors).toBe(false);
  });

  it("exempts with 2+ human authors even on a short span", () => {
    const stats: CommitHistoryStat[] = [
      {
        date: "2026-10-20T10:00:00.000Z",
        message: "feat: land feature",
        authorLogin: "alice",
      },
      {
        date: "2026-10-20T12:00:00.000Z",
        message: "feat: more work",
        authorLogin: "bob",
      },
      {
        date: "2026-10-20T14:00:00.000Z",
        message: "chore: tweak copy",
        authorLogin: "alice",
      },
    ];
    expect(
      scoreCommitHistoryPenalty(
        stats.map((stat) => stat.date),
        undefined,
        stats
      )
    ).toBe(0);
  });

  it("does not exempt on multi-week spread alone without a follow-up fix", () => {
    const stats: CommitHistoryStat[] = [
      {
        date: daysAgo(40),
        message: "feat: start",
        authorLogin: "solo",
      },
      {
        date: daysAgo(20),
        message: "feat: keep building",
        authorLogin: "solo",
      },
      {
        date: daysAgo(5),
        message: "feat: ship more",
        authorLogin: "solo",
      },
    ];
    const penalty = scoreCommitHistoryPenalty(
      stats.map((stat) => stat.date),
      undefined,
      stats
    );
    expect(penalty).toBeLessThan(0);
  });

  it("does not ding AI-assisted commits under the candidate login", () => {
    const stats: CommitHistoryStat[] = [
      {
        date: daysAgo(30),
        message: "feat: scaffold",
        authorLogin: "candidate",
      },
      {
        date: daysAgo(10),
        message:
          "fix: null guard on profile\n\nCo-authored-by: Cursor <cursoragent@cursor.com>",
        authorLogin: "candidate",
      },
    ];
    const signals = analyzeCommitHistory(
      stats.map((stat) => stat.date),
      stats
    );
    expect(signals?.hasFollowUpFix).toBe(true);
    expect(signals?.isExempt).toBe(true);
    expect(
      scoreCommitHistoryPenalty(
        stats.map((stat) => stat.date),
        undefined,
        stats
      )
    ).toBe(0);
  });
});
