import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRunnerChecks, runnerStatus } from "@/lib/firewall-runner";
import { PVIM_SHADOW_LIMITS } from "@/lib/pvim/pvim-shadow-client";
import {
  isNonProductionSourcePath,
  isSqlMigrationCompanionPath,
  selectPvimShadowFiles,
} from "@/lib/pvim/pvim-shadow-scan";
import type { PvimShadowClientResult, PvimShadowRequestInput } from "@/lib/pvim/pvim-shadow-client";

const PIN = "abcdef0123456789abcdef0123456789abcdef01";
const BLOB = "2222222222222222222222222222222222222222";
const BLOB_ENV = "3333333333333333333333333333333333333333";
const BLOB_BIG = "4444444444444444444444444444444444444444";

const octokitMocks = {
  repos: { get: vi.fn() },
  git: {
    getRef: vi.fn(),
    getTree: vi.fn(),
    getBlob: vi.fn(),
  },
};

const analyzePvim = vi.fn();

vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn(function Octokit() {
    return { rest: octokitMocks };
  }),
}));

vi.mock("@/lib/honest-fix-gate", () => ({
  applyHonestFixGate: vi.fn(async (violations: unknown) => violations),
}));

vi.mock("../../scripts/ingest-engine", () => ({
  analyzeSourceTexts: vi.fn(() => ({
    timestamp: "2026-11-07T12:00:00.000Z",
    architectureScore: 77,
    summary: {
      totalFiles: 1,
      totalLines: 3,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
    },
    violations: [
      {
        filePath: "src/lib/hello.ts",
        severity: "LOW",
        rule: "orphan",
        message: "Provix architecture note",
        line: 1,
        category: "ARCHITECTURE",
      },
    ],
    files: [
      {
        filePath: "src/lib/hello.ts",
        extension: ".ts",
        lineCount: 3,
        charCount: 40,
        imports: [],
      },
    ],
  })),
}));

import {
  GITHUB_FIREWALL_FILE_CAP,
  scanPublicGitHubRepo,
  selectGitHubSourceBlobsForScan,
} from "@/lib/github-firewall-scan";

function okPvimResult(input: PvimShadowRequestInput): PvimShadowClientResult {
  return {
    status: "ok",
    elapsedMs: 12,
    report: {
      schema_version: "pvim.shadow_finding_report.v1",
      engine_version: "0.1.0",
      job_id: input.jobId,
      status: "ok",
      commit_sha: input.commitSha ?? "",
      findings: [
        {
          finding_id: "m2:authz:src/lib/hello.ts:2",
          source: "m2",
          family: "p1",
          label: "authorization_flaw",
          message: "Request-controlled owner filter",
          confidence: "confirmed",
          rule_id: "m2_p1_request_controlled_owner",
          path: "src/lib/hello.ts",
          start_line: 2,
        },
      ],
      incomplete_analysis: [],
      stats: {
        files_analyzed: input.files.length,
        finding_count: 1,
        m1_ran: true,
        m2_ran: true,
        elapsed_ms: 12,
      },
      error: null,
    },
  };
}

function mockTree(entries: Array<{ path: string; sha: string; size: number }>) {
  octokitMocks.git.getTree.mockResolvedValue({
    data: {
      truncated: false,
      tree: entries.map((entry) => ({
        type: "blob",
        path: entry.path,
        sha: entry.sha,
        size: entry.size,
      })),
    },
  });
}

function mockBlobs(map: Record<string, string>) {
  octokitMocks.git.getBlob.mockImplementation(async ({ file_sha }: { file_sha: string }) => {
    const content = map[file_sha];
    if (content === undefined) throw Object.assign(new Error("missing blob"), { status: 404 });
    return {
      data: {
        content: Buffer.from(content).toString("base64"),
        encoding: "base64",
      },
    };
  });
}

