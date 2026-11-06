import { agenticFixWithRetry, isAgenticClientDbEnabled } from "@/lib/agentic-fix-with-retry";
import { finalizeAutofixWrites } from "@/lib/autofix-write-validation";
import { planAutofix } from "@/lib/firewall-autofix";
import { isSecurityCategory } from "@/lib/firewall-contract";
import {
  isFixtureCoveredClientQuery,
  planSecurityFix,
  serverActionFilePath,
  type SecurityCategory,
} from "@/lib/scanner/security-suite";

type GatedViolation = {
  filePath: string;
  line: number;
  rule: string;
  category?: string;
  snippet?: string;
  autofixable?: boolean;
};

type AgentScanBudget = { remaining: number };

/**
 * Honest button: `autofixable` becomes true only when the generated patch passes
 * the same heal + `tsc` preflight Fix with PR runs. Uncovered findings and
 * failed deterministic plans stay false unless the agentic fallback is on and
 * its patch passes that same gate. This never throws.
 */
export async function applyHonestFixGate<T extends GatedViolation>(
  violations: readonly T[],
  files: readonly { filePath: string; content: string }[]
): Promise<T[]> {
  const contentByPath = new Map(
    files.map((file) => [file.filePath.replace(/\\/g, "/"), file.content])
  );
  const gated: T[] = [];
  const agentBudget: AgentScanBudget = { remaining: 1 };
  for (const violation of violations) {
    gated.push(await gateViolation(violation, contentByPath, agentBudget));
  }
  return gated;
}

async function gateViolation<T extends GatedViolation>(
  violation: T,
  contentByPath: ReadonlyMap<string, string>,
  agentBudget: AgentScanBudget
): Promise<T> {
  try {
    if (violation.rule === "Architectural Bloat") {
      return await gateArchitecture(violation, contentByPath, agentBudget);
    }
    if (isSecurityCategory(violation.category)) {
      return await gateSecurity(violation, contentByPath, agentBudget);
    }
    return violation;
  } catch {
    return { ...violation, autofixable: false };
  }
}

async function gateArchitecture<T extends GatedViolation>(
  violation: T,
  contentByPath: ReadonlyMap<string, string>,
  agentBudget: AgentScanBudget
): Promise<T> {
  const filePath = violation.filePath.replace(/\\/g, "/");
  const content = contentByPath.get(filePath);
  if (!content) return { ...violation, autofixable: false };
  const plan = planAutofix(filePath, content);
  if (plan.canOpenPullRequest && plan.writes.length > 0) {
    const finalized = await finalizeAutofixWrites(plan.writes);
    if (finalized.ok) return { ...violation, autofixable: true };
  }
  if (!isAgenticClientDbEnabled() || agentBudget.remaining < 1) {
    return { ...violation, autofixable: false };
  }
  agentBudget.remaining -= 1;
  const agent = await agenticFixWithRetry({
    finding: {
      filePath,
      line: violation.line,
      category: "ARCHITECTURAL_BLOAT",
      snippet: plan.summary,
    },
    content,
    existingServerAction: null,
    existingEnvExample: null,
  });
  return { ...violation, autofixable: agent.ok };
}

async function gateSecurity<T extends GatedViolation>(
  violation: T,
  contentByPath: ReadonlyMap<string, string>,
  agentBudget: AgentScanBudget
): Promise<T> {
  const filePath = violation.filePath.replace(/\\/g, "/");
  const content = contentByPath.get(filePath);
  if (!content || !isSecurityCategory(violation.category)) {
    return { ...violation, autofixable: false };
  }
  const category = violation.category;
  const uncoveredClient =
    category === "CLIENT_DB_EXPOSURE" &&
    !isFixtureCoveredClientQuery({ filePath, content }, violation.line);
  if (!uncoveredClient) {
    const plan = planSecurityFix({ filePath, content }, category as SecurityCategory, violation.line);
    if (plan && plan.writes.length > 0) {
      const finalized = await finalizeAutofixWrites(
        plan.writes.map((write) => ({ filePath: write.filePath, content: write.content }))
      );
      if (finalized.ok) return { ...violation, autofixable: true };
    }
  }
  if (!isAgenticClientDbEnabled() || agentBudget.remaining < 1) {
    return { ...violation, autofixable: false };
  }
  agentBudget.remaining -= 1;
  const agent = await agenticFixWithRetry({
    finding: {
      filePath,
      line: violation.line,
      category,
      ...(violation.snippet ? { snippet: violation.snippet } : {}),
    },
    content,
    existingServerAction:
      category === "CLIENT_DB_EXPOSURE"
        ? (contentByPath.get(serverActionFilePath(filePath)) ?? null)
        : null,
    existingEnvExample: category === "SECRET_LEAK" ? (contentByPath.get(".env.example") ?? null) : null,
  });
  return { ...violation, autofixable: agent.ok };
}
