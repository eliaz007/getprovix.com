import { describe, expect, it, vi } from "vitest";
import {
  verifyPvimFixResolved,
  type PvimPostFixVerifyTarget,
} from "@/lib/pvim/pvim-post-fix-verify";
import type { PvimShadowClientResult, PvimShadowRequestInput } from "@/lib/pvim/pvim-shadow-client";

const PIN = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const FINDING_ID = "m1:secret:src/lib/pay.ts:1";

const original: PvimPostFixVerifyTarget = {
  findingId: FINDING_ID,
  ruleId: "secrets_stripe_live",
  filePath: "src/lib/pay.ts",
  commitSha: PIN,
};

const patchedClean = [
  {
    path: "src/lib/pay.ts",
    content: "export const key = process.env.STRIPE_SECRET_KEY;\n",
  },
];

function okResult(
  input: PvimShadowRequestInput,
  findings: NonNullable<PvimShadowClientResult["report"]>["findings"] = []
): PvimShadowClientResult {
  return {
    status: "ok",
    elapsedMs: 5,
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
        elapsed_ms: 5,
      },
      error: null,
    },
  };
}

describe("verifyPvimFixResolved", () => {
  it("passes when the original finding_id disappears", async () => {
    const analyze = vi.fn(async (input: PvimShadowRequestInput) => okResult(input, []));
    const result = await verifyPvimFixResolved(original, patchedClean, { analyze });
    expect(result).toEqual({ ok: true });
    expect(analyze).toHaveBeenCalledWith(
      expect.objectContaining({
        commitSha: PIN,
        files: [expect.objectContaining({ path: "src/lib/pay.ts" })],
      }),
      undefined
    );
  });

  it("fails closed when the original finding_id remains", async () => {
    const analyze = vi.fn(async (input: PvimShadowRequestInput) =>
      okResult(input, [
        {
          finding_id: FINDING_ID,
          source: "m1",
          label: "secret_hardcoded",
          confidence: "confirmed",
          rule_id: "secrets_stripe_live",
          path: "src/lib/pay.ts",
          start_line: 1,
          message: "still there",
        },
      ])
    );
    const result = await verifyPvimFixResolved(original, patchedClean, { analyze });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("still-present");
      expect(result.message).toMatch(/still present/i);
      expect(result.message).toMatch(/pull request was not opened/i);
      expect(result.message).toContain(FINDING_ID);
    }
  });

  it("fails closed on PVIM timeout", async () => {
    const analyze = vi.fn(async () => ({
      status: "timeout" as const,
      code: "timeout",
      message: "timed out",
      elapsedMs: 10_000,
    }));
    const result = await verifyPvimFixResolved(original, patchedClean, { analyze });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("timeout");
      expect(result.message).toMatch(/timed out/i);
    }
  });

  it("fails closed when PVIM is unavailable", async () => {
    const analyze = vi.fn(async () => ({
      status: "unavailable" as const,
      code: "missing_url",
      message: "PVIM_SHADOW_URL is not configured.",
      elapsedMs: 1,
    }));
    const result = await verifyPvimFixResolved(original, patchedClean, { analyze });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unavailable");
      expect(result.message).toMatch(/unavailable/i);
    }
  });

  it("fails closed on invalid response", async () => {
    const analyze = vi.fn(async () => ({
      status: "invalid_response" as const,
      code: "invalid_schema",
      message: "schema_version must be pvim.shadow_finding_report.v1",
      elapsedMs: 2,
    }));
    const result = await verifyPvimFixResolved(original, patchedClean, { analyze });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_response");
      expect(result.message).toMatch(/invalid response/i);
    }
  });

  it("fails closed on incomplete report", async () => {
    const analyze = vi.fn(async (input: PvimShadowRequestInput) => ({
      status: "incomplete" as const,
      elapsedMs: 4,
      report: {
        schema_version: "pvim.shadow_finding_report.v1" as const,
        engine_version: "0.1.0",
        job_id: input.jobId,
        status: "ok" as const,
        commit_sha: PIN,
        findings: [],
        incomplete_analysis: [{ code: "parse_error", message: "could not parse" }],
        stats: { files_analyzed: 1, finding_count: 0, elapsed_ms: 4 },
        error: null,
      },
    }));
    const result = await verifyPvimFixResolved(original, patchedClean, { analyze });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("incomplete");
      expect(result.message).toMatch(/incomplete/i);
    }
  });

  it("fails closed when wire report status is incomplete even with empty incomplete_analysis", async () => {
    const analyze = vi.fn(async (input: PvimShadowRequestInput) => ({
      status: "incomplete" as const,
      elapsedMs: 4,
      report: {
        schema_version: "pvim.shadow_finding_report.v1" as const,
        engine_version: "0.1.0",
        job_id: input.jobId,
        status: "incomplete" as const,
        commit_sha: PIN,
        findings: [],
        incomplete_analysis: [],
        stats: { files_analyzed: 1, finding_count: 0, elapsed_ms: 4 },
        error: null,
      },
    }));
    const result = await verifyPvimFixResolved(original, patchedClean, { analyze });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("incomplete");
    }
  });

  it("fails closed on timeout distinctly from incomplete", async () => {
    const analyze = vi.fn(async (input: PvimShadowRequestInput) => ({
      status: "timeout" as const,
      elapsedMs: 4,
      report: {
        schema_version: "pvim.shadow_finding_report.v1" as const,
        engine_version: "0.1.0",
        job_id: input.jobId,
        status: "timeout" as const,
        commit_sha: PIN,
        findings: [],
        incomplete_analysis: [],
        stats: { files_analyzed: 0, finding_count: 0, elapsed_ms: 4 },
        error: { code: "timeout", message: "budget exceeded" },
      },
    }));
    const result = await verifyPvimFixResolved(original, patchedClean, { analyze });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("timeout");
    }
  });

  it("passes when a different finding_id appears and the original is gone", async () => {
    const analyze = vi.fn(async (input: PvimShadowRequestInput) =>
      okResult(input, [
        {
          finding_id: "m1:secret:src/lib/pay.ts:9",
          source: "m1",
          label: "secret_hardcoded",
          confidence: "confirmed",
          rule_id: "secrets_openai",
          path: "src/lib/pay.ts",
          start_line: 9,
          message: "different secret",
        },
      ])
    );
    const result = await verifyPvimFixResolved(original, patchedClean, { analyze });
    expect(result).toEqual({ ok: true });
  });

  it("only fails when the original finding_id remains among multiple findings", async () => {
    const analyze = vi.fn(async (input: PvimShadowRequestInput) =>
      okResult(input, [
        {
          finding_id: "m2:authz:src/lib/pay.ts:4",
          source: "m2",
          family: "p1",
          label: "authorization_flaw",
          confidence: "confirmed",
          rule_id: "m2_p1_request_controlled_owner",
          path: "src/lib/pay.ts",
          start_line: 4,
          message: "unrelated",
        },
        {
          finding_id: FINDING_ID,
          source: "m1",
          label: "secret_hardcoded",
          confidence: "confirmed",
          rule_id: "secrets_stripe_live",
          path: "src/lib/pay.ts",
          start_line: 1,
          message: "original",
        },
      ])
    );
    const result = await verifyPvimFixResolved(original, patchedClean, { analyze });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("still-present");

    const cleared = vi.fn(async (input: PvimShadowRequestInput) =>
      okResult(input, [
        {
          finding_id: "m2:authz:src/lib/pay.ts:4",
          source: "m2",
          family: "p1",
          label: "authorization_flaw",
          confidence: "confirmed",
          rule_id: "m2_p1_request_controlled_owner",
          path: "src/lib/pay.ts",
          start_line: 4,
          message: "unrelated remains",
        },
      ])
    );
    await expect(verifyPvimFixResolved(original, patchedClean, { analyze: cleared })).resolves.toEqual({
      ok: true,
    });
  });

  it("fails closed when the original path is missing from the patched file set", async () => {
    const analyze = vi.fn();
    const result = await verifyPvimFixResolved(original, [
      { path: "src/lib/other.ts", content: "export const ok = true;\n" },
    ], { analyze });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("incomplete");
      expect(result.message).toMatch(/original finding path/i);
    }
    expect(analyze).not.toHaveBeenCalled();
  });

  it("fails closed on invalid pinned commit SHA", async () => {
    const analyze = vi.fn();
    const result = await verifyPvimFixResolved(
      { ...original, commitSha: "not-a-sha" },
      patchedClean,
      { analyze }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("verify-failed");
    expect(analyze).not.toHaveBeenCalled();
  });
});
