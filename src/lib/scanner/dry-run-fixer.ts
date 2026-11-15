import {
  runAutofixTscPreflight,
  type TscPreflightNote,
  type TscPreflightResult,
} from "@/lib/autofix-tsc-preflight";
import {
  healAutofixWrites,
  type AutofixWriteFile,
} from "@/lib/autofix-write-validation";
import { INSECURE_AUTH_SESSION_RULE } from "@/lib/scanner/get-session-auth";
import {
  planSecurityFix,
  type SecurityCategory,
  type SecurityFixPlan,
  type SecurityFinding,
  type SecurityScanFile,
} from "@/lib/scanner/security-suite";
import { USE_SERVER_SUPABASE_AUTH_RULE } from "@/lib/scanner/use-server-supabase-auth";

/**
 * Local AST auto-fix dry-run: plan a patch in memory, then verify it with
 * `tsc --noEmit` via the existing preflight harness — no GitHub API calls.
 */

export type DryRunAstViolation = {
  filePath: string;
  line: number;
  ruleId: string;
  /** Prefer an explicit category when known; otherwise derived from `ruleId`. */
  category?: SecurityCategory;
  message?: string;
};

export type DryRunFixSuccess = {
  ok: true;
  plan: SecurityFixPlan;
  patchedWrites: AutofixWriteFile[];
  preflight: TscPreflightNote;
};

export type DryRunFixFailure = {
  ok: false;
  reason: string;
  /** Present when a plan was produced but typecheck failed. */
  plan?: SecurityFixPlan;
  patchedWrites?: AutofixWriteFile[];
  diagnostics?: string;
  preflightResult?: Extract<TscPreflightResult, { success: false }>;
};

export type DryRunFixResult = DryRunFixSuccess | DryRunFixFailure;

export type DryRunFixOptions = {
  projectRoot?: string;
  /** Optional owned temp dir for the tsc materialization (tests). */
  workDir?: string;
  /**
   * Extra files merged into the typecheck graph (e.g. a stub
   * `src/utils/supabase/server.ts` so `getUser()` rewrites resolve).
   */
  supportingWrites?: readonly AutofixWriteFile[];
  /** Skip structural heal and only run `tsc --noEmit` on the raw plan writes. */
  skipHeal?: boolean;
};

const RULE_TO_CATEGORY: Readonly<Record<string, SecurityCategory>> = {
  [INSECURE_AUTH_SESSION_RULE]: "INSECURE_AUTH_SESSION",
  "Hardcoded Secret": "SECRET_LEAK",
  "Insecure Client Query": "CLIENT_DB_EXPOSURE",
  "Vulnerable Dependency": "VULNERABLE_DEPENDENCY",
};

/**
 * Map a scanner rule id (or SecurityFinding) onto a `planSecurityFix` category.
 * Returns null for AST hits that are detect-only today (no surgical autofix plan).
 */
export function categoryForAstRule(ruleId: string): SecurityCategory | null {
  if (ruleId === USE_SERVER_SUPABASE_AUTH_RULE) return null;
  return RULE_TO_CATEGORY[ruleId] ?? null;
}

export function dryRunViolationFromFinding(finding: SecurityFinding): DryRunAstViolation {
  return {
    filePath: finding.filePath,
    line: finding.line,
    ruleId: finding.rule,
    category: finding.category,
    message: finding.message,
  };
}

function resolveCategory(violation: DryRunAstViolation): SecurityCategory | null {
  if (violation.category) return violation.category;
  return categoryForAstRule(violation.ruleId);
}

function mergeWrites(
  planWrites: readonly AutofixWriteFile[],
  supporting: readonly AutofixWriteFile[] | undefined
): AutofixWriteFile[] {
  const byPath = new Map<string, AutofixWriteFile>();
  for (const write of planWrites) {
    byPath.set(write.filePath.replace(/\\/g, "/"), {
      filePath: write.filePath.replace(/\\/g, "/"),
      content: write.content,
    });
  }
  for (const write of supporting ?? []) {
    const path = write.filePath.replace(/\\/g, "/");
    if (!byPath.has(path)) {
      byPath.set(path, { filePath: path, content: write.content });
    }
  }
  return [...byPath.values()];
}

/**
 * Generate the autofix patch for one AST violation and typecheck it locally.
 *
 * Flow:
 * 1. `planSecurityFix` — in-memory rewrite (no GitHub)
 * 2. optional structural heal
 * 3. single `tsc --noEmit` via `runAutofixTscPreflight`
 */
export async function dryRunAutofix(
  file: SecurityScanFile,
  violation: DryRunAstViolation,
  options?: DryRunFixOptions
): Promise<DryRunFixResult> {
  const category = resolveCategory(violation);
  if (!category) {
    return {
      ok: false,
      reason:
        `Rule "${violation.ruleId}" is detect-only — no local autofix plan is available ` +
        `(e.g. ${USE_SERVER_SUPABASE_AUTH_RULE} requires a manual getUser() guard).`,
    };
  }

  const plan = planSecurityFix(
    { filePath: file.filePath, content: file.content },
    category,
    violation.line
  );
  if (!plan) {
    return {
      ok: false,
      reason: `No autofix plan for ${violation.ruleId} at ${file.filePath}:${violation.line}.`,
    };
  }

  const seeds = mergeWrites(plan.writes, options?.supportingWrites);
  let patchedWrites = seeds;

  if (!options?.skipHeal) {
    const healed = healAutofixWrites(seeds);
    if (!healed.ok) {
      return {
        ok: false,
        reason: healed.message,
        plan,
        patchedWrites: seeds,
        diagnostics: healed.message,
      };
    }
    patchedWrites = healed.writes;
  }

  const preflight = await runAutofixTscPreflight(patchedWrites, {
    projectRoot: options?.projectRoot,
    workDir: options?.workDir,
  });

  if (!preflight.success) {
    return {
      ok: false,
      reason: preflight.message,
      plan,
      patchedWrites,
      diagnostics: preflight.diagnostics,
      preflightResult: preflight,
    };
  }

  return {
    ok: true,
    plan,
    patchedWrites,
    preflight: preflight.preflight,
  };
}

/**
 * Convenience: dry-run from a full `SecurityFinding` already produced by the suite.
 */
export async function dryRunAutofixFinding(
  file: SecurityScanFile,
  finding: SecurityFinding,
  options?: DryRunFixOptions
): Promise<DryRunFixResult> {
  return dryRunAutofix(file, dryRunViolationFromFinding(finding), options);
}
