import { clampScore0to100 } from "@/lib/score-scale";

/** Empty or single-commit payloads. Not applied when dates were never fetched. */
export const SINGLE_COMMIT_HISTORY_PENALTY = -60;
/** ≤2 commits with no exemption — hard stub / dump ding. */
export const STUB_REPO_HISTORY_PENALTY = -60;
/** ≥80% of commits inside a 4-hour window on a short calendar span. */
export const CLUSTERED_COMMIT_HISTORY_PENALTY = -22;
/** No follow-up fix/refactor after the opening push on a short span. */
export const NO_FOLLOW_UP_HISTORY_PENALTY = -18;
/** All scored subjects look like Initial/first/generated commits. */
export const INITIAL_COMMIT_MESSAGE_PENALTY = -15;
/** Floor for combined dings (most severe wins, then stacks to this). */
export const MAX_COMMIT_HISTORY_PENALTY = -60;

/** Small/medium: full dump dings. Mid: soft reduce. Large: reduce, never zero. */
export const COMMIT_HISTORY_SMALL_FILE_MAX = 75;
export const COMMIT_HISTORY_SMALL_LOC_MAX = 10_000;
export const COMMIT_HISTORY_LARGE_FILE_MIN = 250;
export const COMMIT_HISTORY_LARGE_LOC_MIN = 25_000;

/** Multi-week spread required for the (spread ∧ follow-up) exemption. */
export const MULTI_WEEK_SPREAD_MS = 14 * 24 * 60 * 60 * 1000;
/** Follow-ups must land at least this long after the first commit. */
export const FOLLOW_UP_MIN_GAP_MS = 24 * 60 * 60 * 1000;

const BURST_WINDOW_MS = 4 * 60 * 60 * 1000;
const BURST_COMMIT_FRACTION = 0.8;
const SHORT_SPAN_MS = 48 * 60 * 60 * 1000;

const INITIAL_COMMIT_MESSAGE =
  /^(initial(?:\s+commit)?|first(?:\s+commit)?|generated(?:\s+with)?|create(?:d)?\s+from\s+template)\b/i;

const FOLLOW_UP_MESSAGE =
  /\b(fix|fixes|fixed|bugfix|hotfix|patch|refactor|refactors|test|tests|chore|improve|improves|address|addresses|resolve|resolves|cleanup|clean\s*up)\b/i;

const BOT_LOGIN =
  /(?:\[bot\]$|bot$|^dependabot|^renovate|^github-actions|^greenkeeper|^codecov|^snyk-bot|^imgbot|^allcontributors|^copilot-swe-agent)/i;

const AI_TRAILER_LINE =
  /^\s*(co-authored-by|signed-off-by|generated\s+with|made-with|assisted-by)\s*:?\s*.*$/i;

const AI_IDENTITY_IN_TRAILER =
  /\b(cursor|claude|anthropic|chatgpt|openai|copilot|gemini|devin|aider|continuer|windsurf|grok|composer)\b/i;

export type CommitHistoryScale = {
  fileCount?: number | null;
  authoredLoc?: number | null;
};

export type CommitHistoryScaleTier = "small" | "mid" | "large";

/** Optional per-commit sample from GitHub list/detail payloads. */
export type CommitHistoryStat = {
  date: string;
  additions?: number;
  deletions?: number;
  filesChanged?: number;
  message?: string;
  authorLogin?: string;
  authorName?: string;
  sha?: string;
};

export type CommitHistorySignals = {
  commitCount: number;
  spanMs: number;
  hasMultiWeekSpread: boolean;
  hasFollowUpFix: boolean;
  humanAuthorCount: number;
  hasMultipleHumanAuthors: boolean;
  isExempt: boolean;
  isBurst: boolean;
  isShortSpan: boolean;
  allInitialMessages: boolean;
};

export function classifyCommitHistoryScale(
  scale?: CommitHistoryScale | null
): CommitHistoryScaleTier {
  const files =
    typeof scale?.fileCount === "number" && Number.isFinite(scale.fileCount)
      ? Math.max(0, Math.round(scale.fileCount))
      : 0;
  const loc =
    typeof scale?.authoredLoc === "number" && Number.isFinite(scale.authoredLoc)
      ? Math.max(0, Math.round(scale.authoredLoc))
      : 0;

  if (
    files > COMMIT_HISTORY_LARGE_FILE_MIN ||
    loc > COMMIT_HISTORY_LARGE_LOC_MIN
  ) {
    return "large";
  }
  if (
    files >= COMMIT_HISTORY_SMALL_FILE_MAX ||
    loc >= COMMIT_HISTORY_SMALL_LOC_MAX
  ) {
    return "mid";
  }
  return "small";
}

