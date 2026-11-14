import { isRepositoryTextPath } from "@/lib/github-source-file";
import type { SecurityCategory } from "@/lib/scanner/security-suite";

function normalizeCommitSha(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (/^[0-9a-f]{7,40}$/.test(trimmed) || /^[0-9a-f]{64}$/.test(trimmed)) return trimmed;
  return null;
}

/** Mirrors PVIM `Label` (`pvim.taxonomy.Label`). */
export const PVIM_LABELS = [
  "secret_hardcoded",
  "supabase_insecure_access",
  "nextjs_insecure_pattern",
  "authorization_flaw",
  "unsafe_db_access",
  "safe",
] as const;

export type PvimLabel = (typeof PVIM_LABELS)[number];

/** Mirrors PVIM `FindingConfidence`. */
export const PVIM_CONFIDENCES = ["confirmed", "potential", "insufficient_context"] as const;
export type PvimConfidence = (typeof PVIM_CONFIDENCES)[number];

/** Mirrors PVIM `EvidenceStep` / `ShadowFindingOut.evidence`. */
export type PvimEvidenceStep = {
  path: string;
  line?: number | null;
  kind: string;
  detail?: string;
  fact_id?: string | null;
};

/**
 * Subset of PVIM `ShadowFindingOut` accepted by Provix remediation.
 * Fields match the shadow report contract; unknown extras are ignored.
 */
export type PvimFindingLike = {
  finding_id: string;
  source: "m1" | "m2";
  family?: string | null;
  label: string;
  rule_id: string;
  confidence: string;
  path?: string | null;
  start_line?: number | null;
  message?: string;
  evidence?: PvimEvidenceStep[];
};

export type PvimAdaptContext = {
  commitSha: string;
  /** Content at the pinned SHA for surface checks. Null when unavailable. */
  contentAtPath?: (filePath: string) => string | null;
};

export type PvimRemediationRejectCode =
  | "unsupported_label"
  | "unsupported_rule"
  | "not_confirmed"
  | "missing_location"
  | "path_not_repo_relative"
  | "server_side_only"
  | "invalid_commit_sha";

export type PvimRemediationDecision =
  | {
      ok: true;
      category: Extract<SecurityCategory, "SECRET_LEAK" | "CLIENT_DB_EXPOSURE">;
      filePath: string;
      line: number;
      snippet?: string;
      commitSha: string;
      sourceFindingId: string;
      /** Always true today — Provix must independently agree via planSecurityFix. */
      requiresScannerAgreement: true;
    }
  | {
      ok: false;
      code: PvimRemediationRejectCode;
      label: string;
      ruleId: string;
      filePath: string | null;
      message: string;
    };

function hasUseClientDirective(content: string): boolean {
  const head = content.replace(/^\uFEFF/, "").slice(0, 800);
  return /^\s*(?:(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)\s*)*['"]use client['"]/.test(head);
}

function normalizeRepoPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\/+/, "");
}

function isUnsafePath(filePath: string): boolean {
  if (!filePath || filePath.includes("\0")) return true;
  if (/^[a-zA-Z]:[\\/]/.test(filePath) || filePath.startsWith("\\\\")) return true;
  if (filePath.startsWith("/") || filePath.startsWith("~")) return true;
  const normalized = normalizeRepoPath(filePath);
  const parts = normalized.split("/");
  return parts.some((part) => !part || part === "." || part === "..");
}

function resolveFilePath(finding: PvimFindingLike): string | null {
  if (typeof finding.path === "string" && finding.path.trim()) {
    return normalizeRepoPath(finding.path.trim());
  }
  for (const step of finding.evidence ?? []) {
    if (typeof step.path === "string" && step.path.trim()) {
      return normalizeRepoPath(step.path.trim());
    }
  }
  return null;
}

function resolveLine(finding: PvimFindingLike): number | null {
  if (typeof finding.start_line === "number" && Number.isInteger(finding.start_line) && finding.start_line >= 1) {
    return finding.start_line;
  }
  for (const step of finding.evidence ?? []) {
    if (typeof step.line === "number" && Number.isInteger(step.line) && step.line >= 1) {
      return step.line;
    }
  }
  return null;
}

function resolveSnippet(finding: PvimFindingLike): string | undefined {
  for (const step of finding.evidence ?? []) {
    if (typeof step.detail === "string" && step.detail.trim()) {
      return step.detail.trim().slice(0, 240);
    }
  }
  if (typeof finding.message === "string" && finding.message.trim()) {
    return finding.message.trim().slice(0, 240);
  }
  return undefined;
}

function familyKey(family: string | null | undefined): string {
  return (family ?? "").trim().toLowerCase();
}

