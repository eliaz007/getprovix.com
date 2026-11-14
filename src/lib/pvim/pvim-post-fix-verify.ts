/**
 * PVIM-aware post-fix verification.
 * Re-runs the shadow client against proposed patched contents and fails closed
 * unless the original PVIM finding_id is gone. Never substitutes Provix results.
 */

import {
  analyzeWithPvimShadow,
  type PvimShadowClientDeps,
  type PvimShadowClientResult,
  type PvimShadowFileInput,
} from "@/lib/pvim/pvim-shadow-client";
import { selectPvimShadowFiles } from "@/lib/pvim/pvim-shadow-scan";

function normalizeCommitSha(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (/^[0-9a-f]{7,40}$/.test(trimmed) || /^[0-9a-f]{64}$/.test(trimmed)) return trimmed;
  return null;
}

export type PvimPostFixVerifyTarget = {
  findingId: string;
  ruleId: string;
  filePath: string;
  commitSha: string;
};

export type PvimPostFixVerifyReason =
  | "still-present"
  | "verify-failed"
  | "unavailable"
  | "timeout"
  | "invalid_response"
  | "incomplete";

export type PvimPostFixVerifyResult =
  | { ok: true }
  | {
      ok: false;
      reason: PvimPostFixVerifyReason;
      message: string;
      code?: string;
    };

export type PvimPostFixVerifyOptions = {
  /** Injected for tests. Defaults to `analyzeWithPvimShadow`. */
  analyze?: (
    input: Parameters<typeof analyzeWithPvimShadow>[0],
    deps?: PvimShadowClientDeps
  ) => Promise<PvimShadowClientResult>;
  clientDeps?: PvimShadowClientDeps;
  jobId?: string;
};

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\/+/, "");
}

function fail(
  reason: PvimPostFixVerifyReason,
  message: string,
  code?: string
): PvimPostFixVerifyResult {
  return {
    ok: false,
    reason,
    message: `${message} The pull request was not opened.`,
    ...(code ? { code } : {}),
  };
}

function sanitizeJobId(value: string): string {
  const cleaned = value.replace(/[^\w.:/-]+/g, "_").slice(0, 96);
  return cleaned || "pvim-postfix-verify";
}

/**
 * After a proposed patch is built, re-analyze the patched file set with PVIM.
 * Success requires a complete ok report that does not contain `original.findingId`.
 * Unrelated / new finding ids do not fail verification.
 */
export async function verifyPvimFixResolved(
  original: PvimPostFixVerifyTarget,
  patchedFiles: readonly PvimShadowFileInput[],
  options?: PvimPostFixVerifyOptions
): Promise<PvimPostFixVerifyResult> {
  try {
    const findingId = typeof original.findingId === "string" ? original.findingId.trim() : "";
    const ruleId = typeof original.ruleId === "string" ? original.ruleId.trim() : "";
    const filePath = normalizePath(typeof original.filePath === "string" ? original.filePath : "");
    const commitSha = normalizeCommitSha(original.commitSha);

    if (!findingId || !ruleId || !filePath) {
      return fail(
        "verify-failed",
        "Post-fix PVIM verification could not run: the original finding identity is incomplete."
      );
    }
    if (!commitSha) {
      return fail(
        "verify-failed",
        "Post-fix PVIM verification could not run: a valid pinned commit SHA is required."
      );
    }
    if (!Array.isArray(patchedFiles) || patchedFiles.length === 0) {
      return fail(
        "verify-failed",
        "Post-fix PVIM verification could not run: no patched files were provided."
      );
    }

    const selection = selectPvimShadowFiles(
      patchedFiles.map((file) => ({
        filePath: normalizePath(file.path),
        content: file.content,
      }))
    );

    if (selection.files.length === 0) {
      return fail(
        "incomplete",
        "Post-fix PVIM verification could not run: no eligible patched files remained after repository boundary checks."
      );
    }

    const analyzedPaths = new Set(selection.files.map((file) => file.path.toLowerCase()));
    if (!analyzedPaths.has(filePath.toLowerCase())) {
      return fail(
        "incomplete",
        `Post-fix PVIM verification could not include the original finding path (${filePath}) in the patched analysis.`
      );
    }

    const analyze = options?.analyze ?? analyzeWithPvimShadow;
    const jobId =
      options?.jobId?.trim() ||
      sanitizeJobId(`postfix-verify-${findingId}`);

    let result: PvimShadowClientResult;
    try {
      result = await analyze(
        {
          jobId,
          commitSha,
          files: selection.files,
          options: { runM1: true, runM2: true },
        },
        options?.clientDeps
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message.slice(0, 200) : "unexpected client failure";
      return fail(
        "verify-failed",
        `Post-fix PVIM verification could not complete (${detail}).`
      );
    }

    if (result.status === "unavailable" || result.status === "absent") {
      return fail(
        "unavailable",
        `Post-fix PVIM verification failed: PVIM is unavailable${result.code ? ` (${result.code})` : ""}.`,
        result.code
      );
    }
    if (result.status === "timeout") {
      return fail(
        "timeout",
        "Post-fix PVIM verification timed out while re-analyzing the proposed patch.",
        result.code ?? "timeout"
      );
    }
    if (result.status === "invalid_response") {
      return fail(
        "invalid_response",
        `Post-fix PVIM verification received an invalid response${result.message ? `: ${result.message}` : "."}`,
        result.code
      );
    }
    if (result.status === "incomplete") {
      return fail(
        "incomplete",
        "Post-fix PVIM verification is incomplete and cannot prove the original finding is resolved.",
        result.code
      );
    }
    if (result.status !== "ok" || !result.report) {
      return fail(
        "verify-failed",
        `Post-fix PVIM verification could not complete${result.message ? ` (${result.message})` : "."}`,
        result.code
      );
    }

    const report = result.report;
    // Fail closed: only a clean `ok` report with zero coverage gaps can clear a finding.
    if (report.status === "incomplete" || report.incomplete_analysis.length > 0) {
      return fail(
        "incomplete",
        "Post-fix PVIM verification reported incomplete analysis and cannot prove the original finding is resolved.",
        report.error?.code
      );
    }
    if (report.status !== "ok") {
      return fail(
        report.status === "timeout" ? "timeout" : "verify-failed",
        `Post-fix PVIM verification report status was "${report.status}".`,
        report.error?.code
      );
    }

    const residual = report.findings.find((finding) => finding.finding_id === findingId);
    if (residual) {
      const residualPath =
        typeof residual.path === "string" && residual.path.trim()
          ? residual.path
          : filePath;
      const residualLine =
        typeof residual.start_line === "number" ? `:${residual.start_line}` : "";
      return fail(
        "still-present",
        `Post-fix PVIM verification failed: the original finding_id "${findingId}" (rule ${ruleId}) is still present in the proposed patch (${residualPath}${residualLine}).`
      );
    }

    return { ok: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 200) : "unknown error";
    return fail(
      "verify-failed",
      `Post-fix PVIM verification could not complete (${detail}).`
    );
  }
}
