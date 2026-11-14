import { describe, expect, it, vi } from "vitest";
import type { FirewallPvimFinding } from "@/lib/firewall-contract";
import { canOfferPvimFixWithPr } from "@/lib/pvim/pvim-findings-view";
import { applyPvimHonestFixGate } from "@/lib/pvim/pvim-honest-fix-gate";
import { runPvimShadowForScan } from "@/lib/pvim/pvim-shadow-scan";
import type { PvimShadowClientResult, PvimShadowRequestInput } from "@/lib/pvim/pvim-shadow-client";

const PIN = "abcdef0123456789abcdef0123456789abcdef01";
/** Built at runtime so GitHub push protection does not flag a Stripe-shaped literal. */
const FAKE_STRIPE_LIVE_KEY = `sk_live_${"b".repeat(24)}`;

const coveredClient = `"use client";
export async function load(id: string) {
  const { data, error } = await supabase.from("jobs").select("*").eq("id", id);
  return { data, error };
}
`;

function supportedFinding(
  overrides?: Partial<FirewallPvimFinding>
): FirewallPvimFinding {
  return {
    findingId: "m1:secret:src/lib/pay.ts:1",
    source: "pvim",
    engineSource: "m1",
    label: "secret_hardcoded",
    ruleId: "m1_secret_literal",
    confidence: "confirmed",
    family: "m1",
    filePath: "src/lib/pay.ts",
    line: 1,
    message: "Hardcoded Stripe secret",
    snippet: FAKE_STRIPE_LIVE_KEY,
    remediation: {
      kind: "supported",
      category: "SECRET_LEAK",
      requiresScannerAgreement: true,
    },
    ...overrides,
  };
}

function shadowResult(
  input: PvimShadowRequestInput,
  findings: NonNullable<PvimShadowClientResult["report"]>["findings"]
): PvimShadowClientResult {
  return {
    status: "ok",
    elapsedMs: 8,
    report: {
      schema_version: "pvim.shadow_finding_report.v1",
      engine_version: "0.1.0",
      job_id: input.jobId,
      status: "ok",
      commit_sha: input.commitSha ?? PIN,
      findings,
      incomplete_analysis: [],
      stats: {
        files_analyzed: input.files.length,
        finding_count: findings.length,
        m1_ran: true,
        m2_ran: true,
        elapsed_ms: 8,
      },
      error: null,
    },
  };
}

describe("applyPvimHonestFixGate", () => {
  it("keeps Fix with PR only when Provix plans a covered client fix that passes preflight", async () => {
    const finding: FirewallPvimFinding = {
      findingId: "m1:sb:src/components/jobs.tsx:3",
      source: "pvim",
      engineSource: "m1",
      label: "supabase_insecure_access",
      ruleId: "m1_supabase_from",
      confidence: "confirmed",
      family: "m1",
      filePath: "src/components/jobs.tsx",
      line: 3,
      message: "Client database query",
      remediation: {
        kind: "supported",
        category: "CLIENT_DB_EXPOSURE",
        requiresScannerAgreement: true,
      },
    };

    const gated = await applyPvimHonestFixGate([finding], [
      { filePath: "src/components/jobs.tsx", content: coveredClient },
    ]);

    expect(gated[0]?.remediation).toEqual({
      kind: "supported",
      category: "CLIENT_DB_EXPOSURE",
      requiresScannerAgreement: true,
    });
    expect(canOfferPvimFixWithPr(gated[0]!, { commitSha: PIN })).toBe(true);
  }, 90_000);

  it("downgrades planner disagreement to scanner_does_not_agree", async () => {
    const finding = supportedFinding({
      findingId: "m1:secret:src/lib/pay.ts:1",
      filePath: "src/lib/pay.ts",
      line: 1,
      // No Stripe-shaped secret — adapter may have said supported, Provix cannot plan.
      snippet: "not-a-secret",
    });

    const gated = await applyPvimHonestFixGate([finding], [
      { filePath: "src/lib/pay.ts", content: 'export const note = "hello";\n' },
    ]);

    expect(gated[0]?.remediation).toMatchObject({
      kind: "unsupported",
      code: "scanner_does_not_agree",
    });
    expect(canOfferPvimFixWithPr(gated[0]!, { commitSha: PIN })).toBe(false);
  });

  it("leaves adapter-unsupported findings unchanged", async () => {
    const finding = supportedFinding({
      findingId: "m2:authz:src/app/api/route.ts:4",
      label: "authorization_flaw",
      ruleId: "m2_p1_request_controlled_owner",
      engineSource: "m2",
      family: "p1",
      filePath: "src/app/api/route.ts",
      line: 4,
      remediation: {
        kind: "unsupported",
        code: "unsupported_label",
        reason: "Authorization findings are not autofixable in Provix today.",
      },
    });

    const gated = await applyPvimHonestFixGate([finding], [
      { filePath: "src/app/api/route.ts", content: "export async function GET() { return null; }\n" },
    ]);

    expect(gated[0]?.remediation).toEqual(finding.remediation);
    expect(canOfferPvimFixWithPr(gated[0]!, { commitSha: PIN })).toBe(false);
  });

  it("downgrades when heal/TypeScript preflight fails", async () => {
    const finding = supportedFinding();
    const content = `export const key = "${FAKE_STRIPE_LIVE_KEY}";\n`;
    const finalizeAutofixWrites = vi.fn(async () => ({
      ok: false as const,
      message: "Pre-flight `npx tsc --noEmit` failed. The pull request was not opened.",
      attempts: 1,
    }));

    const gated = await applyPvimHonestFixGate(
      [finding],
      [{ filePath: "src/lib/pay.ts", content }],
      { finalizeAutofixWrites }
    );

    expect(finalizeAutofixWrites).toHaveBeenCalled();
    expect(gated[0]?.remediation).toMatchObject({
      kind: "unsupported",
      code: "scanner_does_not_agree",
    });
    expect(String((gated[0]?.remediation as { reason?: string }).reason)).toMatch(/tsc|pre-flight|preflight/i);
    expect(canOfferPvimFixWithPr(gated[0]!, { commitSha: PIN })).toBe(false);
  });

  it("downgrades missing path/line and missing pinned content", async () => {
    const missingLoc = await applyPvimHonestFixGate(
      [supportedFinding({ filePath: null, line: null })],
      [{ filePath: "src/lib/pay.ts", content: `export const key = "${FAKE_STRIPE_LIVE_KEY}";\n` }]
    );
    expect(missingLoc[0]?.remediation).toMatchObject({
      kind: "unsupported",
      code: "scanner_does_not_agree",
    });

    const missingContent = await applyPvimHonestFixGate(
      [supportedFinding({ filePath: "src/lib/missing.ts", line: 1 })],
      [{ filePath: "src/lib/pay.ts", content: `export const key = "${FAKE_STRIPE_LIVE_KEY}";\n` }]
    );
    expect(missingContent[0]?.remediation).toMatchObject({
      kind: "unsupported",
      code: "scanner_does_not_agree",
    });
    expect(String((missingContent[0]?.remediation as { reason?: string }).reason)).toMatch(
      /pinned source content/i
    );
  });

  it("does not offer Fix with PR for advisory-only context (reasoning never marks supported)", () => {
    // Advisory has no remediation path — only deterministic findings can be supported.
    const pending = supportedFinding({ remediation: { kind: "pending" } });
    expect(canOfferPvimFixWithPr(pending, { commitSha: PIN })).toBe(false);
  });
});