describe("scanPublicGitHubRepo PVIM shadow integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analyzePvim.mockReset();
    octokitMocks.repos.get.mockResolvedValue({ data: { default_branch: "main" } });
    octokitMocks.git.getRef.mockResolvedValue({ data: { object: { sha: PIN } } });
    mockTree([{ path: "src/lib/hello.ts", sha: BLOB, size: 40 }]);
    mockBlobs({
      [BLOB]: 'export const hello = "world";\n',
    });
  });

  it("does not call PVIM when the feature flag is disabled", async () => {
    analyzePvim.mockResolvedValue(okPvimResult({ jobId: "x", files: [], commitSha: PIN }));
    const result = await scanPublicGitHubRepo("acme/app", "tok", {
      pvim: { enabled: false, analyze: analyzePvim },
    });
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(result.body.report?.commitSha).toBe(PIN);
    expect(result.body.report?.pvim).toBeUndefined();
    expect(result.body.report?.pvimFindings).toBeUndefined();
    expect(analyzePvim).not.toHaveBeenCalled();
    expect(result.body.report?.architectureScore).toBe(77);
    expect(result.body.report?.violations).toHaveLength(1);
  });

  it("calls PVIM once when enabled and sends the exact scanned commit SHA", async () => {
    analyzePvim.mockImplementation(async (input: PvimShadowRequestInput) => okPvimResult(input));

    const result = await scanPublicGitHubRepo("acme/app", "tok", {
      pvim: { enabled: true, analyze: analyzePvim },
    });

    expect(result.status).toBe(200);
    expect(analyzePvim).toHaveBeenCalledTimes(1);
    const [input] = analyzePvim.mock.calls[0] as [PvimShadowRequestInput];
    expect(input.commitSha).toBe(PIN);
    expect(input.files).toEqual([
      expect.objectContaining({
        path: "src/lib/hello.ts",
        content: 'export const hello = "world";\n',
      }),
    ]);
    expect(input.repository).toEqual({
      provider: "github",
      owner: "acme",
      name: "app",
      defaultBranch: "main",
    });

    expect(result.body.report?.commitSha).toBe(PIN);
    expect(result.body.report?.pvim?.status).toBe("ok");
    expect(result.body.report?.pvim?.jobId).toBe(input.jobId);
    expect(result.body.report?.pvimFindings).toHaveLength(1);
    expect(result.body.report?.pvimFindings?.[0]?.source).toBe("pvim");
    expect(result.body.report?.pvimFindings?.[0]?.engineSource).toBe("m2");
    expect(result.body.report?.pvimFindings?.[0]?.label).toBe("authorization_flaw");
    expect(result.body.report?.pvimFindings?.[0]?.remediation).toMatchObject({
      kind: "unsupported",
      code: "unsupported_label",
    });

    // No second tip lookup for PVIM.
    expect(octokitMocks.git.getRef).toHaveBeenCalledTimes(1);
    expect(octokitMocks.git.getTree).toHaveBeenCalledWith(
      expect.objectContaining({ tree_sha: PIN })
    );
  });

  it("keeps PVIM findings out of violations and does not change score/runner", async () => {
    analyzePvim.mockImplementation(async (input: PvimShadowRequestInput) => okPvimResult(input));
    const result = await scanPublicGitHubRepo("acme/app", "tok", {
      pvim: { enabled: true, analyze: analyzePvim },
    });
    const report = result.body.report!;
    expect(report.violations.every((v) => v.source !== "pvim")).toBe(true);
    expect(report.violations).toHaveLength(1);
    expect(report.architectureScore).toBe(77);
    expect(report.pvimFindings?.[0]?.label).toBe("authorization_flaw");
    expect(report.pvimReasoning).toBeUndefined();

    const withoutPvim = {
      ...report,
      pvim: undefined,
      pvimFindings: undefined,
    };
    expect(runnerStatus(buildRunnerChecks(report))).toBe(runnerStatus(buildRunnerChecks(withoutPvim)));
  });

  it("carries optional pvimReasoning when the PVIM report includes valid reasoning", async () => {
    analyzePvim.mockImplementation(async (input: PvimShadowRequestInput) => {
      const base = okPvimResult(input);
      return {
        ...base,
        report: {
          ...base.report!,
          reasoning: {
            schema_version: "pvim.shadow_reasoning.v1",
            authoritative: false,
            may_authorize_remediation: false,
            status: "present",
            detail: "validated_advisory",
            provider: "local_double",
            case_id: "unmatched",
            case_selection: "auto:unmatched",
            stop_reason: "evidence_sufficient",
            error: null,
            has_critical_reliability_flags: true,
            critical_reliability_flags: ["ownership_inversion"],
            advisory: {
              verdict: "advisory_only",
              notes: "Review ownership carefully.",
              open_questions: ["Who authorized this?"],
              investigation: {
                answers: [
                  {
                    question_id: "gap_auth",
                    answer_text: "No operation-level authz established.",
                  },
                ],
              },
            },
          },
        },
      } satisfies PvimShadowClientResult;
    });

    const result = await scanPublicGitHubRepo("acme/app", "tok", {
      pvim: { enabled: true, analyze: analyzePvim },
    });
    const report = result.body.report!;
    expect(report.pvimReasoning?.status).toBe("present");
    expect(report.pvimReasoning?.notes).toMatch(/ownership/i);
    expect(report.pvimReasoning?.hasCriticalReliabilityFlags).toBe(true);
    expect(report.pvimReasoning?.criticalReliabilityFlags).toContain("ownership_inversion");
    expect(report.architectureScore).toBe(77);
    expect(report.violations).toHaveLength(1);
    expect(report.pvimFindings).toHaveLength(1);
  });

  it("survives missing PVIM service configuration", async () => {
    analyzePvim.mockResolvedValue({
      status: "unavailable",
      code: "missing_url",
      message: "PVIM_SHADOW_URL is not configured.",
      elapsedMs: 1,
    } satisfies PvimShadowClientResult);

    const result = await scanPublicGitHubRepo("acme/app", "tok", {
      pvim: { enabled: true, analyze: analyzePvim },
    });
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(result.body.report?.architectureScore).toBe(77);
    expect(result.body.report?.pvim?.status).toBe("unavailable");
    expect(result.body.report?.pvimFindings).toBeUndefined();
  });

  it("survives PVIM timeout", async () => {
    analyzePvim.mockResolvedValue({
      status: "timeout",
      code: "timeout",
      message: "timed out",
      elapsedMs: 10_000,
    } satisfies PvimShadowClientResult);

    const result = await scanPublicGitHubRepo("acme/app", "tok", {
      pvim: { enabled: true, analyze: analyzePvim },
    });
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(result.body.report?.pvim?.status).toBe("timeout");
    expect(result.body.report?.violations).toHaveLength(1);
  });

  it("survives PVIM connection failure", async () => {
    analyzePvim.mockResolvedValue({
      status: "unavailable",
      code: "connection_failed",
      message: "unreachable",
      elapsedMs: 5,
    } satisfies PvimShadowClientResult);

    const result = await scanPublicGitHubRepo("acme/app", "tok", {
      pvim: { enabled: true, analyze: analyzePvim },
    });
    expect(result.status).toBe(200);
    expect(result.body.report?.pvim?.status).toBe("unavailable");
  });

  it("survives invalid PVIM responses", async () => {
    analyzePvim.mockResolvedValue({
      status: "invalid_response",
      code: "invalid_schema",
      message: "schema_version must be pvim.shadow_finding_report.v1",
      elapsedMs: 3,
    } satisfies PvimShadowClientResult);

    const result = await scanPublicGitHubRepo("acme/app", "tok", {
      pvim: { enabled: true, analyze: analyzePvim },
    });
    expect(result.status).toBe(200);
    expect(result.body.report?.pvim?.status).toBe("error");
    expect(result.body.report?.architectureScore).toBe(77);
  });

  it("survives unexpected PVIM client throws", async () => {
    analyzePvim.mockImplementation(async () => {
      throw new Error("boom");
    });

    const result = await scanPublicGitHubRepo("acme/app", "tok", {
      pvim: { enabled: true, analyze: analyzePvim },
    });
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(result.body.report?.pvim?.status).toBe("error");
    expect(result.body.report?.pvim?.message).toMatch(/threw unexpectedly/);
  });

  it("excludes oversized individual files without truncation and marks incomplete", async () => {
    const huge = "x".repeat(PVIM_SHADOW_LIMITS.maxFileBytes + 10);
    mockTree([
      { path: "src/lib/hello.ts", sha: BLOB, size: 40 },
      { path: "src/lib/huge.ts", sha: BLOB_BIG, size: huge.length },
    ]);
    mockBlobs({
      [BLOB]: 'export const hello = "world";\n',
      [BLOB_BIG]: huge,
    });

    analyzePvim.mockImplementation(async (input: PvimShadowRequestInput) => okPvimResult(input));

    const result = await scanPublicGitHubRepo("acme/app", "tok", {
      pvim: { enabled: true, analyze: analyzePvim },
    });

    expect(analyzePvim).toHaveBeenCalledTimes(1);
    const [input] = analyzePvim.mock.calls[0] as [PvimShadowRequestInput];
    expect(input.files.map((f) => f.path)).toEqual(["src/lib/hello.ts"]);
    expect(input.files.some((f) => f.content.length > PVIM_SHADOW_LIMITS.maxFileBytes)).toBe(false);
    expect(result.body.report?.pvim?.status).toBe("incomplete");
    expect(result.body.report?.pvim?.message).toMatch(/Excluded/);
    expect(result.body.report?.pvim?.message).toMatch(/file_too_large/);
  });

  it("respects the total payload limit without truncation", async () => {
    const chunk = "y".repeat(PVIM_SHADOW_LIMITS.maxFileBytes);
    const tree = Array.from({ length: 12 }, (_, i) => ({
      path: `src/lib/part${String(i).padStart(2, "0")}.ts`,
      sha: `${i.toString(16).padStart(40, "0")}`,
      size: chunk.length,
    }));
    mockTree(tree);
    const blobMap: Record<string, string> = {};
    for (const entry of tree) blobMap[entry.sha] = chunk;
    mockBlobs(blobMap);

    analyzePvim.mockImplementation(async (input: PvimShadowRequestInput) => okPvimResult(input));

    const result = await scanPublicGitHubRepo("acme/app", "tok", {
      pvim: { enabled: true, analyze: analyzePvim },
    });

    expect(analyzePvim).toHaveBeenCalledTimes(1);
    const [input] = analyzePvim.mock.calls[0] as [PvimShadowRequestInput];
    const total = input.files.reduce((sum, f) => sum + Buffer.byteLength(f.content, "utf8"), 0);
    expect(total).toBeLessThanOrEqual(PVIM_SHADOW_LIMITS.maxTotalBytes);
    expect(input.files.length).toBeLessThan(12);
    expect(result.body.report?.pvim?.status).toBe("incomplete");
    expect(result.body.report?.pvim?.message).toMatch(/total_too_large/);
  });

  it("skips the PVIM request when no eligible files remain", async () => {
    const huge = "x".repeat(PVIM_SHADOW_LIMITS.maxFileBytes + 25);
    mockTree([
      { path: "src/lib/huge.ts", sha: BLOB_BIG, size: huge.length },
      { path: ".env", sha: BLOB_ENV, size: 20 },
    ]);
    mockBlobs({
      [BLOB_BIG]: huge,
      [BLOB_ENV]: "SECRET=1\n",
    });

    analyzePvim.mockImplementation(async (input: PvimShadowRequestInput) => okPvimResult(input));

    const result = await scanPublicGitHubRepo("acme/app", "tok", {
      pvim: { enabled: true, analyze: analyzePvim },
    });

    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(analyzePvim).not.toHaveBeenCalled();
    expect(result.body.report?.pvim?.status).toBe("incomplete");
    expect(result.body.report?.pvim?.message).toMatch(/no eligible files|skipped/i);
    expect(result.body.report?.commitSha).toBe(PIN);
  });

  it("preserves unchanged Provix scan behavior with the flag disabled", async () => {
    const disabled = await scanPublicGitHubRepo("acme/app", "tok", {
      pvim: { enabled: false, analyze: analyzePvim },
    });
    expect(disabled.body.report?.architectureScore).toBe(77);
    expect(disabled.body.report?.violations).toHaveLength(1);
    expect(disabled.body.report?.pvim).toBeUndefined();
    expect(disabled.body.coverage).toEqual({
      scanned: 1,
      total: 1,
      treeTruncated: false,
    });
    expect(octokitMocks.git.getRef).toHaveBeenCalledTimes(1);
  });
});

