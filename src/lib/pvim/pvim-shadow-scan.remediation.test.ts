import { describe, expect, it, vi } from "vitest";
import { runPvimShadowForScan } from "@/lib/pvim/pvim-shadow-scan";
import type { PvimShadowClientResult, PvimShadowRequestInput } from "@/lib/pvim/pvim-shadow-client";

const PIN = "abcdef0123456789abcdef0123456789abcdef01";

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

describe("runPvimShadowForScan remediation eligibility", () => {
  it("keeps authorization unsupported and downgrades secrets Provix cannot plan", async () => {
    const analyze = vi.fn(async (input: PvimShadowRequestInput) =>
      shadowResult(input, [
        {
          finding_id: "m1:secret:src/lib/pay.ts:2",
          source: "m1",
          label: "secret_hardcoded",
          message: "Hardcoded key",
          confidence: "confirmed",
          rule_id: "m1_secret_literal",
          path: "src/lib/pay.ts",
          start_line: 2,
        },
        {
          finding_id: "m2:authz:src/lib/pay.ts:4",
          source: "m2",
          family: "p1",
          label: "authorization_flaw",
          message: "Ownership gap",
          confidence: "confirmed",
          rule_id: "m2_p1_request_controlled_owner",
          path: "src/lib/pay.ts",
          start_line: 4,
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
            // Placeholder literal — adapter may accept; honest gate requires Provix agreement.
            content: 'const key = "sk_live_example";\n',
          },
        ],
        companions: [],
      },
      { enabled: true, analyze }
    );

    expect(result?.pvimFindings).toHaveLength(2);
    expect(result?.pvimFindings?.[0]?.remediation).toMatchObject({
      kind: "unsupported",
      code: "scanner_does_not_agree",
    });
    expect(result?.pvimFindings?.[1]?.remediation).toMatchObject({
      kind: "unsupported",
      code: "unsupported_label",
    });
    expect(analyze.mock.calls[0]?.[0]?.commitSha).toBe(PIN);
  });

  it("passes pinned file content into supabase client eligibility checks", async () => {
    const analyze = vi.fn(async (input: PvimShadowRequestInput) =>
      shadowResult(input, [
        {
          finding_id: "m1:sb:src/components/List.tsx:3",
          source: "m1",
          family: "m1",
          label: "supabase_insecure_access",
          message: "Client from()",
          confidence: "confirmed",
          rule_id: "m1_supabase_from",
          path: "src/components/List.tsx",
          start_line: 3,
        },
      ])
    );

    // use client without a covered query: adapter supports, honest gate disagrees.
    const useClientOnly = await runPvimShadowForScan(
      {
        owner: "acme",
        repo: "app",
        defaultBranch: "main",
        commitSha: PIN,
        sources: [
          {
            filePath: "src/components/List.tsx",
            content: '"use client";\nexport function List() { return null }\n',
          },
        ],
        companions: [],
      },
      { enabled: true, analyze }
    );
    expect(useClientOnly?.pvimFindings?.[0]?.remediation).toMatchObject({
      kind: "unsupported",
      code: "scanner_does_not_agree",
    });

    const unsupported = await runPvimShadowForScan(
      {
        owner: "acme",
        repo: "app",
        defaultBranch: "main",
        commitSha: PIN,
        sources: [
          {
            filePath: "src/components/List.tsx",
            content: "export function List() { return null }\n",
          },
        ],
        companions: [],
      },
      { enabled: true, analyze }
    );
    expect(unsupported?.pvimFindings?.[0]?.remediation).toMatchObject({
      kind: "unsupported",
      code: "server_side_only",
    });
  });
});