/**
 * Scale-weight a raw (negative) commit-history ding.
 * Large / mid trees get a reduced ding — never forced to 0 from size alone.
 */
export function applyCommitHistoryScaleWeight(
  penalty: number,
  scale?: CommitHistoryScale | null
): number {
  if (!(typeof penalty === "number" && Number.isFinite(penalty)) || penalty >= 0) {
    return 0;
  }
  const abs = Math.abs(Math.round(penalty));
  const tier = classifyCommitHistoryScale(scale);
  let weighted: number;
  if (tier === "large") {
    // ~35% relief, but keep dumps below the hygiene Verified floor (80).
    weighted = Math.max(21, Math.round(abs * 0.65));
  } else if (tier === "mid") {
    weighted = Math.max(1, Math.round(abs * 0.85));
  } else {
    weighted = abs;
  }
  return -Math.min(Math.abs(MAX_COMMIT_HISTORY_PENALTY), weighted);
}

function parseCommitTimestamps(
  commitDates: string[] | null | undefined
): number[] {
  return (commitDates ?? [])
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
}

/**
 * Strip Cursor / AI co-author trailers so message quality and follow-up
 * detection ignore assisted-by lines under the candidate's own login.
 */
export function stripAiAssistedTrailers(message: string): string {
  return message
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return true;
      }
      if (!AI_TRAILER_LINE.test(trimmed)) {
        return true;
      }
      return !AI_IDENTITY_IN_TRAILER.test(trimmed);
    })
    .join("\n")
    .trim();
}

export function commitSubject(message: string | undefined | null): string {
  if (!message) {
    return "";
  }
  const cleaned = stripAiAssistedTrailers(message);
  const subject = cleaned.split(/\r?\n/)[0]?.trim() ?? "";
  return subject;
}

export function isHumanAuthorLogin(login: string | undefined | null): boolean {
  const value = login?.trim() ?? "";
  if (!value) {
    return false;
  }
  return !BOT_LOGIN.test(value);
}

function collectHumanAuthors(stats: CommitHistoryStat[]): Set<string> {
  const authors = new Set<string>();
  for (const stat of stats) {
    const login = stat.authorLogin?.trim();
    if (login && isHumanAuthorLogin(login)) {
      authors.add(login.toLowerCase());
      continue;
    }
    // Name-only commits still count as human when no bot login is present.
    const name = stat.authorName?.trim();
    if (name && !BOT_LOGIN.test(name) && !stat.authorLogin) {
      authors.add(`name:${name.toLowerCase()}`);
    }
  }
  return authors;
}

/**
 * True when some window shorter than 4 hours holds at least 80% of the commits.
 * `timestamps` must be sorted ascending.
 */
