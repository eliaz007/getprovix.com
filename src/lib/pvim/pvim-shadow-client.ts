/**
 * Server-side HTTP client for the standalone PVIM-1 shadow analysis service.
 *
 * Reads `PVIM_SHADOW_URL` and `PVIM_SERVICE_TOKEN` only (never `NEXT_PUBLIC_*`).
 * Never throws to callers — always returns a typed result.
 * Does not convert PVIM findings into Provix `violations`.
 */

import type {
  FirewallPvimAnalysis,
  FirewallPvimFinding,
  FirewallPvimReasoning,
  FirewallPvimRemediationStatus,
} from "@/lib/firewall-contract";
import {
  adaptPvimFinding,
  type PvimFindingLike,
} from "@/lib/pvim/pvim-remediation-adapter";

export const PVIM_SHADOW_REQUEST_SCHEMA = "pvim.shadow_request.v1" as const;
export const PVIM_SHADOW_REPORT_SCHEMA = "pvim.shadow_finding_report.v1" as const;
export const PVIM_SHADOW_REASONING_SCHEMA = "pvim.shadow_reasoning.v1" as const;

/** Bounded plain-text extraction from advisory payloads (display only). */
const REASONING_NOTES_MAX = 500;
const REASONING_OPEN_QUESTIONS_MAX = 8;
const REASONING_OPEN_QUESTION_LEN = 200;
const REASONING_ANSWER_BLURBS_MAX = 8;
const REASONING_ANSWER_BLURB_LEN = 240;

export const PVIM_SHADOW_REASONING_STATUSES = [
  "skipped",
  "present",
  "unavailable",
  "invalid",
] as const;

export type PvimShadowReasoningStatus = (typeof PVIM_SHADOW_REASONING_STATUSES)[number];

/**
 * Wire shape of ``pvim.shadow_reasoning.v1`` (PVIM ShadowReasoningSection).
 * ``advisory`` is opaque — Provix never deep-validates the full advisory schema.
 */
export type PvimShadowReasoningV1 = {
  schema_version: typeof PVIM_SHADOW_REASONING_SCHEMA;
  authoritative: false;
  may_authorize_remediation: false;
  status: PvimShadowReasoningStatus;
  detail: string;
  provider?: string | null;
  case_id?: string | null;
  case_selection?: string | null;
  stop_reason?: string | null;
  error?: string | null;
  has_critical_reliability_flags: boolean;
  critical_reliability_flags: string[];
  advisory?: Record<string, unknown> | null;
};

/** Mirrors PVIM `IntegrationLimits` defaults (M4.1). */
export const PVIM_SHADOW_LIMITS = {
  maxFiles: 500,
  maxFileBytes: 512_000,
  maxTotalBytes: 5_000_000,
  maxPathLength: 512,
  maxJobIdLength: 128,
  maxCommitShaLength: 64,
} as const;

/** Default client wall-clock budget for the HTTP round-trip (~10s). */
export const DEFAULT_PVIM_SHADOW_TIMEOUT_MS = 10_000;

export type PvimShadowFileInput = {
  path: string;
  content: string;
  language?: string | null;
};

export type PvimShadowAnalyzeOptions = {
  runM1?: boolean;
  runM2?: boolean;
  /** Soft analyzer budget forwarded to PVIM (seconds). Optional. */
  timeoutSeconds?: number;
};

export type PvimShadowRequestInput = {
  jobId: string;
  commitSha?: string;
  files: PvimShadowFileInput[];
  options?: PvimShadowAnalyzeOptions;
  repository?: {
    provider?: string;
    owner?: string;
    name?: string;
    defaultBranch?: string;
  };
};

/** Exact wire shape of `pvim.shadow_request.v1`. */
export type PvimShadowRequestV1 = {
  schema_version: typeof PVIM_SHADOW_REQUEST_SCHEMA;
  job_id: string;
  commit_sha: string;
  files: Array<{ path: string; content: string; language?: string }>;
  options: {
    run_m1: boolean;
    run_m2: boolean;
    timeout_seconds?: number;
  };
  repository?: {
    provider: string;
    owner: string;
    name: string;
    default_branch: string;
  };
};

export type PvimShadowFindingV1 = {
  finding_id: string;
  source: "m1" | "m2";
  family?: string | null;
  label: string;
  message?: string;
  confidence: string;
  rule_id: string;
  path?: string | null;
  start_line?: number | null;
  end_line?: number | null;
  start_col?: number | null;
  end_col?: number | null;
  evidence?: Array<{
    path: string;
    line?: number | null;
    kind: string;
    detail?: string;
    fact_id?: string | null;
  }>;
};