describe("selectPvimShadowFiles", () => {
  it("excludes oversized files without truncating contents", () => {
    const huge = "z".repeat(PVIM_SHADOW_LIMITS.maxFileBytes + 1);
    const selection = selectPvimShadowFiles([
      { filePath: "src/ok.ts", content: "const ok = 1;\n" },
      { filePath: "src/huge.ts", content: huge },
    ]);
    expect(selection.files.map((f) => f.path)).toEqual(["src/ok.ts"]);
    expect(selection.exclusions.some((e) => e.code === "file_too_large")).toBe(true);
    expect(selection.files[0]?.content).toBe("const ok = 1;\n");
  });

  it("stops before exceeding the total byte budget", () => {
    const chunk = "a".repeat(PVIM_SHADOW_LIMITS.maxFileBytes);
    const files = Array.from({ length: 11 }, (_, i) => ({
      filePath: `src/f${String(i).padStart(2, "0")}.ts`,
      content: chunk,
    }));
    const selection = selectPvimShadowFiles(files);
    expect(selection.totalBytes).toBeLessThanOrEqual(PVIM_SHADOW_LIMITS.maxTotalBytes);
    expect(selection.exclusions.some((e) => e.code === "total_too_large")).toBe(true);
    expect(selection.files.every((f) => f.content.length === chunk.length)).toBe(true);
  });

  it("fills production sources before large test fixtures under max_files", () => {
    const prior = PVIM_SHADOW_LIMITS.maxFiles;
    // Temporarily exercise the fill order with a tiny cap via many tiny files.
    const production = Array.from({ length: 3 }, (_, i) => ({
      filePath: `src/app/prod${i}.ts`,
      content: `export const p${i} = ${i};\n`,
    }));
    const fixtures = [
      {
        filePath: "src/lib/scanner/security-suite.test.ts",
        content: `${"x".repeat(200)}export const fixture = true;\n`,
      },
      {
        filePath: "src/__fixtures__/fake-supabase.ts",
        content: `${"y".repeat(200)}export const fake = true;\n`,
      },
    ];
    const selection = selectPvimShadowFiles([...fixtures, ...production]);
    expect(prior).toBeGreaterThanOrEqual(5);
    expect(selection.files.slice(0, 3).map((f) => f.path)).toEqual([
      "src/app/prod0.ts",
      "src/app/prod1.ts",
      "src/app/prod2.ts",
    ]);
    expect(selection.files.some((f) => f.path.endsWith(".test.ts"))).toBe(true);
  });

  it("still includes test files when budget remains so secrets can be scanned", () => {
    const selection = selectPvimShadowFiles([
      { filePath: "src/lib/app.ts", content: "export const ok = 1;\n" },
      {
        filePath: "src/lib/leak.test.ts",
        content: 'export const token = "ghp_AAAAAAAAAAAAAAAAAAAAAAAA";\n',
      },
    ]);
    expect(selection.files.map((f) => f.path)).toEqual(["src/lib/app.ts", "src/lib/leak.test.ts"]);
    expect(selection.files[1]?.content).toContain("ghp_");
  });

  it("keeps SQL migrations eligible with sql language tagging", () => {
    const selection = selectPvimShadowFiles([
      { filePath: "src/lib/app.ts", content: "export const ok = 1;\n" },
      {
        filePath: "supabase/migrations/20260101000000_init.sql",
        content: "alter table profiles enable row level security;\n",
      },
    ]);
    expect(selection.files.map((f) => f.path)).toEqual([
      "src/lib/app.ts",
      "supabase/migrations/20260101000000_init.sql",
    ]);
    expect(selection.files[1]?.language).toBe("sql");
  });

  it("enforces max_files against production-first ordering", () => {
    const chunk = "p".repeat(64);
    const files = [
      ...Array.from({ length: 3 }, (_, i) => ({
        filePath: `src/z-test/suite${i}.test.ts`,
        content: `${chunk}${i}`,
      })),
      ...Array.from({ length: PVIM_SHADOW_LIMITS.maxFiles + 5 }, (_, i) => ({
        filePath: `src/a-prod/file${String(i).padStart(3, "0")}.ts`,
        content: `${chunk}${i}`,
      })),
    ];
    const selection = selectPvimShadowFiles(files);
    expect(selection.files).toHaveLength(PVIM_SHADOW_LIMITS.maxFiles);
    expect(selection.files.every((f) => f.path.startsWith("src/a-prod/"))).toBe(true);
    expect(selection.exclusions.some((e) => e.code === "max_files")).toBe(true);
    expect(selection.exclusions.some((e) => e.path.includes(".test.ts"))).toBe(true);
  });
});