function ruleKey(ruleId: string): string {
  return ruleId.trim().toLowerCase();
}

/** Service-role / RLS / M2 P2–P3 surfaces Provix cannot remediate today. */
function isServerSideOnlySupabase(finding: PvimFindingLike): boolean {
  const family = familyKey(finding.family);
  const rule = ruleKey(finding.rule_id);
  if (family === "p2" || family === "p3") return true;
  if (rule.startsWith("m2_p2_") || rule.startsWith("m2_p3_")) return true;
  if (rule.includes("service_role") || rule.includes("rls_")) return true;
  // M2 contextual findings (non-M1 family) are not client-query autofixes.
  if (finding.source === "m2" && family !== "m1") return true;
  return false;
}

function reject(
  code: PvimRemediationRejectCode,
  finding: PvimFindingLike,
  filePath: string | null,
  message: string
): PvimRemediationDecision {
  return {
    ok: false,
    code,
    label: typeof finding.label === "string" ? finding.label : "",
    ruleId: typeof finding.rule_id === "string" ? finding.rule_id : "",
    filePath,
    message,
  };
}

/**
 * Map a PVIM shadow finding into Provix security remediation inputs.
 * Unsupported findings return an explicit manual-review decision — never coerce
 * authorization / service-role / RLS into CLIENT_DB_EXPOSURE.
 */
export function adaptPvimFinding(
  finding: PvimFindingLike,
  ctx: PvimAdaptContext
): PvimRemediationDecision {
  const commitSha = normalizeCommitSha(ctx.commitSha);
  if (!commitSha) {
    return reject(
      "invalid_commit_sha",
      finding,
      null,
      "A valid audited commit SHA is required before Provix can open a remediation pull request."
    );
  }

  const label = typeof finding.label === "string" ? finding.label.trim() : "";
  const confidence = typeof finding.confidence === "string" ? finding.confidence.trim() : "";
  const filePath = resolveFilePath(finding);

  if (confidence !== "confirmed") {
    return reject(
      "not_confirmed",
      finding,
      filePath,
      "Only confirmed PVIM findings can be remediating automatically. This finding needs manual review."
    );
  }

  if (!filePath || isUnsafePath(filePath) || !isRepositoryTextPath(filePath)) {
    return reject(
      "path_not_repo_relative",
      finding,
      filePath,
      "The finding path is missing or is not a safe repository-relative source path."
    );
  }

  const line = resolveLine(finding);
  if (line == null) {
    return reject(
      "missing_location",
      finding,
      filePath,
      "The finding has no usable start line, so Provix cannot open a targeted fix pull request."
    );
  }

  const snippet = resolveSnippet(finding);
  const sourceFindingId =
    typeof finding.finding_id === "string" && finding.finding_id.trim()
      ? finding.finding_id.trim()
      : `${label}:${filePath}:${line}`;

  if (label === "authorization_flaw") {
    return reject(
      "unsupported_label",
      finding,
      filePath,
      "Authorization findings are not autofixable in Provix today. Review ownership checks manually."
    );
  }

  if (label === "nextjs_insecure_pattern" || label === "unsafe_db_access" || label === "safe") {
    return reject(
      "unsupported_label",
      finding,
      filePath,
      `PVIM label "${label}" has no Provix remediation template. Manual review is required.`
    );
  }

  if (label === "secret_hardcoded") {
    return {
      ok: true,
      category: "SECRET_LEAK",
      filePath,
      line,
      ...(snippet ? { snippet } : {}),
      commitSha,
      sourceFindingId,
      requiresScannerAgreement: true,
    };
  }

  if (label === "supabase_insecure_access") {
    if (isServerSideOnlySupabase(finding)) {
      return reject(
        "server_side_only",
        finding,
        filePath,
        "Service-role, RLS, and other server-side Supabase findings are not autofixable. Manual review is required."
      );
    }

    const content = ctx.contentAtPath?.(filePath) ?? null;
    if (content == null || !hasUseClientDirective(content)) {
      return reject(
        "server_side_only",
        finding,
        filePath,
        'Client database remediation requires a `"use client"` file at the pinned commit. This finding stays on manual review.'
      );
    }

    return {
      ok: true,
      category: "CLIENT_DB_EXPOSURE",
      filePath,
      line,
      ...(snippet ? { snippet } : {}),
      commitSha,
      sourceFindingId,
      requiresScannerAgreement: true,
    };
  }

  return reject(
    "unsupported_label",
    finding,
    filePath,
    `PVIM label "${label || "(missing)"}" is not supported for Provix remediation.`
  );
}

export function isPvimLabel(value: string): value is PvimLabel {
  return (PVIM_LABELS as readonly string[]).includes(value);
}
