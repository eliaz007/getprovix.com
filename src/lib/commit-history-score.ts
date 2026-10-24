import { clampScore0to100 } from "@/lib/score-scale";

/** @deprecated Inactivity is an informational tag only — never a numeric ding. */
export const STALE_COMMIT_HISTORY_PENALTY = 0;
/** Empty or single-commit payloads. Not applied when dates were never fetched. */
export const SINGLE_COMMIT_HISTORY_PENALTY = -25;
/**
 * Stub / bulk-dump repos: ≤2 total commits, or one commit owns 100% of sampled churn
 * (any LOC). Recorded on metrics as a positive `commitHistoryPenalty`.
 */
export const STUB_REPO_HISTORY_PENALTY = -20;
/** >=80% of commits inside 4 hours on one calendar day. */
export const CLUSTERED_COMMIT_HISTORY_PENALTY = -20;
/** One commit dominates sampled churn with large line volume (≥1,500). */
export const DUMP_CHURN_HISTORY_PENALTY = -25;
/** Every sampled message looks like an Initial/first/generated commit. */
export const INITIAL_COMMIT_MESSAGE_PENALTY = -15;
/** Floor for combined date + churn dings (most severe wins, then stacks to this). */
export const MAX_COMMIT_HISTORY_PENALTY = -30;

export const SINGLE_DUMP_CADENCE_LABEL = "Single dump / Low cadence";
export const SUSPICIOUS_COMMIT_CADENCE_TITLE =
  "Suspicious Commit Cadence (Bulk Dump Detected)";
export const SUSPICIOUS_COMMIT_CADENCE_SUMMARY =
  "Code was ingested in a single uniterated dump or has fewer than 3 commits. Ship features via incremental branches and atomic PRs to demonstrate iterative development.";

const BURST_WINDOW_MS = 4 * 60 * 60 * 1000;
const BURST_COMMIT_FRACTION = 0.8;
/** Lines added+deleted in one commit that count as a heavy dump. */
const DUMP_CHURN_LINES = 1500;
/** One commit owns this share of sampled churn → dump (includes 100%). */
const DUMP_CHURN_SHARE = 0.7;
const INITIAL_COMMIT_MESSAGE =
  /^(initial(?:\s+commit)?|first(?:\s+commit)?|generated(?:\s+with)?|create(?:d)?\s+from\s+template)\b/i;

/** Optional per-commit stats for churn / dump detection. */
export type CommitHistoryStat = {
  date: string;
  additions?: number;
  deletions?: number;
  filesChanged?: number;
  message?: string;
};

function parseCommitTimestamps(
  commitDates: string[] | null | undefined
): number[] {
  return (commitDates ?? [])
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
}

function utcCalendarDay(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
}

/**
 * True when some window shorter than 4 hours holds at least 80% of the commits.
 * `timestamps` must be sorted ascending.
 */
function isOneShotCommitBurst(timestamps: number[]): boolean {
  const total = timestamps.length;
  for (let start = 0; start < total; start += 1) {
    let end = start;
    while (
      end + 1 < total &&
      timestamps[end + 1]! - timestamps[start]! < BURST_WINDOW_MS
    ) {
      end += 1;
    }
    if ((end - start + 1) / total >= BURST_COMMIT_FRACTION) {
      return true;
    }
  }
  return false;
}

function commitChurn(stat: CommitHistoryStat): number {
  const additions =
    typeof stat.additions === "number" && Number.isFinite(stat.additions)
      ? Math.max(0, stat.additions)
      : 0;
  const deletions =
    typeof stat.deletions === "number" && Number.isFinite(stat.deletions)
      ? Math.max(0, stat.deletions)
      : 0;
  return additions + deletions;
}