describe("isNonProductionSourcePath / SQL companions", () => {
  it("classifies test, fixture, mock, generated, and example paths", () => {
    expect(isNonProductionSourcePath("src/lib/app.ts")).toBe(false);
    expect(isNonProductionSourcePath("src/lib/app.test.ts")).toBe(true);
    expect(isNonProductionSourcePath("src/lib/app.spec.tsx")).toBe(true);
    expect(isNonProductionSourcePath("src/__tests__/unit.ts")).toBe(true);
    expect(isNonProductionSourcePath("src/__fixtures__/db.ts")).toBe(true);
    expect(isNonProductionSourcePath("src/__mocks__/supabase.ts")).toBe(true);
    expect(isNonProductionSourcePath("examples/demo/app.ts")).toBe(true);
    expect(isNonProductionSourcePath("src/gen/foo.generated.ts")).toBe(true);
    expect(isNonProductionSourcePath("src/components/Button.stories.tsx")).toBe(true);
  });

  it("recognizes Supabase SQL migration companions", () => {
    expect(isSqlMigrationCompanionPath("supabase/migrations/20260101_init.sql")).toBe(true);
    expect(isSqlMigrationCompanionPath("migrations/001_create.sql")).toBe(true);
    expect(isSqlMigrationCompanionPath("src/lib/notes.sql")).toBe(false);
    expect(isSqlMigrationCompanionPath("README.md")).toBe(false);
  });
});

