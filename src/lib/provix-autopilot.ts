import { agenticFixWithRetry, isAgenticClientDbEnabled } from "@/lib/agentic-fix-with-retry";
import { finalizeAutofixWrites, type AutofixWriteFile } from "@/lib/autofix-write-validation";
import { planAutofix } from "@/lib/firewall-autofix";
import { isSecurityCategory } from "@/lib/firewall-contract";
import {
  isFixtureCoveredClientQuery,
  planSecurityFix,
  resolveSecurityFixLayout,
  type SecurityCategory,
} from "@/lib/scanner/security-suite";

export type AutopilotFinding = {
  filePath: string;
  line: number;
  category: string;
  rule?: string;
  snippet?: string;
};

export type AutopilotFixResult =
  | {
      ok: true;
      writes: AutofixWriteFile[];
      title: string;
      summary: string;
      branchSlug: string;
      source: "deterministic" | "agentic";
      attempts: number;
    }
  | { ok: false; message: string; attempts: number };

function isArchitectureFinding(finding: AutopilotFinding): boolean {
  return (
    finding.rule === "Architectural Bloat" ||
    finding.category === "ARCHITECTURAL_BLOAT" ||
    finding.category === "ARCHITECTURE" ||
    finding.category === "Architectural Bloat"
  );
}

function architectureTitle(filePath: string, writeCount: number): string {
  return writeCount <= 1
    ? `fix: handle errors in ${filePath}`
    : `refactor: split ${filePath} into modules`;
}

/**
 * End-to-end autopilot for one finding: deterministic plan first, then the
 * agentic fallback when the flag is on and the plan is missing or fails
 * `finalizeAutofixWrites` (`tsc --noEmit`). Never throws.
 */
export async function runAutopilotFix(input: {
  finding: AutopilotFinding;
  content: string;
  existingServerAction?: string | null;
  existingEnvExample?: string | null;
  tsconfigText?: string | null;
}): Promise<AutopilotFixResult> {
  try {
    const filePath = input.finding.filePath.replace(/\\/g, "/");
    if (isArchitectureFinding(input.finding)) {
      return runArchitectureAutopilot({
        filePath,
        content: input.content,
        finding: input.finding,
      });
    }
    if (!isSecurityCategory(input.finding.category)) {
      return { ok: false, message: "This finding is not covered by autopilot.", attempts: 0 };
    }
    return runSecurityAutopilot({
      filePath,
      content: input.content,
      category: input.finding.category,
      line: input.finding.line,
      snippet: input.finding.snippet,
      existingServerAction: input.existingServerAction,
      existingEnvExample: input.existingEnvExample,
      tsconfigText: input.tsconfigText,
    });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Autopilot failed.",
      attempts: 0,
    };
  }
}

async function runArchitectureAutopilot(input: {
  filePath: string;
  content: string;
  finding: AutopilotFinding;
}): Promise<AutopilotFixResult> {
  const plan = planAutofix(input.filePath, input.content);
  if (plan.canOpenPullRequest && plan.writes.length > 0) {
    const finalized = await finalizeAutofixWrites(plan.writes);
    if (finalized.ok) {
      return {
        ok: true,
        writes: finalized.writes,
        title: architectureTitle(input.filePath, finalized.writes.length),
        summary: plan.summary,
        branchSlug: "architecture",
        source: "deterministic",
        attempts: 1,
      };
    }
  }

  if (!isAgenticClientDbEnabled()) {
    return {
      ok: false,
      message: plan.summary || "This file has no safe autofix, so no pull request was opened.",
      attempts: 0,
    };
  }

  const agent = await agenticFixWithRetry({
    finding: {
      filePath: input.filePath,
      line: input.finding.line,
      category: "ARCHITECTURAL_BLOAT",
      snippet: input.finding.snippet ?? plan.summary,
    },
    content: input.content,
    existingServerAction: null,
    existingEnvExample: null,
  });
  if (!agent.ok) {
    return { ok: false, message: agent.message, attempts: agent.attempts };
  }
  return {
    ok: true,
    writes: agent.writes,
    title: architectureTitle(input.filePath, agent.writes.length),
    summary: "Split a component into modules after the deterministic split could not be typechecked.",
    branchSlug: "architecture",
    source: "agentic",
    attempts: agent.attempts,
  };
}

async function runSecurityAutopilot(input: {
  filePath: string;
  content: string;
  category: SecurityCategory;
  line: number;
  snippet?: string;
  existingServerAction?: string | null;
  existingEnvExample?: string | null;
  tsconfigText?: string | null;
}): Promise<AutopilotFixResult> {
  const layout =
    input.category === "CLIENT_DB_EXPOSURE"
      ? resolveSecurityFixLayout({
          clientFilePath: input.filePath,
          tsconfigContents: input.tsconfigText ? [input.tsconfigText] : [],
        })
      : null;
  const uncoveredClient =
    input.category === "CLIENT_DB_EXPOSURE" &&
    !isFixtureCoveredClientQuery({ filePath: input.filePath, content: input.content }, input.line);

  if (!uncoveredClient) {
    const plan = planSecurityFix(
      { filePath: input.filePath, content: input.content },
      input.category,
      input.line,
      layout,
      { snippet: input.snippet }
    );
    if (plan && plan.writes.length > 0) {
      const finalized = await finalizeAutofixWrites(
        plan.writes.map((write) => ({ filePath: write.filePath, content: write.content }))
      );
      if (finalized.ok) {
        return {
          ok: true,
          writes: finalized.writes,
          title: plan.title,
          summary: plan.summary,
          branchSlug: plan.branchSlug,
          source: "deterministic",
          attempts: 1,
        };
      }
    }
  }

  if (!isAgenticClientDbEnabled()) {
    return {
      ok: false,
      message: "This finding has no safe security fix, so no pull request was opened.",
      attempts: 0,
    };
  }

  const agent = await agenticFixWithRetry({
    finding: {
      filePath: input.filePath,
      line: input.line,
      category: input.category,
      ...(input.snippet ? { snippet: input.snippet } : {}),
    },
    content: input.content,
    layout,
    existingServerAction: input.existingServerAction ?? null,
    existingEnvExample: input.existingEnvExample ?? null,
  });
  if (!agent.ok) {
    return { ok: false, message: agent.message, attempts: agent.attempts };
  }
  return {
    ok: true,
    writes: agent.writes,
    title:
      input.category === "SECRET_LEAK"
        ? `fix: remove hardcoded secret from ${input.filePath}`
        : input.category === "VULNERABLE_DEPENDENCY"
          ? `fix: update dependency in ${input.filePath}`
          : `fix: move client query in ${input.filePath} to a server action`,
    summary:
      input.category === "SECRET_LEAK"
        ? "Removed a hardcoded secret from source."
        : input.category === "VULNERABLE_DEPENDENCY"
          ? "Updated a vulnerable or deprecated dependency."
          : "Moved a client Supabase query behind a signed-in server action.",
    branchSlug:
      input.category === "SECRET_LEAK"
        ? "secret"
        : input.category === "VULNERABLE_DEPENDENCY"
          ? "dependency"
          : "client-query",
    source: "agentic",
    attempts: agent.attempts,
  };
}

/** Branch name for autopilot pull requests. */
export function autopilotBranchName(slug: string, filePath: string): string {
  const fileSlug = filePath
    .replace(/\.(tsx|ts|jsx|js|json)$/i, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 36)
    .toLowerCase();
  return `provix/auto-heal-${slug}-${fileSlug || "fix"}-${Date.now().toString(36)}`;
}
