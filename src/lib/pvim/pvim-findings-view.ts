/**
 * Pure view-model helpers for the PVIM dashboard panel.
 * Keeps untrusted repository text as plain strings (React-escaped at render).
 */

import {
  isSecurityCategory,
  type FirewallPvimAnalysis,
  type FirewallPvimFinding,
  type FirewallPvimReasoning,
  type FirewallPvimRemediationStatus,
  type FirewallReport,
} from "@/lib/firewall-contract";
import type { PvimFindingLike } from "@/lib/pvim/pvim-remediation-adapter";

export type PvimStatusTone = "ok" | "warn" | "danger" | "neutral" | "info";

export type PvimAnalysisView = {
  /** When false, the dashboard should omit the PVIM panel entirely. */
  visible: boolean;
  status: FirewallPvimAnalysis["status"] | "absent";
  statusLabel: string;
  statusTone: PvimStatusTone;
  headline: string;
  detail: string | null;
  engineVersion: string | null;
  findingCount: number;
  incompleteCount: number;
  elapsedLabel: string | null;
  showsFindingsList: boolean;
  emptyFindingsMessage: string | null;
};

export type PvimRemediationView = {
  label: string;
  tone: PvimStatusTone;
  explanation: string | null;
  /** True only when remediation metadata explicitly marks the finding as supported. */
  claimsFixable: boolean;
};

export type PvimFindingView = {
  key: string;
  label: string;
  ruleId: string;
  confidence: string | null;
  family: string | null;
  filePath: string | null;
  line: number | null;
  message: string | null;
  snippet: string | null;
  remediation: PvimRemediationView;
  /** True only when Fix-with-PR may be offered for this finding + report pin. */
  offerFixWithPr: boolean;
};

export type PvimFixWithPrRequestBody = {
  kind: "security";
  repoUrl: string;
  filePath: string;
  commitSha: string;
  pvimFinding: PvimFindingLike;
  snippet?: string;
};

export type PvimReasoningView = {
  /** When false, the advisory subsection must not render. */
  visible: boolean;
  status: FirewallPvimReasoning["status"] | "absent";
  statusLabel: string;
  statusTone: PvimStatusTone;
  detail: string | null;
  needsHumanReview: boolean;
  criticalFlags: string[];
  /** True only for status=present — show notes / questions / blurbs. */
  showsAdvisoryBody: boolean;
  notes: string | null;
  openQuestions: string[];
  answerBlurbs: string[];
  disclaimer: string;
};

/**
 * Minimal Security-page PVIM status strip (not a findings panel).
 * Visible when a scan attached PVIM and either has findings or hit a real error.
 */
export type PvimSecurityStatusStrip = {
  visible: boolean;
  analysisStatus: FirewallPvimAnalysis["status"] | "absent";
  analysisLabel: string;
  analysisTone: PvimStatusTone;
  /** Always null — advisory pills were removed from the Security banner. */
  advisory: null;
  /** Accessible one-line summary. */
  summary: string;
  /** Detail line under the badge (empty on hidden / error-only strips). */
  disclaimer: string;
  findingCount: number;
};

const HIDDEN_STATUS_STRIP: PvimSecurityStatusStrip = {
  visible: false,
  analysisStatus: "absent",
  analysisLabel: "Absent",
  analysisTone: "neutral",
  advisory: null,
  summary: "",
  disclaimer: "",
  findingCount: 0,
};

const LABEL_DISPLAY: Record<string, string> = {
  secret_hardcoded: "Hardcoded secret",
  supabase_insecure_access: "Supabase access risk",
  nextjs_insecure_pattern: "Next.js insecure pattern",
  authorization_flaw: "Authorization flaw",
  unsafe_db_access: "Unsafe database access",
  safe: "Safe",
};