describe("selectGitHubSourceBlobsForScan production-first FILE_CAP", () => {
  it("does not let a huge test file displace production sources", () => {
    const blobs = [
      { path: "src/lib/scanner/security-suite.test.ts", sha: "t1", size: 900_000 },
      { path: "src/app/api/audit/route.ts", sha: "p1", size: 40_000 },
      { path: "src/lib/persist.ts", sha: "p2", size: 30_000 },
      { path: "src/lib/helper.ts", sha: "p3", size: 20_000 },
    ];
    const selected = selectGitHubSourceBlobsForScan(blobs, 3);
    expect(selected.map((b) => b.path)).toEqual([
      "src/app/api/audit/route.ts",
      "src/lib/persist.ts",
      "src/lib/helper.ts",
    ]);
    expect(selected.some((b) => b.path.endsWith(".test.ts"))).toBe(false);
  });

  it("keeps remaining FILE_CAP slots for tests after production is selected", () => {
    const blobs = [
      { path: "src/lib/app.ts", sha: "p1", size: 100 },
      { path: "src/lib/leak.test.ts", sha: "t1", size: 50_000 },
    ];
    const selected = selectGitHubSourceBlobsForScan(blobs, 2);
    expect(selected.map((b) => b.path)).toEqual(["src/lib/app.ts", "src/lib/leak.test.ts"]);
  });

  it("preserves the default FILE_CAP bound", () => {
    expect(GITHUB_FIREWALL_FILE_CAP).toBe(50);
    const blobs = Array.from({ length: 80 }, (_, i) => ({
      path: `src/lib/f${String(i).padStart(3, "0")}.ts`,
      sha: `s${i}`,
      size: 1000 - i,
    }));
    expect(selectGitHubSourceBlobsForScan(blobs)).toHaveLength(50);
  });
});