function scoreDumpChurnPenalty(
  commitStats: CommitHistoryStat[] | null | undefined
): number {
  if (!commitStats?.length) {
    return 0;
  }

  const churns = commitStats.map(commitChurn);
  const total = churns.reduce((sum, value) => sum + value, 0);
  const max = Math.max(0, ...churns);

  if (max >= DUMP_CHURN_LINES) {
    return DUMP_CHURN_HISTORY_PENALTY;
  }
  // One commit owns 100% of authored churn — stub dump at any LOC.
  if (total > 0 && max / total >= 1) {
    return STUB_REPO_HISTORY_PENALTY;
  }
  if (total > 0 && max / total >= DUMP_CHURN_SHARE) {
    return DUMP_CHURN_HISTORY_PENALTY;
  }

  const messages = commitStats
    .map((stat) => stat.message?.trim() ?? "")
    .filter(Boolean);
  if (
    messages.length > 0 &&
    messages.every((message) => INITIAL_COMMIT_MESSAGE.test(message))
  ) {
    return INITIAL_COMMIT_MESSAGE_PENALTY;
  }

  return 0;
}

/** True when the sampled history has fewer than 3 real commits (stub / dump). */
export function isStubCommitHistory(
  commitDates?: string[] | null,
  commitStats?: CommitHistoryStat[] | null
): boolean {
  if (commitDates == null && commitStats == null) {
    return false;
  }
  const dates =
    commitDates ??
    (commitStats ?? [])
      .map((stat) => stat.date)
      .filter((date): date is string => typeof date === "string");
  return parseCommitTimestamps(dates).length <= 2;
}

/**
 * Synthetic-history penalty from GitHub commit timestamps (+ optional churn).
 * Missing payload (`null` / `undefined`) is 0 — a failed fetch is not evidence.
 * 0–1 parsed commits → -25. Exactly 2 commits → -20 (stub / low cadence).
 * A single calendar day where >=80% of commits land inside 4 hours → -20.
 * One commit = 100% of sampled churn (any LOC) → -20. One commit ≥1500
 * churn (or ≥70% share) → -25. All "Initial commit"-shaped messages → -15.
 * Penalties take the most severe value, floored at MAX_COMMIT_HISTORY_PENALTY.
 * Age alone does not deduct.
 */
export function scoreCommitHistoryPenalty(
  commitDates?: string[] | null,
  _now?: number,
  commitStats?: CommitHistoryStat[] | null
): number {
  if (commitDates == null && commitStats == null) {
    return 0;
  }

  const dates =
    commitDates ??
    (commitStats ?? [])
      .map((stat) => stat.date)
      .filter((date): date is string => typeof date === "string");

  let penalty = 0;
  const parsed = parseCommitTimestamps(dates);
  if (commitDates != null || parsed.length > 0) {
    if (parsed.length <= 1) {
      penalty = SINGLE_COMMIT_HISTORY_PENALTY;
    } else if (parsed.length <= 2) {
      // ≤2 commits is a stub / bulk-dump signal regardless of calendar spread.
      penalty = STUB_REPO_HISTORY_PENALTY;
    } else {
      const days = new Set(parsed.map(utcCalendarDay));
      if (days.size < 2 && isOneShotCommitBurst(parsed)) {
        penalty = CLUSTERED_COMMIT_HISTORY_PENALTY;
      }
    }
  }

  // Stats-only path: ≤2 commits in commitStats when dates were omitted.
  if (
    commitDates == null &&
    commitStats != null &&
    commitStats.length > 0 &&
    commitStats.length <= 2
  ) {
    penalty = Math.min(penalty, STUB_REPO_HISTORY_PENALTY);
  }

  const churnPenalty = scoreDumpChurnPenalty(commitStats);
  penalty = Math.min(penalty, churnPenalty);
  return Math.max(MAX_COMMIT_HISTORY_PENALTY, penalty);
}

/** Apply a negative history ding to a 0–100 headline score. */
export function applyCommitHistoryPenalty(
  score: number,
  penalty: number
): number {
  const ding = Math.min(0, Math.round(penalty));
  return clampScore0to100(score + ding);
}