function isOneShotCommitBurst(timestamps: number[]): boolean {
  const total = timestamps.length;
  if (total < 3) {
    return false;
  }
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

function hasFollowUpFixCommit(stats: CommitHistoryStat[]): boolean {
  const dated = stats
    .map((stat) => ({
      at: Date.parse(stat.date),
      subject: commitSubject(stat.message),
    }))
    .filter((entry) => Number.isFinite(entry.at))
    .sort((left, right) => left.at - right.at);

  if (dated.length < 2) {
    return false;
  }

  const firstAt = dated[0]!.at;
  return dated.some(
    (entry, index) =>
      index > 0 &&
      entry.at - firstAt >= FOLLOW_UP_MIN_GAP_MS &&
      FOLLOW_UP_MESSAGE.test(entry.subject)
  );
}

/** One-line dossier reason: commit count, time spread, authors. */
export function formatCommitHistoryReason(
  commitDates?: string[] | null,
  commitStats?: CommitHistoryStat[] | null
): string {
  const signals = analyzeCommitHistory(commitDates, commitStats);
  if (!signals) {
    return "History unavailable";
  }
  if (signals.commitCount <= 0) {
    return "0 commits sampled";
  }

  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const dayMs = 24 * 60 * 60 * 1000;
  let spread: string;
  if (signals.spanMs <= 0) {
    spread = "same-day span";
  } else if (signals.hasMultiWeekSpread) {
    spread = `${Math.max(2, Math.round(signals.spanMs / weekMs))}-week spread`;
  } else if (signals.spanMs < dayMs) {
    spread = "under 1-day span";
  } else {
    spread = `${Math.max(1, Math.round(signals.spanMs / dayMs))}-day span`;
  }

  const authors =
    signals.humanAuthorCount <= 0
      ? "unknown authors"
      : signals.humanAuthorCount === 1
        ? "1 author"
        : `${signals.humanAuthorCount} authors`;

  const commits =
    signals.commitCount === 1
      ? "1 commit"
      : `${signals.commitCount} commits`;

  return `${commits} · ${spread} · ${authors}`;
}

export function analyzeCommitHistory(
  commitDates?: string[] | null,
  commitStats?: CommitHistoryStat[] | null
): CommitHistorySignals | null {
  if (commitDates == null && commitStats == null) {
    return null;
  }

  const stats = commitStats ?? [];
  const dates =
    commitDates ??
    stats
      .map((stat) => stat.date)
      .filter((date): date is string => typeof date === "string");
  const timestamps = parseCommitTimestamps(dates);
  const commitCount = Math.max(timestamps.length, stats.length);
  const spanMs =
    timestamps.length >= 2
      ? timestamps[timestamps.length - 1]! - timestamps[0]!
      : 0;
  const hasMultiWeekSpread = spanMs >= MULTI_WEEK_SPREAD_MS;
  const hasFollowUpFix = hasFollowUpFixCommit(
    stats.length > 0
      ? stats
      : dates.map((date) => ({ date, message: undefined }))
  );
  const humanAuthors = collectHumanAuthors(stats);
  const humanAuthorCount = humanAuthors.size;
  const hasMultipleHumanAuthors = humanAuthorCount >= 2;
  const isExempt =
    (hasMultiWeekSpread && hasFollowUpFix) || hasMultipleHumanAuthors;

  const subjects = stats
    .map((stat) => commitSubject(stat.message))
    .filter(Boolean);
  const allInitialMessages =
    subjects.length > 0 &&
    subjects.every((subject) => INITIAL_COMMIT_MESSAGE.test(subject));

  return {
    commitCount,
    spanMs,
    hasMultiWeekSpread,
    hasFollowUpFix,
    humanAuthorCount,
    hasMultipleHumanAuthors,
    isExempt,
    isBurst: isOneShotCommitBurst(timestamps),
    isShortSpan: spanMs > 0 && spanMs < SHORT_SPAN_MS,
    allInitialMessages,
  };
}

/**
 * Synthetic-history penalty from GitHub commit timestamps (+ optional stats).
 * Missing payload (`null` / `undefined`) is 0 — a failed fetch is not evidence.
 * Real iteration is exempt when (multi-week spread ∧ follow-up fix) or ≥2 humans.
 * Large repos reduce the ding; size never forces penalty to 0.
 * AI co-author / Cursor trailers are ignored; human login is not dinged for AI help.
 */
export function scoreCommitHistoryPenalty(
  commitDates?: string[] | null,
  _now?: number,
  commitStats?: CommitHistoryStat[] | null,
  scale?: CommitHistoryScale | null
): number {
  const signals = analyzeCommitHistory(commitDates, commitStats);
  if (!signals) {
    return 0;
  }

  if (signals.isExempt) {
    return 0;
  }

  let penalty = 0;

  if (signals.commitCount <= 2) {
    // 0–2 commits share the stub ding (single-commit uses the same magnitude).
    penalty =
      signals.commitCount <= 1
        ? SINGLE_COMMIT_HISTORY_PENALTY
        : STUB_REPO_HISTORY_PENALTY;
  } else if (signals.isBurst && (signals.isShortSpan || !signals.hasMultiWeekSpread)) {
    penalty = CLUSTERED_COMMIT_HISTORY_PENALTY;
  } else if (!signals.hasFollowUpFix) {
    // Multi-week feat-only history is not exempt without a follow-up fix.
    penalty = NO_FOLLOW_UP_HISTORY_PENALTY;
  }

  if (signals.allInitialMessages) {
    penalty = Math.min(penalty, INITIAL_COMMIT_MESSAGE_PENALTY);
  }

  if (penalty >= 0) {
    return 0;
  }

  const raw = Math.max(MAX_COMMIT_HISTORY_PENALTY, penalty);
  return applyCommitHistoryScaleWeight(raw, scale);
}

/**
 * @deprecated Commit history is scored as Delivery Hygiene
 * (`Math.max(0, 100 - |penalty|)`) instead of subtracting from Code Health /
 * `productionScore`. Kept for legacy callers and tests.
 */
export function applyCommitHistoryPenalty(
  score: number,
  penalty: number
): number {
  const ding = Math.min(0, Math.round(penalty));
  return clampScore0to100(score + ding);
}
