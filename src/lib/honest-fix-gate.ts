import { finalizeAutofixWrites } from "@/lib/autofix-write-validation";
import { planAutofix } from "@/lib/firewall-autofix";
import { isSecurityCategory } from "@/lib/firewall-contract";
import {
  isFixtureCoveredClientQuery,
  planSecurityFix,
  type SecurityCategory,
} from "@/lib/scanner/security-suite";

type GatedViolation = {
  filePath: string;
  line: number;
  rule: string;
  category?: string;
  autofixable?: boolean;
};

/**
 * Honest button: `autofixable` becomes true only when the generated patch passes
 * the same heal + `tsc` preflight Fix with PR runs. Failures and uncovered
 * Supabase shapes stay false. This never throws.
 */
export async function applyHonestFixGate<T extends GatedViolation>(
  violations: readonly T[],
  files: readonly { filePath: string; content: string }[]
): Promise<T[]> {
  const contentByPath = new Map(
    files.map((file) => [file.filePath.replace(/\\/g, "/"), file.content])
  );
  const gated: T[] = [];
  for (const violation of violations) {
    gated.push(await gateViolation(violation, contentByPath));
  }
  return gated;
}

async function gateViolation<T extends GatedViolation>(
  violation: T,
  contentByPath: ReadonlyMap<string, string>
): Promise<T> {
  try {
    if (violation.rule === "Architectural Bloat") {
      return await gateArchitecture(violation, contentByPath);
    }
    if (isSecurityCategory(violation.category)) {
      return await gateSecurity(violation, contentByPath);
    }
    return violation;
  } catch {
    return { ...violation, autofixable: false };
  }
}

async function gateArchitecture<T extends GatedViolation>(
  violation: T,
  contentByPath: ReadonlyMap<string, string>
): Promise<T> {
  const content = contentByPath.get(violation.filePath.replace(/\\/g, "/"));
  if (!content) return { ...violation, autofixable: false };
  const plan = planAutofix(violation.filePath, content);
  if (!plan.canOpenPullRequest || plan.writes.length === 0) {
    return { ...violation, autofixable: false };
  }
  const finalized = await finalizeAutofixWrites(plan.writes);
  return { ...violation, autofixable: finalized.ok };
}

async function gateSecurity<T extends GatedViolation>(
  violation: T,
  contentByPath: ReadonlyMap<string, string>
): Promise<T> {
  const filePath = violation.filePath.replace(/\\/g, "/");
  const content = contentByPath.get(filePath);
  if (!content || !isSecurityCategory(violation.category)) {
    return { ...violation, autofixable: false };
  }
  const category = violation.category;
  if (
    category === "CLIENT_DB_EXPOSURE" &&
    !isFixtureCoveredClientQuery({ filePath, content }, violation.line)
  ) {
    return { ...violation, autofixable: false };
  }
  const plan = planSecurityFix({ filePath, content }, category as SecurityCategory, violation.line);
  if (!plan || plan.writes.length === 0) return { ...violation, autofixable: false };
  const finalized = await finalizeAutofixWrites(
    plan.writes.map((write) => ({ filePath: write.filePath, content: write.content }))
  );
  return { ...violation, autofixable: finalized.ok };
}
