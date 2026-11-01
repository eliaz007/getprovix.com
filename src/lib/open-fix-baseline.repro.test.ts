/**
 * Baseline reproductions. They do not call GitHub and they do not open pull requests.
 */
import { describe, expect, it } from "vitest";
import { analyzeSourceTexts } from "../../scripts/ingest-engine";
import { runAutofixTscPreflight } from "@/lib/autofix-tsc-preflight";
import { isExpectedAutofixRefuse, planAutofix } from "@/lib/firewall-autofix";
import { collectBoundaryContextFiles, scanChangedFiles } from "@/lib/github-webhook-gate";

/**
 * Mirrors the published-candidate-profile split: two top-level exports, and a
 * property `commit_stats` used in an untyped `.flatMap` callback. The annotator
 * must not rewrite that callback to `(typeof commit_stats)`, which is not a binding.
 */
const COMMIT_STATS_SOURCE = `export function readLabel(value: string): string {
  return value.trim();
}

export function readGitHubAuditContext(record: {
  commit_stats?: Array<{
    date: string;
    additions: number;
    deletions: number;
    filesChanged: number;
    message: string;
    authorLogin: string;
    authorName: string;
    sha: string;
  }> | null;
} | null): string[] {
  if (!record) return [];
  return Array.isArray(record.commit_stats)
    ? record.commit_stats.flatMap((entry) => {
        if (!entry || typeof entry.date !== "string") return [];
        return [entry.date];
      })
    : [];
}
`;

const SERVER_DB_PATH = "src/server/widget/server-db.ts";
const BARREL_PATH = "src/components/widget/index.ts";
const CLIENT_WIDGET_PATH = "src/components/widget/ClientWidget.tsx";
const TYPE_ONLY_PATH = "src/components/widget/TypeOnlyWidget.tsx";

const SERVER_DB = `export function readServerSecret(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return key;
}
`;

const BARREL = `export { readServerSecret } from "../../server/widget/server-db";
export type WidgetLabel = string;
`;

const CLIENT_WIDGET = `"use client";

import { readServerSecret } from "./index";

export function ClientWidget() {
  return readServerSecret();
}
`;

const TYPE_ONLY_WIDGET = `"use client";

import type { WidgetLabel } from "./index";

export function TypeOnlyWidget(label: WidgetLabel) {
  return label;
}
`;

/** Unified diff that only adds the client file (the helper and barrel are unchanged). */
const CLIENT_WIDGET_PATCH = `diff --git a/src/components/widget/ClientWidget.tsx b/src/components/widget/ClientWidget.tsx
--- /dev/null
+++ b/src/components/widget/ClientWidget.tsx
@@ -0,0 +1,7 @@
+"use client";
+
+import { readServerSecret } from "./index";
+
+export function ClientWidget() {
+  return readServerSecret();
+}
`;

describe("Open Fix baseline reproductions", () => {
  it("splits record.commit_stats.flatMap without an unbound commit_stats type", async () => {
    const filePath = "src/lib/published-candidate-profile.ts";
    const plan = planAutofix(filePath, COMMIT_STATS_SOURCE);

    console.log("[repro:commit_stats] canOpenPullRequest", plan.canOpenPullRequest);
    console.log("[repro:commit_stats] writes", plan.writes.map((write) => write.filePath));
    const auditModule = plan.writes.find((write) => write.filePath.includes("readgithubauditcontext"));
    console.log("[repro:commit_stats] generated module\n" + (auditModule?.content ?? "(missing)"));

    expect(plan.canOpenPullRequest).toBe(true);
    expect(plan.writes.some((write) => write.filePath.endsWith("/readgithubauditcontext.ts"))).toBe(true);
    expect(auditModule?.content ?? "").not.toMatch(/\(typeof commit_stats\)/);
    expect(auditModule?.content ?? "").toMatch(/record\.commit_stats\.flatMap\(\(entry\) =>/);

    const preflight = await runAutofixTscPreflight(plan.writes);
    console.log("[repro:commit_stats] preflight.success", preflight.success);
    if (!preflight.success) {
      console.log("[repro:commit_stats] message", preflight.message);
      console.log("[repro:commit_stats] diagnostics\n" + preflight.diagnostics);
    }

    expect(preflight.success).toBe(true);
  }, 120_000);

  it("treats a shared-binding split refusal as expected", () => {
    expect(
      isExpectedAutofixRefuse(
        "No safe module split: helpers share bindings across closures. Leave the file as one unit."
      )
    ).toBe(true);
  });

  it("rewrites relative imports when a split nests modules one folder deeper", () => {
    const source = `import { analyzeSourceTexts } from "../../scripts/ingest-engine";

export function readLabel(value: string): string {
  return value.trim();
}

export function runAudit() {
  return analyzeSourceTexts([]);
}
`;
    const plan = planAutofix("src/lib/github-webhook-gate.ts", source);
    expect(plan.canOpenPullRequest).toBe(true);
    const nested = plan.writes.filter((write) => write.filePath.includes("/github-webhook-gate/"));
    expect(nested.length).toBeGreaterThan(0);
    for (const write of nested) {
      expect(write.content).not.toMatch(/from ["']\.\.\/\.\.\/scripts\/ingest-engine["']/);
      if (write.content.includes("analyzeSourceTexts")) {
        expect(write.content).toMatch(/from ["']\.\.\/\.\.\/\.\.\/scripts\/ingest-engine["']/);
      }
    }
  });

  it("flags a server secret reached through an unchanged barrel", async () => {
    const repo = new Map<string, string>([
      [BARREL_PATH, BARREL],
      [SERVER_DB_PATH, SERVER_DB],
    ]);
    const context = await collectBoundaryContextFiles(
      [{ filePath: CLIENT_WIDGET_PATH, content: CLIENT_WIDGET }],
      async (filePath) => repo.get(filePath.replace(/\\/g, "/")) ?? null
    );
    const changedOnly = scanChangedFiles(
      [
        {
          filePath: CLIENT_WIDGET_PATH,
          content: CLIENT_WIDGET,
          patch: CLIENT_WIDGET_PATCH,
        },
      ],
      context
    );

    const fullTrio = analyzeSourceTexts(
      [
        { filePath: SERVER_DB_PATH, content: SERVER_DB },
        { filePath: BARREL_PATH, content: BARREL },
        { filePath: CLIENT_WIDGET_PATH, content: CLIENT_WIDGET },
        { filePath: TYPE_ONLY_PATH, content: TYPE_ONLY_WIDGET },
      ],
      { includeOrphans: false }
    );
    const boundary = fullTrio.violations.filter((violation) => violation.rule === "Boundary Violation");
    const typeOnly = boundary.filter((violation) => violation.filePath === TYPE_ONLY_PATH);

    console.log("[repro:barrel] loaded context", context.map((file) => file.filePath));
    console.log("[repro:barrel] PR gate findings", JSON.stringify(changedOnly.findings, null, 2));
    console.log("[repro:barrel] full-trio boundary violations", JSON.stringify(boundary, null, 2));

    const chain = /ClientWidget\.tsx -> index\.ts -> server-db\.ts/;
    expect(context.map((file) => file.filePath)).toEqual(expect.arrayContaining([BARREL_PATH, SERVER_DB_PATH]));
    expect(changedOnly.findings.some((finding) => finding.rule === "Boundary Violation" && chain.test(finding.message))).toBe(
      true
    );
    expect(boundary.some((violation) => violation.filePath === CLIENT_WIDGET_PATH && chain.test(violation.message))).toBe(
      true
    );
    expect(typeOnly).toEqual([]);
  });
});