export type PvimShadowIncompleteV1 = {
  code: string;
  message: string;
  path?: string | null;
  detail?: Record<string, unknown>;
};

export type PvimShadowReportStatus = "ok" | "incomplete" | "error" | "timeout";

export type PvimShadowReportV1 = {
  schema_version: typeof PVIM_SHADOW_REPORT_SCHEMA;
  engine_version: string;
  job_id: string;
  /**
   * PVIM report status:
   * - ok: finished with no enrichment coverage gaps
   * - incomplete: finished with partial coverage (not a clean scan)
   * - error / timeout: analysis did not complete
   */
  status: PvimShadowReportStatus;
  commit_sha: string;
  findings: PvimShadowFindingV1[];
  incomplete_analysis: PvimShadowIncompleteV1[];
  stats: {
    files_analyzed?: number;
    finding_count?: number;
    by_confidence?: Record<string, number>;
    by_family?: Record<string, number>;
    m1_ran?: boolean;
    m2_ran?: boolean;
    elapsed_ms?: number;
  };
  error: { code: string; message: string; details?: string[] } | null;
  /**
   * Optional non-authoritative reasoning section (`pvim.shadow_reasoning.v1`).
   * Omitted / null when PVIM did not attach reasoning. Invalid sections are
   * discarded during parse without rejecting deterministic findings.
   */
  reasoning?: PvimShadowReasoningV1 | null;
};

export type PvimShadowClientStatus =
  | "absent"
  | "unavailable"
  | "timeout"
  | "error"
  | "invalid_response"
  | "ok"
  | "incomplete";

export type PvimShadowRejectionCode =
  | "too_many_files"
  | "file_too_large"
  | "total_too_large"
  | "invalid_path"
  | "prohibited_path"
  | "empty_files"
  | "invalid_job_id"
  | "invalid_commit_sha"
  | "invalid_options";

export type PvimShadowClientResult = {
  status: PvimShadowClientStatus;
  /** Machine-readable failure/rejection code when applicable. */
  code?: string;
  message?: string;
  /** Validated report when the service returned a contract-valid body. */
  report?: PvimShadowReportV1;
  /** Structured rejection reasons when the payload was not sent. */
  rejections?: string[];
  /** Wall-clock elapsed for the client attempt (ms). */
  elapsedMs: number;
};

export type PvimShadowClientDeps = {
  /** Injected for tests. Defaults to global fetch. */
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Override env reads (tests). Never accept caller-controlled service URLs in production paths. */
  url?: string | null;
  token?: string | null;
};

const CONTROL_OR_NUL = /[\x00-\x1f\x7f]/;
const WINDOWS_DRIVE = /^[a-zA-Z]:/;
const COMMIT_SHA_RE = /^(?:[0-9a-fA-F]{4,40}|[0-9a-fA-F]{64})?$/;

const PROHIBITED_BASENAMES = new Set(
  [
    ".env",
    ".env.local",
    ".env.development",
    ".env.production",
    ".env.test",
    ".env.staging",
    "credentials.json",
    "credentials.yml",
    "credentials.yaml",
    "secrets.json",
    "secrets.yml",
    "secrets.yaml",
    "service-account.json",
    "serviceaccount.json",
    "id_rsa",
    "id_dsa",
    "id_ecdsa",
    "id_ed25519",
    ".netrc",
    ".npmrc",
    ".pypirc",
    "token",
    "password",
    "secret",
    "passwd",
  ].map((s) => s.toLowerCase())
);

const PROHIBITED_SUFFIXES = [".pem", ".p12", ".pfx", ".key", ".keystore", ".jks"] as const;

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function readEnv(name: string): string {
  const raw = process.env[name];
  return typeof raw === "string" ? raw.trim() : "";
}

/** Resolve server-only settings. Never uses `NEXT_PUBLIC_*`. */
export function resolvePvimShadowSettings(deps?: PvimShadowClientDeps): {
  url: string;
  token: string;
  timeoutMs: number;
} {
  const url =
    deps?.url !== undefined && deps.url !== null
      ? String(deps.url).trim()
      : readEnv("PVIM_SHADOW_URL");
  const token =
    deps?.token !== undefined && deps.token !== null
      ? String(deps.token).trim()
      : readEnv("PVIM_SERVICE_TOKEN");
  const timeoutRaw = readEnv("PVIM_SHADOW_TIMEOUT_MS");
  let timeoutMs = deps?.timeoutMs ?? DEFAULT_PVIM_SHADOW_TIMEOUT_MS;
  if (deps?.timeoutMs === undefined && timeoutRaw) {
    const parsed = Number.parseInt(timeoutRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0) timeoutMs = parsed;
  }
  return { url, token, timeoutMs };
}