describe("runPvimShadowForScan + honest gate integration", () => {
  it("marks covered client PVIM findings supported and authorization unsupported", async () => {
    const analyze = vi.fn(async (input: PvimShadowRequestInput) =>
      shadowResult(input, [
        {
          finding_id: "m1:sb:src/components/jobs.tsx:3",
          source: "m1",
          family: "m1",
          label: "supabase_insecure_access",
          message: "Client from()",
          confidence: "confirmed",
          rule_id: "m1_supabase_from",
          path: "src/components/jobs.tsx",
          start_line: 3,
        },
        {
          finding_id: "m2:authz:src/components/jobs.tsx:1",
          source: "m2",
          family: "p1",
          label: "authorization_flaw",
          message: "Ownership gap",
          confidence: "confirmed",
          rule_id: "m2_p1_request_controlled_owner",
          path: "src/components/jobs.tsx",
          start_line: 1,
        },
      ])
    );

    const result = await runPvimShadowForScan(
      {
        owner: "acme",
        repo: "app",
        defaultBranch: "main",
        commitSha: PIN,
        sources: [{ filePath: "src/components/jobs.tsx", content: coveredClient }],
        companions: [],
      },
      { enabled: true, analyze }
    );

    expect(result?.pvimFindings).toHaveLength(2);
    expect(result?.pvimFindings?.[0]?.remediation).toEqual({
      kind: "supported",
      category: "CLIENT_DB_EXPOSURE",
      requiresScannerAgreement: true,
    });
    expect(result?.pvimFindings?.[1]?.remediation).toMatchObject({
      kind: "unsupported",
      code: "unsupported_label",
    });
    expect(canOfferPvimFixWithPr(result!.pvimFindings![0]!, { commitSha: PIN })).toBe(true);
    expect(canOfferPvimFixWithPr(result!.pvimFindings![1]!, { commitSha: PIN })).toBe(false);
  }, 90_000);

  it("downgrades adapter-supported secrets when Provix cannot plan against pinned content", async () => {
    const analyze = vi.fn(async (input: PvimShadowRequestInput) =>
      shadowResult(input, [
        {
          finding_id: "m1:secret:src/lib/pay.ts:1",
          source: "m1",
          label: "secret_hardcoded",
          message: "Hardcoded key",
          confidence: "confirmed",
          rule_id: "m1_secret_literal",
          path: "src/lib/pay.ts",
          start_line: 1,
        },
      ])
    );

    const result = await runPvimShadowForScan(
      {
        owner: "acme",
        repo: "app",
        defaultBranch: "main",
        commitSha: PIN,
        sources: [
          {
            filePath: "src/lib/pay.ts",
            content: 'const key = "not-a-real-secret";\n',
          },
        ],
        companions: [],
      },
      { enabled: true, analyze }
    );

    expect(result?.pvimFindings?.[0]?.remediation).toMatchObject({
      kind: "unsupported",
      code: "scanner_does_not_agree",
    });
  });
});