function asPlainText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Collapse whitespace for summary lines; never invent content. */
export function summarizePvimText(value: string | null | undefined, max = 200): string | null {
  const text = asPlainText(value);
  if (!text) return null;
  const compact = text.replace(/\s+/g, " ");
  if (compact.length <= max) return compact;
  return `${compact.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function formatPvimLabel(label: string): string {
  const known = LABEL_DISPLAY[label];
  if (known) return known;
  return label
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatPvimElapsed(elapsedMs: number | undefined): string | null {
  if (typeof elapsedMs !== "number" || !Number.isFinite(elapsedMs) || elapsedMs < 0) return null;
  if (elapsedMs < 1000) return `${Math.round(elapsedMs)} ms`;
  const seconds = elapsedMs / 1000;
  if (seconds < 10) return `${seconds.toFixed(1)} s`;
  return `${Math.round(seconds)} s`;
}

export function describePvimRemediation(
  remediation: FirewallPvimRemediationStatus | undefined
): PvimRemediationView {
  if (!remediation) {
    return {
      label: "Manual review",
      tone: "neutral",
      explanation: "No remediation decision is available for this finding yet.",
      claimsFixable: false,
    };
  }
  if (remediation.kind === "supported") {
    return {
      label: "Supported (review required)",
      tone: "info",
      explanation:
        "Provix can open a Fix-with-PR for this finding when you choose. No pull request is created until you click Fix with PR.",
      claimsFixable: true,
    };
  }
  if (remediation.kind === "unsupported") {
    return {
      label: "Not autofixable",
      tone: "neutral",
      explanation: asPlainText(remediation.reason) ?? `Unsupported (${remediation.code}).`,
      claimsFixable: false,
    };
  }
  return {
    label: "Pending review",
    tone: "neutral",
    explanation: "Recorded by PVIM; Provix has not evaluated remediation yet.",
    claimsFixable: false,
  };
}

export function buildPvimAnalysisView(
  analysis: FirewallPvimAnalysis | undefined | null,
  findings: readonly FirewallPvimFinding[] | undefined | null
): PvimAnalysisView {
  if (!analysis || analysis.status === "absent") {
    return {
      visible: false,
      status: "absent",
      statusLabel: "Absent",
      statusTone: "neutral",
      headline: "PVIM shadow analysis was not run.",
      detail: null,
      engineVersion: null,
      findingCount: 0,
      incompleteCount: 0,
      elapsedLabel: null,
      showsFindingsList: false,
      emptyFindingsMessage: null,
    };
  }

  const findingCount =
    typeof analysis.findingCount === "number" && Number.isFinite(analysis.findingCount)
      ? Math.max(0, analysis.findingCount)
      : findings?.length ?? 0;
  const incompleteCount =
    typeof analysis.incomplete === "number" && Number.isFinite(analysis.incomplete)
      ? Math.max(0, analysis.incomplete)
      : 0;
  const detail = summarizePvimText(analysis.message, 280);
  const engineVersion = asPlainText(analysis.engineVersion);
  const elapsedLabel = formatPvimElapsed(analysis.elapsedMs);
  const listed = findings ?? [];

  switch (analysis.status) {
    case "unavailable":
      return {
        visible: true,
        status: "unavailable",
        statusLabel: "Unavailable",
        statusTone: "warn",
        headline: "PVIM shadow analysis is unavailable.",
        detail: detail ?? "The PVIM service was not configured or could not be reached.",
        engineVersion,
        findingCount: 0,
        incompleteCount,
        elapsedLabel,
        showsFindingsList: false,
        emptyFindingsMessage: null,
      };
    case "timeout":
      return {
        visible: true,
        status: "timeout",
        statusLabel: "Timed out",
        statusTone: "warn",
        headline: "PVIM shadow analysis timed out.",
        detail: detail ?? "The request exceeded its time budget before a complete report arrived.",
        engineVersion,
        findingCount,
        incompleteCount,
        elapsedLabel,
        showsFindingsList: listed.length > 0,
        emptyFindingsMessage: null,
      };
    case "error":
      return {
        visible: true,
        status: "error",
        statusLabel: "Error",
        statusTone: "danger",
        headline: "PVIM shadow analysis failed.",
        detail: detail ?? "The PVIM service returned an error for this scan.",
        engineVersion,
        findingCount,
        incompleteCount,
        elapsedLabel,
        showsFindingsList: listed.length > 0,
        emptyFindingsMessage: null,
      };
    case "incomplete":
      return {
        visible: true,
        status: "incomplete",
        statusLabel: "Incomplete",
        statusTone: "warn",
        headline:
          findingCount > 0
            ? "PVIM completed with incomplete coverage."
            : "PVIM analysis is incomplete.",
        detail:
          detail ??
          "Some files were excluded or analysis did not finish fully. This is not a clean scan.",
        engineVersion,
        findingCount,
        incompleteCount,
        elapsedLabel,
        showsFindingsList: true,
        emptyFindingsMessage:
          listed.length === 0
            ? "No PVIM findings were returned for the files that were analyzed."
            : null,
      };
    case "ok":
    default:
      return {
        visible: true,
        status: "ok",
        statusLabel: findingCount > 0 ? "Findings" : "Clear",
        statusTone: findingCount > 0 ? "warn" : "ok",
        headline:
          findingCount > 0
            ? "PVIM shadow analysis completed."
            : "PVIM found no issues in the analyzed files.",
        detail,
        engineVersion,
        findingCount,
        incompleteCount,
        elapsedLabel,
        showsFindingsList: true,
        emptyFindingsMessage:
          listed.length === 0 ? "No PVIM findings for this commit." : null,
      };
  }
}

/** Resolve the original PVIM detector source for API round-trips. */
export function resolvePvimEngineSource(
  finding: Pick<FirewallPvimFinding, "engineSource" | "findingId">
): "m1" | "m2" | null {
  if (finding.engineSource === "m1" || finding.engineSource === "m2") return finding.engineSource;
  const id = asPlainText(finding.findingId);
  if (!id) return null;
  if (id.startsWith("m1:")) return "m1";
  if (id.startsWith("m2:")) return "m2";
  return null;
}

/**
 * Whether the dashboard may show an explicit Fix-with-PR control.
 * Requires scan-time `supported` remediation (adapter + Provix plan/heal/`tsc` gate).
 * Never true for unsupported / pending / incomplete / untrusted rows.
 */
export function canOfferPvimFixWithPr(
  finding: FirewallPvimFinding,
  report: Pick<FirewallReport, "commitSha">
): boolean {
  if (finding.remediation?.kind !== "supported") return false;
  if (finding.confidence.trim().toLowerCase() !== "confirmed") return false;
  if (!asPlainText(report.commitSha)) return false;
  if (!asPlainText(finding.filePath)) return false;
  if (typeof finding.line !== "number" || !Number.isInteger(finding.line) || finding.line < 1) {
    return false;
  }
  if (!resolvePvimEngineSource(finding)) return false;
  return true;
}

/**
 * Build the exact POST body for `/api/firewall/autofix/pr`.
 * Returns null when the finding is not eligible or the pin/repo is missing.
 */
export function buildPvimFixWithPrRequestBody(
  finding: FirewallPvimFinding,
  options: { repoSlug: string; commitSha: string }
): PvimFixWithPrRequestBody | null {
  const commitSha = asPlainText(options.commitSha);
  const repoUrl = asPlainText(options.repoSlug);
  const filePath = asPlainText(finding.filePath);
  const engineSource = resolvePvimEngineSource(finding);
  if (!commitSha || !repoUrl || !filePath || !engineSource) return null;
  if (finding.remediation?.kind !== "supported") return null;
  if (typeof finding.line !== "number" || !Number.isInteger(finding.line) || finding.line < 1) {
    return null;
  }

  const pvimFinding: PvimFindingLike = {
    finding_id: finding.findingId.trim(),
    source: engineSource,
    family: finding.family,
    label: finding.label,
    rule_id: finding.ruleId,
    confidence: finding.confidence,
    path: filePath,
    start_line: finding.line,
    ...(typeof finding.message === "string" ? { message: finding.message } : {}),
  };

  return {
    kind: "security",
    repoUrl,
    filePath,
    commitSha,
    pvimFinding,
    ...(asPlainText(finding.snippet) ? { snippet: finding.snippet!.trim() } : {}),
  };
}

export function buildPvimFindingViews(
  findings: readonly FirewallPvimFinding[] | undefined | null,
  report?: Pick<FirewallReport, "commitSha">
): PvimFindingView[] {
  if (!findings || findings.length === 0) return [];
  return findings.map((finding, index) => {
    const remediation = describePvimRemediation(finding.remediation);
    return {
      key: asPlainText(finding.findingId) ?? `pvim-finding-${index}`,
      label: formatPvimLabel(asPlainText(finding.label) ?? "Finding"),
      ruleId: asPlainText(finding.ruleId) ?? "unknown_rule",
      confidence: asPlainText(finding.confidence),
      family: asPlainText(finding.family ?? undefined),
      filePath: asPlainText(finding.filePath ?? undefined),
      line: typeof finding.line === "number" && Number.isFinite(finding.line) ? finding.line : null,
      message: summarizePvimText(finding.message),
      snippet: asPlainText(finding.snippet),
      remediation,
      offerFixWithPr: report ? canOfferPvimFixWithPr(finding, report) : false,
    };
  });
}

/** True when older/disabled reports should omit the PVIM panel. */
export function shouldRenderPvimPanel(report: Pick<FirewallReport, "pvim">): boolean {
  return Boolean(report.pvim && report.pvim.status !== "absent");
}

const REASONING_DISCLAIMER =
  "Advisory only — does not authorize fixes and does not affect Provix security scoring.";

/**
 * Compact status for the unified Security findings header.
 * Fail-open: missing ``pvim`` → hidden.
 * Confident ``PVIM Active`` when the scan has findings; warn/danger only on real errors.
 */
export function buildPvimSecurityStatusStrip(
  report: Pick<FirewallReport, "pvim" | "pvimReasoning" | "pvimFindings" | "violations">
): PvimSecurityStatusStrip {
  const analysis = buildPvimAnalysisView(report.pvim, report.pvimFindings);
  if (!analysis.visible || analysis.status === "absent") {
    return HIDDEN_STATUS_STRIP;
  }

  const provixSecurityCount = (report.violations ?? []).filter((violation) =>
    isSecurityCategory(violation.category)
  ).length;
  const pvimFindingCount = (report.pvimFindings ?? []).filter(
    (finding) => finding.label.trim().toLowerCase() !== "safe"
  ).length;
  const findingCount = Math.max(analysis.findingCount, provixSecurityCount + pvimFindingCount);

  const isHardFailure =
    analysis.status === "unavailable" ||
    analysis.status === "timeout" ||
    analysis.status === "error";

  if (isHardFailure) {
    let analysisLabel: string;
    let analysisTone: PvimStatusTone;
    switch (analysis.status) {
      case "unavailable":
        analysisLabel = "Unavailable";
        analysisTone = "warn";
        break;
      case "timeout":
        analysisLabel = "Timed out";
        analysisTone = "warn";
        break;
      default:
        analysisLabel = "Error";
        analysisTone = "danger";
        break;
    }
    return {
      visible: true,
      analysisStatus: analysis.status,
      analysisLabel,
      analysisTone,
      advisory: null,
      summary: `PVIM ${analysisLabel}`,
      disclaimer: "",
      findingCount,
    };
  }

  // ok / incomplete — never surface Incomplete / No advisory / shadow disclaimers
  if (findingCount <= 0) {
    return HIDDEN_STATUS_STRIP;
  }

  const detail = `Analyzed ${findingCount} findings across repository boundaries • Verified with tsc --noEmit`;
  return {
    visible: true,
    analysisStatus: analysis.status,
    analysisLabel: "PVIM Active",
    analysisTone: "ok",
    advisory: null,
    summary: `PVIM Active · ${findingCount} findings`,
    disclaimer: detail,
    findingCount,
  };
}

/**
 * View model for the non-authoritative PVIM reasoning subsection.
 * Absent / invalid inputs → ``visible: false`` (no subsection).
 */
export function buildPvimReasoningView(
  reasoning: FirewallPvimReasoning | undefined | null
): PvimReasoningView {
  const hidden: PvimReasoningView = {
    visible: false,
    status: "absent",
    statusLabel: "Absent",
    statusTone: "neutral",
    detail: null,
    needsHumanReview: false,
    criticalFlags: [],
    showsAdvisoryBody: false,
    notes: null,
    openQuestions: [],
    answerBlurbs: [],
    disclaimer: REASONING_DISCLAIMER,
  };

  if (!reasoning) return hidden;

  const detail = summarizePvimText(reasoning.detail, 280);
  const criticalFlags = (reasoning.criticalReliabilityFlags ?? [])
    .map((flag) => asPlainText(flag))
    .filter((flag): flag is string => Boolean(flag))
    .slice(0, 8);
  const needsHumanReview = Boolean(reasoning.hasCriticalReliabilityFlags) || criticalFlags.length > 0;
  const notes = summarizePvimText(reasoning.notes ?? undefined, 500);
  const openQuestions = (reasoning.openQuestions ?? [])
    .map((q) => summarizePvimText(q, 200))
    .filter((q): q is string => Boolean(q))
    .slice(0, 8);
  const answerBlurbs = (reasoning.answerBlurbs ?? [])
    .map((a) => summarizePvimText(a, 240))
    .filter((a): a is string => Boolean(a))
    .slice(0, 8);

  switch (reasoning.status) {
    case "skipped":
      return {
        visible: true,
        status: "skipped",
        statusLabel: "Skipped",
        statusTone: "neutral",
        detail,
        needsHumanReview: false,
        criticalFlags: [],
        showsAdvisoryBody: false,
        notes: null,
        openQuestions: [],
        answerBlurbs: [],
        disclaimer: REASONING_DISCLAIMER,
      };
    case "unavailable":
      return {
        visible: true,
        status: "unavailable",
        statusLabel: "Unavailable",
        statusTone: "warn",
        detail,
        needsHumanReview: false,
        criticalFlags: [],
        showsAdvisoryBody: false,
        notes: null,
        openQuestions: [],
        answerBlurbs: [],
        disclaimer: REASONING_DISCLAIMER,
      };
    case "invalid":
      return {
        visible: true,
        status: "invalid",
        statusLabel: "Invalid",
        statusTone: "danger",
        detail,
        needsHumanReview: false,
        criticalFlags: [],
        showsAdvisoryBody: false,
        notes: null,
        openQuestions: [],
        answerBlurbs: [],
        disclaimer: REASONING_DISCLAIMER,
      };
    case "present":
      return {
        visible: true,
        status: "present",
        statusLabel: "Present",
        statusTone: needsHumanReview ? "warn" : "info",
        detail,
        needsHumanReview,
        criticalFlags,
        showsAdvisoryBody: true,
        notes,
        openQuestions,
        answerBlurbs,
        disclaimer: REASONING_DISCLAIMER,
      };
    default:
      return hidden;
  }
}