/**
 * Canonicalize a repo-relative path the same way PVIM M4.1 does.
 * Rejects absolute paths, drive letters, and `..` escapes.
 */
export function canonicalizePvimRepoPath(path: string): { ok: true; path: string } | { ok: false; reason: string } {
  if (CONTROL_OR_NUL.test(path)) {
    return { ok: false, reason: `path contains NUL or control characters: ${JSON.stringify(path)}` };
  }
  const normalized = path.replace(/\\/g, "/").trim();
  if (!normalized) return { ok: false, reason: "empty path" };
  if (normalized.startsWith("/") || normalized.startsWith("//")) {
    return { ok: false, reason: `path escapes repository root: ${JSON.stringify(path)}` };
  }
  if (WINDOWS_DRIVE.test(normalized) || /^[a-zA-Z]:\\/.test(path)) {
    return { ok: false, reason: `path escapes repository root: ${JSON.stringify(path)}` };
  }

  const parts: string[] = [];
  for (const part of normalized.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) {
        return { ok: false, reason: `path escapes repository root: ${JSON.stringify(path)}` };
      }
      parts.pop();
      continue;
    }
    if (CONTROL_OR_NUL.test(part)) {
      return { ok: false, reason: `path contains NUL or control characters: ${JSON.stringify(path)}` };
    }
    parts.push(part);
  }
  if (parts.length === 0) return { ok: false, reason: "empty path" };
  const canonical = parts.join("/");
  if (canonical.length > PVIM_SHADOW_LIMITS.maxPathLength) {
    return { ok: false, reason: "path exceeds maximum length" };
  }
  return { ok: true, path: canonical };
}

function isProhibitedPath(canonical: string): string | null {
  const basename = canonical.split("/").pop() ?? "";
  const lower = basename.toLowerCase();
  if (PROHIBITED_BASENAMES.has(lower)) {
    return `prohibited secret-bearing filename: ${basename}`;
  }
  if (/^\.env(\.|$)/i.test(basename)) {
    return `prohibited env file: ${basename}`;
  }
  if (PROHIBITED_SUFFIXES.some((suf) => lower.endsWith(suf))) {
    return `prohibited credential/key file: ${basename}`;
  }
  return null;
}

function redactSecrets(value: string, token: string): string {
  if (!token) return value;
  return value.split(token).join("[redacted]");
}

