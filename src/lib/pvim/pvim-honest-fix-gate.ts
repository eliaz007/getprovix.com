/**
 * Scan-time Fix-with-PR honesty for PVIM findings.
 * Reuses the native security plan assembly + heal/`tsc` preflight so the
 * dashboard only offers Fix with PR when Provix can already produce a safe patch.
 * Does not widen the adapter whitelist or weaken PR-time gates.
 */

import { finalizeAutofixWrites } from "@/lib/autofix-write-validation";
import type { FirewallPvimFinding, FirewallPvimRemediationStatus } from "@/lib/firewall-contract";
import { assembleSecurityPlanWritesForGate } from "@/lib/honest-fix-gate";
import {
  isFixtureCoveredClientQuery,
  planSecurityFix,
  resolveSecurityFixLayout,
  type SecurityCategory,
  type SecurityFixWrite,
} from "@/lib/scanner/security-suite";

export type PvimHonestFixGateFile = {
  filePath: string;
  content: string;
};

export type PvimHonestFixGateDeps = {
  /** Injected for tests. Defaults to `planSecurityFix`. */
  planSecurityFix?: typeof planSecurityFix;
  /** Injected for tests. Defaults to `finalizeAutofixWrites`. */
  finalizeAutofixWrites?: typeof finalizeAutofixWrites;
};

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\/+/, "");
}

function buildContentMap(
  files: readonly PvimHonestFixGateFile[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const file of files) {
    const path = normalizePath(file.filePath);
    if (!path || map.has(path)) continue;
    map.set(path, file.content);
  }
  return map;
}

function tsconfigContentsFromScan(contentByPath: ReadonlyMap<string, string>): string[] {
  const contents: string[] = [];
  for (const [path, content] of contentByPath) {
    if (/(^|\/)tsconfig[^/]*\.json$/i.test(path)) contents.push(content);
  }
  return contents;
}

function disagree(reason: string): FirewallPvimRemediationStatus {
  return {
    kind: "unsupported",
    code: "scanner_does_not_agree",
    reason,
  };
}

/**
 * Downgrade adapter-`supported` PVIM rows unless Provix can plan a remediation
 * that passes the same heal + `tsc` preflight Fix with PR uses.
 * Unsupported / pending rows are left unchanged. Never throws.
 */
export async function applyPvimHonestFixGate(
  findings: readonly FirewallPvimFinding[],
  files: readonly PvimHonestFixGateFile[],
  deps: PvimHonestFixGateDeps = {}
): Promise<FirewallPvimFinding[]> {
  if (findings.length === 0) return [];
  const contentByPath = buildContentMap(files);
  const plan = deps.planSecurityFix ?? planSecurityFix;
  const finalize = deps.finalizeAutofixWrites ?? finalizeAutofixWrites;
  const gated: FirewallPvimFinding[] = [];
  for (const finding of findings) {
    gated.push(await gateSupportedPvimFinding(finding, contentByPath, plan, finalize));
  }
  return gated;
}

async function gateSupportedPvimFinding(
  finding: FirewallPvimFinding,
  contentByPath: ReadonlyMap<string, string>,
  plan: typeof planSecurityFix,
  finalize: typeof finalizeAutofixWrites
): Promise<FirewallPvimFinding> {
  try {
    const remediation = finding.remediation;
    if (!remediation || remediation.kind !== "supported") {
      return finding;
    }

    const filePath =
      typeof finding.filePath === "string" && finding.filePath.trim()
        ? normalizePath(finding.filePath)
        : "";
    const line = finding.line;
    if (
      !filePath ||
      typeof line !== "number" ||
      !Number.isInteger(line) ||
      line < 1
    ) {
      return {
        ...finding,
        remediation: disagree(
          "Provix cannot open Fix with PR: the finding is missing a safe file path or line on the pinned commit."
        ),
      };
    }

    const content = contentByPath.get(filePath);
    if (typeof content !== "string") {
      return {
        ...finding,
        remediation: disagree(
          "Provix cannot open Fix with PR: pinned source content for this finding path was not available at scan time."
        ),
      };
    }

    const category = remediation.category as SecurityCategory;
    const layout =
      category === "CLIENT_DB_EXPOSURE"
        ? resolveSecurityFixLayout({
            clientFilePath: filePath,
            tsconfigContents: tsconfigContentsFromScan(contentByPath),
          })
        : null;
    const serverActionPath = layout?.serverActionPath ?? null;

    // Match native gate: uncovered client shapes stay off the Fix with PR surface
    // without inventing an agentic path for PVIM.
    if (
      category === "CLIENT_DB_EXPOSURE" &&
      !isFixtureCoveredClientQuery({ filePath, content }, line)
    ) {
      return {
        ...finding,
        remediation: disagree(
          "Provix cannot safely plan a client-database fix for this PVIM finding. Manual review is required."
        ),
      };
    }

    const securityPlan = plan(
      { filePath, content },
      category,
      line,
      layout,
      finding.snippet ? { snippet: finding.snippet } : undefined
    );

    if (!securityPlan || securityPlan.writes.length === 0) {
      return {
        ...finding,
        remediation: disagree(
          "Provix scanners do not agree on a safe remediation plan for this PVIM finding. Manual review is required."
        ),
      };
    }

    const assembled = assembleSecurityPlanWritesForGate(
      securityPlan.writes as readonly SecurityFixWrite[],
      contentByPath,
      serverActionPath
    );
    if (assembled.length === 0) {
      return {
        ...finding,
        remediation: disagree(
          "Provix could not assemble a safe remediation write set for this PVIM finding. Manual review is required."
        ),
      };
    }

    const finalized = await finalize(assembled);
    if (!finalized.ok) {
      return {
        ...finding,
        remediation: disagree(
          finalized.message?.trim() ||
            "The proposed Provix remediation failed heal or TypeScript preflight. Manual review is required."
        ),
      };
    }

    return finding;
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 200) : "unexpected gate failure";
    return {
      ...finding,
      remediation: disagree(
        `Provix could not verify Fix with PR eligibility for this PVIM finding (${detail}). Manual review is required.`
      ),
    };
  }
}