describe("scanPublicGitHubRepo production-first + SQL companions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analyzePvim.mockReset();
    octokitMocks.repos.get.mockResolvedValue({ data: { default_branch: "main" } });
    octokitMocks.git.getRef.mockResolvedValue({ data: { object: { sha: PIN } } });
  });

  it("fetches production sources before oversized tests and still sends test secrets when slots remain", async () => {
    const BLOB_PROD = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const BLOB_TEST = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const BLOB_SQL = "cccccccccccccccccccccccccccccccccccccccc";
    mockTree([
      { path: "src/lib/scanner/security-suite.test.ts", sha: BLOB_TEST, size: 500_000 },
      { path: "src/app/api/screen/route.ts", sha: BLOB_PROD, size: 8_000 },
      { path: "supabase/migrations/20260101000000_rls.sql", sha: BLOB_SQL, size: 120 },
    ]);
    mockBlobs({
      [BLOB_PROD]: 'export async function GET() { return Response.json({}); }\n',
      [BLOB_TEST]: 'export const token = "ghp_BBBBBBBBBBBBBBBBBBBB";\n',
      [BLOB_SQL]: "alter table profiles enable row level security;\n",
    });
    analyzePvim.mockImplementation(async (input: PvimShadowRequestInput) => okPvimResult(input));

    const result = await scanPublicGitHubRepo("acme/app", "tok", {
      pvim: { enabled: true, analyze: analyzePvim },
    });

    expect(result.status).toBe(200);
    expect(analyzePvim).toHaveBeenCalledTimes(1);
    const [input] = analyzePvim.mock.calls[0] as [PvimShadowRequestInput];
    expect(input.files[0]?.path).toBe("src/app/api/screen/route.ts");
    expect(input.files.some((f) => f.path.endsWith(".test.ts"))).toBe(true);
    expect(input.files.some((f) => f.content.includes("ghp_"))).toBe(true);
    expect(input.files.some((f) => f.path.includes("supabase/migrations/") && f.language === "sql")).toBe(
      true
    );
  });
});