function analyzeEndpoint(baseUrl: string): string | null {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    // Fixed path only — callers cannot inject arbitrary URLs or query strings.
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}/v1/analyze`;
  } catch {
    return null;
  }
}

/**
 * Validate and bound a request before any network I/O.
 * Never silently truncates files or the file list.
 */
export function buildPvimShadowRequest(
  input: PvimShadowRequestInput
):
  | { ok: true; request: PvimShadowRequestV1; totalBytes: number }
  | { ok: false; code: PvimShadowRejectionCode; rejections: string[] } {
  const rejections: string[] = [];

  const jobId = typeof input.jobId === "string" ? input.jobId.trim() : "";
  if (!jobId || jobId.length > PVIM_SHADOW_LIMITS.maxJobIdLength || CONTROL_OR_NUL.test(jobId)) {
    return {
      ok: false,
      code: "invalid_job_id",
      rejections: ["job_id must be a non-empty printable string within length limits"],
    };
  }

  const commitShaRaw = typeof input.commitSha === "string" ? input.commitSha.trim() : "";
  if (
    commitShaRaw.length > PVIM_SHADOW_LIMITS.maxCommitShaLength ||
    !COMMIT_SHA_RE.test(commitShaRaw)
  ) {
    return {
      ok: false,
      code: "invalid_commit_sha",
      rejections: ["commit_sha must be empty or a Git SHA (4–40 hex, or 64 hex)"],
    };
  }
  const commitSha = commitShaRaw.toLowerCase();

  if (!Array.isArray(input.files) || input.files.length === 0) {
    return { ok: false, code: "empty_files", rejections: ["files must be a non-empty array"] };
  }
  if (input.files.length > PVIM_SHADOW_LIMITS.maxFiles) {
    return {
      ok: false,
      code: "too_many_files",
      rejections: [
        `too many files: ${input.files.length} exceeds max_files=${PVIM_SHADOW_LIMITS.maxFiles}`,
      ],
    };
  }

  const runM1 = input.options?.runM1 !== false;
  const runM2 = input.options?.runM2 !== false;
  if (!runM1 && !runM2) {
    return {
      ok: false,
      code: "invalid_options",
      rejections: ["options.run_m1 and options.run_m2 cannot both be false"],
    };
  }

  const files: PvimShadowRequestV1["files"] = [];
  const seen = new Set<string>();
  let totalBytes = 0;
  let oversizedFile = false;

  for (let i = 0; i < input.files.length; i++) {
    const file = input.files[i]!;
    const canon = canonicalizePvimRepoPath(typeof file.path === "string" ? file.path : "");
    const display = canon.ok ? canon.path : String(file.path ?? "");
    const prefix = `files[${i}] (${JSON.stringify(display)})`;

    if (!canon.ok) {
      rejections.push(`${prefix}: ${canon.reason}`);
      continue;
    }

    const prohibited = isProhibitedPath(canon.path);
    if (prohibited) {
      rejections.push(`${prefix}: ${prohibited}`);
      continue;
    }

    const caseKey = canon.path.toLowerCase();
    if (seen.has(caseKey)) {
      rejections.push(`${prefix}: duplicate path`);
      continue;
    }
    seen.add(caseKey);

    if (typeof file.content !== "string" || file.content === "") {
      rejections.push(`${prefix}: content must not be empty`);
      continue;
    }

    const size = utf8ByteLength(file.content);
    if (size > PVIM_SHADOW_LIMITS.maxFileBytes) {
      oversizedFile = true;
      rejections.push(
        `${prefix}: content size ${size} exceeds max_file_bytes=${PVIM_SHADOW_LIMITS.maxFileBytes}`
      );
      continue;
    }
    totalBytes += size;

    const entry: PvimShadowRequestV1["files"][number] = {
      path: canon.path,
      content: file.content,
    };
    if (typeof file.language === "string" && file.language.trim()) {
      entry.language = file.language.trim();
    }
    files.push(entry);
  }

  if (totalBytes > PVIM_SHADOW_LIMITS.maxTotalBytes) {
    return {
      ok: false,
      code: "total_too_large",
      rejections: [
        ...rejections,
        `total content size ${totalBytes} exceeds max_total_bytes=${PVIM_SHADOW_LIMITS.maxTotalBytes}`,
      ],
    };
  }

  if (rejections.length > 0) {
    return {
      ok: false,
      code: oversizedFile
        ? "file_too_large"
        : rejections.some((r) => r.includes("prohibited"))
          ? "prohibited_path"
          : "invalid_path",
      rejections,
    };
  }

  const options: PvimShadowRequestV1["options"] = {
    run_m1: runM1,
    run_m2: runM2,
  };
  if (
    typeof input.options?.timeoutSeconds === "number" &&
    Number.isFinite(input.options.timeoutSeconds) &&
    input.options.timeoutSeconds > 0
  ) {
    options.timeout_seconds = input.options.timeoutSeconds;
  }

  const request: PvimShadowRequestV1 = {
    schema_version: PVIM_SHADOW_REQUEST_SCHEMA,
    job_id: jobId,
    commit_sha: commitSha,
    files,
    options,
  };

  if (input.repository) {
    request.repository = {
      provider: input.repository.provider ?? "unknown",
      owner: input.repository.owner ?? "",
      name: input.repository.name ?? "",
      default_branch: input.repository.defaultBranch ?? "",
    };
  }

  return { ok: true, request, totalBytes };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
}

function isOptionalNumber(value: unknown): value is number | null | undefined {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function clipPlainText(value: string, max: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/**
 * Parse optional ``reasoning`` from a shadow report.
 * Returns ``null`` when absent/null/invalid — never rejects the parent report.
 */
export function parsePvimShadowReasoning(value: unknown): PvimShadowReasoningV1 | null {
  if (value === undefined || value === null) return null;
  if (!isObject(value)) return null;
  if (value.schema_version !== PVIM_SHADOW_REASONING_SCHEMA) return null;
  if (value.authoritative !== false) return null;
  if (value.may_authorize_remediation !== false) return null;
  if (
    typeof value.status !== "string" ||
    !(PVIM_SHADOW_REASONING_STATUSES as readonly string[]).includes(value.status)
  ) {
    return null;
  }
  if (typeof value.detail !== "string") return null;
  if (typeof value.has_critical_reliability_flags !== "boolean") return null;
  if (!Array.isArray(value.critical_reliability_flags)) return null;

  const flags: string[] = [];
  for (const flag of value.critical_reliability_flags) {
    if (typeof flag !== "string") return null;
    const trimmed = flag.trim();
    if (trimmed) flags.push(trimmed);
  }

  if (
    !isOptionalString(value.provider) ||
    !isOptionalString(value.case_id) ||
    !isOptionalString(value.case_selection) ||
    !isOptionalString(value.stop_reason) ||
    !isOptionalString(value.error)
  ) {
    return null;
  }

  let advisory: Record<string, unknown> | null | undefined;
  if (value.advisory === undefined) {
    advisory = undefined;
  } else if (value.advisory === null) {
    advisory = null;
  } else if (isObject(value.advisory)) {
    advisory = value.advisory;
  } else {
    return null;
  }

  // Present status may include an advisory body; other statuses should not rely on it.
  if (value.status !== "present") {
    advisory = null;
  }

  return {
    schema_version: PVIM_SHADOW_REASONING_SCHEMA,
    authoritative: false,
    may_authorize_remediation: false,
    status: value.status as PvimShadowReasoningStatus,
    detail: value.detail,
    provider: typeof value.provider === "string" ? value.provider : value.provider === null ? null : undefined,
    case_id: typeof value.case_id === "string" ? value.case_id : value.case_id === null ? null : undefined,
    case_selection:
      typeof value.case_selection === "string"
        ? value.case_selection
        : value.case_selection === null
          ? null
          : undefined,
    stop_reason:
      typeof value.stop_reason === "string"
        ? value.stop_reason
        : value.stop_reason === null
          ? null
          : undefined,
    error: typeof value.error === "string" ? value.error : value.error === null ? null : undefined,
    has_critical_reliability_flags: value.has_critical_reliability_flags,
    critical_reliability_flags: flags,
    ...(advisory !== undefined ? { advisory } : {}),
  };
}

/**
 * Convert validated wire reasoning into the firewall display DTO.
 * Extracts only approved plain-text fields from ``advisory`` when status is present.
 */
export function toFirewallPvimReasoning(
  reasoning: PvimShadowReasoningV1 | null | undefined
): FirewallPvimReasoning | undefined {
  if (!reasoning) return undefined;

  const base: FirewallPvimReasoning = {
    status: reasoning.status,
    detail: reasoning.detail,
    hasCriticalReliabilityFlags: reasoning.has_critical_reliability_flags,
    criticalReliabilityFlags: [...reasoning.critical_reliability_flags],
    ...(typeof reasoning.provider === "string" || reasoning.provider === null
      ? { provider: reasoning.provider }
      : {}),
    ...(typeof reasoning.case_id === "string" || reasoning.case_id === null
      ? { caseId: reasoning.case_id }
      : {}),
    ...(typeof reasoning.case_selection === "string" || reasoning.case_selection === null
      ? { caseSelection: reasoning.case_selection }
      : {}),
    ...(typeof reasoning.stop_reason === "string" || reasoning.stop_reason === null
      ? { stopReason: reasoning.stop_reason }
      : {}),
    ...(typeof reasoning.error === "string" || reasoning.error === null
      ? { error: reasoning.error }
      : {}),
  };

  if (reasoning.status !== "present") {
    return base;
  }

  const advisory = reasoning.advisory;
  if (!advisory || !isObject(advisory)) {
    return base;
  }

  if (typeof advisory.notes === "string" && advisory.notes.trim()) {
    base.notes = clipPlainText(advisory.notes, REASONING_NOTES_MAX);
  }

  if (Array.isArray(advisory.open_questions)) {
    const questions: string[] = [];
    for (const item of advisory.open_questions) {
      if (questions.length >= REASONING_OPEN_QUESTIONS_MAX) break;
      if (typeof item !== "string" || !item.trim()) continue;
      questions.push(clipPlainText(item, REASONING_OPEN_QUESTION_LEN));
    }
    if (questions.length > 0) base.openQuestions = questions;
  }

  const investigation = advisory.investigation;
  if (isObject(investigation) && Array.isArray(investigation.answers)) {
    const blurbs: string[] = [];
    for (const answer of investigation.answers) {
      if (blurbs.length >= REASONING_ANSWER_BLURBS_MAX) break;
      if (!isObject(answer)) continue;
      const text =
        typeof answer.answer_text === "string"
          ? answer.answer_text
          : typeof answer.answerText === "string"
            ? answer.answerText
            : null;
      if (!text || !text.trim()) continue;
      const qid =
        typeof answer.question_id === "string"
          ? answer.question_id.trim()
          : typeof answer.questionId === "string"
            ? answer.questionId.trim()
            : "";
      const body = clipPlainText(text, REASONING_ANSWER_BLURB_LEN);
      blurbs.push(qid ? `${qid}: ${body}` : body);
    }
    if (blurbs.length > 0) base.answerBlurbs = blurbs;
  }

  return base;
}

/** Validate a PVIM shadow finding report before accepting it. */
export function parsePvimShadowReport(
  value: unknown
): { ok: true; report: PvimShadowReportV1 } | { ok: false; message: string } {
  if (!isObject(value)) return { ok: false, message: "response must be a JSON object" };
  if (value.schema_version !== PVIM_SHADOW_REPORT_SCHEMA) {
    return {
      ok: false,
      message: `schema_version must be ${PVIM_SHADOW_REPORT_SCHEMA}`,
    };
  }
  if (typeof value.engine_version !== "string" || !value.engine_version) {
    return { ok: false, message: "engine_version must be a non-empty string" };
  }
  if (typeof value.job_id !== "string" || !value.job_id) {
    return { ok: false, message: "job_id must be a non-empty string" };
  }
  if (
    value.status !== "ok" &&
    value.status !== "incomplete" &&
    value.status !== "error" &&
    value.status !== "timeout"
  ) {
    return { ok: false, message: "status must be ok, incomplete, error, or timeout" };
  }
  if (typeof value.commit_sha !== "string") {
    return { ok: false, message: "commit_sha must be a string" };
  }
  if (!Array.isArray(value.findings)) {
    return { ok: false, message: "findings must be an array" };
  }
  if (!Array.isArray(value.incomplete_analysis)) {
    return { ok: false, message: "incomplete_analysis must be an array" };
  }
  if (!isObject(value.stats)) {
    return { ok: false, message: "stats must be an object" };
  }

  const findings: PvimShadowFindingV1[] = [];
  for (let i = 0; i < value.findings.length; i++) {
    const f = value.findings[i];
    if (!isObject(f)) return { ok: false, message: `findings[${i}] must be an object` };
    if (typeof f.finding_id !== "string" || !f.finding_id) {
      return { ok: false, message: `findings[${i}].finding_id is required` };
    }
    if (f.source !== "m1" && f.source !== "m2") {
      return { ok: false, message: `findings[${i}].source must be m1 or m2` };
    }
    if (typeof f.label !== "string" || !f.label) {
      return { ok: false, message: `findings[${i}].label is required` };
    }
    if (typeof f.confidence !== "string" || !f.confidence) {
      return { ok: false, message: `findings[${i}].confidence is required` };
    }
    if (typeof f.rule_id !== "string") {
      return { ok: false, message: `findings[${i}].rule_id must be a string` };
    }
    if (!isOptionalString(f.path) || !isOptionalNumber(f.start_line)) {
      return { ok: false, message: `findings[${i}] has invalid path/start_line` };
    }
    findings.push({
      finding_id: f.finding_id,
      source: f.source,
      family: typeof f.family === "string" || f.family === null ? f.family : undefined,
      label: f.label,
      message: typeof f.message === "string" ? f.message : "",
      confidence: f.confidence,
      rule_id: f.rule_id,
      path: typeof f.path === "string" ? f.path : f.path === null ? null : undefined,
      start_line: typeof f.start_line === "number" ? f.start_line : f.start_line === null ? null : undefined,
      end_line: typeof f.end_line === "number" ? f.end_line : undefined,
      start_col: typeof f.start_col === "number" ? f.start_col : undefined,
      end_col: typeof f.end_col === "number" ? f.end_col : undefined,
    });
  }

  const incomplete: PvimShadowIncompleteV1[] = [];
  for (let i = 0; i < value.incomplete_analysis.length; i++) {
    const w = value.incomplete_analysis[i];
    if (!isObject(w)) return { ok: false, message: `incomplete_analysis[${i}] must be an object` };
    if (typeof w.code !== "string" || typeof w.message !== "string") {
      return { ok: false, message: `incomplete_analysis[${i}] requires code and message` };
    }
    incomplete.push({
      code: w.code,
      message: w.message,
      path: typeof w.path === "string" ? w.path : w.path === null ? null : undefined,
    });
  }

  let error: PvimShadowReportV1["error"] = null;
  if (value.error !== null && value.error !== undefined) {
    if (!isObject(value.error) || typeof value.error.code !== "string" || typeof value.error.message !== "string") {
      return { ok: false, message: "error must be null or {code,message}" };
    }
    error = {
      code: value.error.code,
      message: value.error.message,
      details: Array.isArray(value.error.details)
        ? value.error.details.filter((d): d is string => typeof d === "string")
        : [],
    };
  }

  const stats = value.stats;
  // Fail-open for reasoning: invalid/malformed sections are dropped; findings stay.
  const reasoning = parsePvimShadowReasoning(value.reasoning);
  return {
    ok: true,
    report: {
      schema_version: PVIM_SHADOW_REPORT_SCHEMA,
      engine_version: value.engine_version,
      job_id: value.job_id,
      status: value.status,
      commit_sha: value.commit_sha,
      findings,
      incomplete_analysis: incomplete,
      stats: {
        files_analyzed: typeof stats.files_analyzed === "number" ? stats.files_analyzed : 0,
        finding_count: typeof stats.finding_count === "number" ? stats.finding_count : findings.length,
        by_confidence: isObject(stats.by_confidence)
          ? (stats.by_confidence as Record<string, number>)
          : {},
        by_family: isObject(stats.by_family) ? (stats.by_family as Record<string, number>) : {},
        m1_ran: Boolean(stats.m1_ran),
        m2_ran: Boolean(stats.m2_ran),
        elapsed_ms: typeof stats.elapsed_ms === "number" ? stats.elapsed_ms : 0,
      },
      error,
      ...(reasoning ? { reasoning } : {}),
    },
  };
}

/**
 * Map wire report status → client status.
 * Partial coverage (`incomplete` status or non-empty incomplete_analysis) is never "ok".
 * Hard failures remain error/timeout; invalid payloads are handled before this helper.
 */
export function mapReportStatus(report: PvimShadowReportV1): PvimShadowClientStatus {
  if (report.status === "timeout") return "timeout";
  if (report.status === "error") return "error";
  if (report.status === "incomplete" || report.incomplete_analysis.length > 0) {
    return "incomplete";
  }
  return "ok";
}

/**
 * Map a client result onto the Phase 3A `FirewallPvimAnalysis` summary.
 * `invalid_response` collapses to `error` (not in the Phase 3A enum).
 */
export function toFirewallPvimAnalysis(result: PvimShadowClientResult): FirewallPvimAnalysis {
  const report = result.report;
  const status: FirewallPvimAnalysis["status"] =
    result.status === "invalid_response"
      ? "error"
      : result.status === "absent"
        ? "absent"
        : result.status === "unavailable"
          ? "unavailable"
          : result.status === "timeout"
            ? "timeout"
            : result.status === "incomplete"
              ? "incomplete"
              : result.status === "ok"
                ? "ok"
                : "error";

  return {
    status,
    engineVersion: report?.engine_version,
    jobId: report?.job_id,
    findingCount: report?.findings.length ?? 0,
    incomplete: report?.incomplete_analysis.length ?? 0,
    elapsedMs: report?.stats.elapsed_ms ?? result.elapsedMs,
    message: result.message,
  };
}

export type ToFirewallPvimFindingsOptions = {
  /**
   * Pinned source content for adapter surface checks (e.g. `"use client"`).
   * Omit only in tests that assert unsupported paths; production scan always supplies it.
   */
  contentAtPath?: (filePath: string) => string | null;
};

function wireFindingForAdapter(f: PvimShadowFindingV1): PvimFindingLike {
  return {
    finding_id: f.finding_id,
    source: f.source,
    family: f.family,
    label: f.label,
    rule_id: f.rule_id,
    confidence: f.confidence,
    path: f.path,
    start_line: f.start_line,
    message: f.message,
    evidence: f.evidence,
  };
}

function remediationFromDecision(
  decision: ReturnType<typeof adaptPvimFinding>
): FirewallPvimRemediationStatus {
  if (decision.ok) {
    return {
      kind: "supported",
      category: decision.category,
      requiresScannerAgreement: true,
    };
  }
  return {
    kind: "unsupported",
    code: decision.code,
    reason: decision.message,
  };
}

/**
 * Convert validated PVIM findings into Phase 3A `pvimFindings` rows (not violations).
 * Adapter support is decided by `adaptPvimFinding`; scan-time Fix-with-PR honesty
 * (`applyPvimHonestFixGate`) may further downgrade `supported` → `scanner_does_not_agree`.
 */
export function toFirewallPvimFindings(
  report: PvimShadowReportV1,
  options?: ToFirewallPvimFindingsOptions
): FirewallPvimFinding[] {
  return report.findings.map((f) => {
    const decision = adaptPvimFinding(wireFindingForAdapter(f), {
      commitSha: report.commit_sha,
      contentAtPath: options?.contentAtPath,
    });
    return {
      findingId: f.finding_id,
      source: "pvim" as const,
      engineSource: f.source,
      label: f.label,
      ruleId: f.rule_id,
      confidence: f.confidence,
      family: f.family ?? null,
      filePath: f.path ?? null,
      line: typeof f.start_line === "number" ? f.start_line : null,
      message: f.message,
      ...(decision.ok && decision.snippet ? { snippet: decision.snippet } : {}),
      remediation: remediationFromDecision(decision),
    };
  });
}

/**
 * Call the PVIM shadow HTTP service with a bounded, validated request.
 * Never throws. Never retries. Never logs the bearer token.
 */
export async function analyzeWithPvimShadow(
  input: PvimShadowRequestInput,
  deps: PvimShadowClientDeps = {}
): Promise<PvimShadowClientResult> {
  const started = Date.now();
  const elapsed = () => Date.now() - started;

  try {
    const settings = resolvePvimShadowSettings(deps);
    if (!settings.url || !settings.token) {
      return {
        status: "unavailable",
        code: !settings.url ? "missing_url" : "missing_token",
        message: !settings.url
          ? "PVIM_SHADOW_URL is not configured."
          : "PVIM_SERVICE_TOKEN is not configured.",
        elapsedMs: elapsed(),
      };
    }

    const endpoint = analyzeEndpoint(settings.url);
    if (!endpoint) {
      return {
        status: "unavailable",
        code: "invalid_url",
        message: "PVIM_SHADOW_URL must be an http(s) URL.",
        elapsedMs: elapsed(),
      };
    }

    const built = buildPvimShadowRequest(input);
    if (!built.ok) {
      return {
        status: "error",
        code: built.code,
        message: "PVIM shadow request rejected before send (limits or path validation).",
        rejections: built.rejections,
        elapsedMs: elapsed(),
      };
    }

    const fetchImpl = deps.fetch ?? fetch;
    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.token}`,
        },
        body: JSON.stringify(built.request),
        signal: AbortSignal.timeout(settings.timeoutMs),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      const rawMessage = error instanceof Error ? error.message : "fetch failed";
      const message = redactSecrets(rawMessage, settings.token);
      if (name === "AbortError" || name === "TimeoutError") {
        return {
          status: "timeout",
          code: "timeout",
          message: `PVIM shadow request timed out after ${settings.timeoutMs}ms.`,
          elapsedMs: elapsed(),
        };
      }
      return {
        status: "unavailable",
        code: "connection_failed",
        message: `PVIM shadow service unreachable: ${message}`,
        elapsedMs: elapsed(),
      };
    }

    let rawText: string;
    try {
      rawText = await response.text();
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "failed to read body";
      return {
        status: "error",
        code: "body_read_failed",
        message: redactSecrets(rawMessage, settings.token),
        elapsedMs: elapsed(),
      };
    }

    if (!response.ok) {
      return {
        status: "error",
        code: `http_${response.status}`,
        message: `PVIM shadow service returned HTTP ${response.status}.`,
        elapsedMs: elapsed(),
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText) as unknown;
    } catch {
      return {
        status: "invalid_response",
        code: "malformed_json",
        message: "PVIM shadow response was not valid JSON.",
        elapsedMs: elapsed(),
      };
    }

    const validated = parsePvimShadowReport(parsed);
    if (!validated.ok) {
      return {
        status: "invalid_response",
        code: "invalid_schema",
        message: validated.message,
        elapsedMs: elapsed(),
      };
    }

    const status = mapReportStatus(validated.report);
    return {
      status,
      code: validated.report.error?.code,
      message: validated.report.error?.message,
      report: validated.report,
      elapsedMs: elapsed(),
    };
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "unexpected client failure";
    const token = resolvePvimShadowSettings(deps).token;
    return {
      status: "error",
      code: "client_failure",
      message: redactSecrets(rawMessage, token),
      elapsedMs: elapsed(),
    };
  }
}
