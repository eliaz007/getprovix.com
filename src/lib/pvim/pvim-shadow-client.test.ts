import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PVIM_SHADOW_TIMEOUT_MS,
  PVIM_SHADOW_LIMITS,
  PVIM_SHADOW_REASONING_SCHEMA,
  PVIM_SHADOW_REPORT_SCHEMA,
  PVIM_SHADOW_REQUEST_SCHEMA,
  analyzeWithPvimShadow,
  buildPvimShadowRequest,
  canonicalizePvimRepoPath,
  mapReportStatus,
  parsePvimShadowReport,
  toFirewallPvimAnalysis,
  toFirewallPvimFindings,
  toFirewallPvimReasoning,
  type PvimShadowReportV1,
  type PvimShadowRequestInput,
} from "@/lib/pvim/pvim-shadow-client";

const TOKEN = "test-pvim-service-token-secret";
const BASE_URL = "http://127.0.0.1:8080";

function baseInput(overrides: Partial<PvimShadowRequestInput> = {}): PvimShadowRequestInput {
  return {
    jobId: "job-phase-3c",
    commitSha: "abcdef1",
    files: [
      {
        path: "src/app/api/items/route.ts",
        content: 'export async function GET() { return Response.json({ ok: true }); }\n',
        language: "typescript",
      },
    ],
    options: { runM1: true, runM2: true },
    ...overrides,
  };
}

function okReport(overrides: Partial<PvimShadowReportV1> = {}): PvimShadowReportV1 {
  return {
    schema_version: PVIM_SHADOW_REPORT_SCHEMA,
    engine_version: "0.1.0",
    job_id: "job-phase-3c",
    status: "ok",
    commit_sha: "abcdef1",
    findings: [
      {
        finding_id: "m2:rule:src/app/api/items/route.ts:10",
        source: "m2",
        family: "p1",
        label: "authorization_flaw",
        message: "Request-controlled owner filter",
        confidence: "confirmed",
        rule_id: "m2_p1_request_controlled_owner",
        path: "src/app/api/items/route.ts",
        start_line: 10,
      },
    ],
    incomplete_analysis: [],
    stats: {
      files_analyzed: 1,
      finding_count: 1,
      m1_ran: true,
      m2_ran: true,
      elapsed_ms: 42,
    },
    error: null,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("buildPvimShadowRequest bounds", () => {
  it("builds the exact pvim.shadow_request.v1 wire shape", () => {
    const built = buildPvimShadowRequest(baseInput());
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.request.schema_version).toBe(PVIM_SHADOW_REQUEST_SCHEMA);
    expect(built.request.job_id).toBe("job-phase-3c");
    expect(built.request.commit_sha).toBe("abcdef1");
    expect(built.request.files[0]?.path).toBe("src/app/api/items/route.ts");
    expect(built.request.options).toEqual({ run_m1: true, run_m2: true });
  });

  it("rejects an oversized individual file without truncating", () => {
    const content = "x".repeat(PVIM_SHADOW_LIMITS.maxFileBytes + 1);
    const built = buildPvimShadowRequest(
      baseInput({ files: [{ path: "src/big.ts", content }] })
    );
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.code).toBe("file_too_large");
    expect(built.rejections[0]).toMatch(/exceeds max_file_bytes/);
  });

  it("rejects total payload over the limit without truncating", () => {
    const chunk = "y".repeat(PVIM_SHADOW_LIMITS.maxFileBytes);
    const files = Array.from({ length: 10 }, (_, i) => ({
      path: `src/f${i}.ts`,
      content: chunk,
    }));
    const built = buildPvimShadowRequest(baseInput({ files }));
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.code).toBe("total_too_large");
    expect(built.rejections.some((r) => r.includes("max_total_bytes"))).toBe(true);
  });

  it("rejects path traversal and absolute paths", () => {
    expect(canonicalizePvimRepoPath("../etc/passwd").ok).toBe(false);
    expect(canonicalizePvimRepoPath("/etc/passwd").ok).toBe(false);
    const built = buildPvimShadowRequest(
      baseInput({ files: [{ path: "../secret.ts", content: "const x = 1;\n" }] })
    );
    expect(built.ok).toBe(false);
  });

  it("rejects prohibited secret-bearing paths", () => {
    const built = buildPvimShadowRequest(
      baseInput({ files: [{ path: ".env", content: "SECRET=1\n" }] })
    );
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.code).toBe("prohibited_path");
  });
});

describe("analyzeWithPvimShadow", () => {
  it("returns unavailable when URL is missing", async () => {
    const result = await analyzeWithPvimShadow(baseInput(), {
      url: "",
      token: TOKEN,
      fetch: vi.fn(),
    });
    expect(result.status).toBe("unavailable");
    expect(result.code).toBe("missing_url");
    expect(result.message).toMatch(/PVIM_SHADOW_URL/);
  });

  it("returns unavailable when token is missing", async () => {
    const result = await analyzeWithPvimShadow(baseInput(), {
      url: BASE_URL,
      token: "",
      fetch: vi.fn(),
    });
    expect(result.status).toBe("unavailable");
    expect(result.code).toBe("missing_token");
    expect(result.message).toMatch(/PVIM_SERVICE_TOKEN/);
  });

  it("sends an authenticated request with the correct schema and headers", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://127.0.0.1:8080/v1/analyze");
      expect(init?.method).toBe("POST");
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
      expect(headers.get("Content-Type")).toBe("application/json");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.schema_version).toBe(PVIM_SHADOW_REQUEST_SCHEMA);
      expect(body.job_id).toBe("job-phase-3c");
      expect(body.commit_sha).toBe("abcdef1");
      expect(Array.isArray(body.files)).toBe(true);
      return jsonResponse(okReport());
    });

    const result = await analyzeWithPvimShadow(baseInput(), {
      url: BASE_URL,
      token: TOKEN,
      fetch: fetchMock as typeof fetch,
    });

    expect(result.status).toBe("ok");
    expect(result.report?.schema_version).toBe(PVIM_SHADOW_REPORT_SCHEMA);
    expect(result.report?.job_id).toBe("job-phase-3c");
    expect(result.report?.commit_sha).toBe("abcdef1");
    expect(result.report?.findings).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves job_id and commit_sha from a valid report", async () => {
    const result = await analyzeWithPvimShadow(
      baseInput({ jobId: "preserve-me", commitSha: "deadbeefcafebabe" }),
      {
        url: BASE_URL,
        token: TOKEN,
        fetch: vi.fn(async () =>
          jsonResponse(
            okReport({ job_id: "preserve-me", commit_sha: "deadbeefcafebabe" })
          )
        ) as typeof fetch,
      }
    );
    expect(result.status).toBe("ok");
    expect(result.report?.job_id).toBe("preserve-me");
    expect(result.report?.commit_sha).toBe("deadbeefcafebabe");
  });

  it("aborts on timeout and returns timeout status", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal;
      expect(signal).toBeDefined();
      return await new Promise<Response>((_resolve, reject) => {
        const onAbort = () => {
          const err = new Error("The operation was aborted");
          err.name = "TimeoutError";
          reject(err);
        };
        if (signal?.aborted) {
          onAbort();
          return;
        }
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    });

    const result = await analyzeWithPvimShadow(baseInput(), {
      url: BASE_URL,
      token: TOKEN,
      timeoutMs: 20,
      fetch: fetchMock as typeof fetch,
    });

    expect(result.status).toBe("timeout");
    expect(result.code).toBe("timeout");
    expect(result.message).toMatch(/timed out/);
  });

  it("maps connection failure to unavailable", async () => {
    const result = await analyzeWithPvimShadow(baseInput(), {
      url: BASE_URL,
      token: TOKEN,
      fetch: vi.fn(async () => {
        throw new TypeError("fetch failed");
      }) as typeof fetch,
    });
    expect(result.status).toBe("unavailable");
    expect(result.code).toBe("connection_failed");
  });

  it("maps non-success HTTP responses to error", async () => {
    const result = await analyzeWithPvimShadow(baseInput(), {
      url: BASE_URL,
      token: TOKEN,
      fetch: vi.fn(async () => jsonResponse({ ok: false }, 503)) as typeof fetch,
    });
    expect(result.status).toBe("error");
    expect(result.code).toBe("http_503");
  });

  it("maps malformed JSON to invalid_response", async () => {
    const result = await analyzeWithPvimShadow(baseInput(), {
      url: BASE_URL,
      token: TOKEN,
      fetch: vi.fn(
        async () =>
          new Response("{not-json", {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
      ) as typeof fetch,
    });
    expect(result.status).toBe("invalid_response");
    expect(result.code).toBe("malformed_json");
  });

  it("maps invalid response schema to invalid_response", async () => {
    const result = await analyzeWithPvimShadow(baseInput(), {
      url: BASE_URL,
      token: TOKEN,
      fetch: vi.fn(async () =>
        jsonResponse({ schema_version: "wrong", job_id: "x" })
      ) as typeof fetch,
    });
    expect(result.status).toBe("invalid_response");
    expect(result.code).toBe("invalid_schema");
  });

  it("does not send oversized payloads and never truncates", async () => {
    const fetchMock = vi.fn();
    const content = "z".repeat(PVIM_SHADOW_LIMITS.maxFileBytes + 50);
    const result = await analyzeWithPvimShadow(
      baseInput({ files: [{ path: "src/huge.ts", content }] }),
      { url: BASE_URL, token: TOKEN, fetch: fetchMock as typeof fetch }
    );
    expect(result.status).toBe("error");
    expect(result.code).toBe("file_too_large");
    expect(result.rejections?.length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not send when total payload exceeds the limit", async () => {
    const fetchMock = vi.fn();
    const chunk = "a".repeat(PVIM_SHADOW_LIMITS.maxFileBytes);
    const files = Array.from({ length: 11 }, (_, i) => ({
      path: `src/part${i}.ts`,
      content: chunk,
    }));
    const result = await analyzeWithPvimShadow(baseInput({ files }), {
      url: BASE_URL,
      token: TOKEN,
      fetch: fetchMock as typeof fetch,
    });
    expect(result.status).toBe("error");
    expect(result.code).toBe("total_too_large");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never leaks the bearer token in errors or messages", async () => {
    const result = await analyzeWithPvimShadow(baseInput(), {
      url: BASE_URL,
      token: TOKEN,
      fetch: vi.fn(async () => {
        throw new Error(`upstream failed Authorization Bearer ${TOKEN}`);
      }) as typeof fetch,
    });
    const blob = JSON.stringify(result);
    expect(blob).not.toContain(TOKEN);
    expect(result.message).not.toContain(TOKEN);
    expect(result.message).toMatch(/\[redacted\]/);
  });

  it("never throws to its caller", async () => {
    const exploding: typeof fetch = (() => {
      throw "not-an-error-object";
    }) as typeof fetch;

    await expect(
      analyzeWithPvimShadow(baseInput(), {
        url: BASE_URL,
        token: TOKEN,
        fetch: exploding,
      })
    ).resolves.toMatchObject({ status: expect.any(String) });
  });

  it("uses the default ~10s timeout when none is provided", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return jsonResponse(okReport());
    });
    await analyzeWithPvimShadow(baseInput(), {
      url: BASE_URL,
      token: TOKEN,
      fetch: fetchMock as typeof fetch,
    });
    expect(DEFAULT_PVIM_SHADOW_TIMEOUT_MS).toBe(10_000);
  });

  it("maps incomplete_analysis reports to incomplete status", async () => {
    const result = await analyzeWithPvimShadow(baseInput(), {
      url: BASE_URL,
      token: TOKEN,
      fetch: vi.fn(async () =>
        jsonResponse(
          okReport({
            incomplete_analysis: [
              { code: "partial", message: "M2 skipped a file", path: "src/a.ts" },
            ],
          })
        )
      ) as typeof fetch,
    });
    expect(result.status).toBe("incomplete");
  });

  it("maps wire status incomplete to client incomplete", async () => {
    const result = await analyzeWithPvimShadow(baseInput(), {
      url: BASE_URL,
      token: TOKEN,
      fetch: vi.fn(async () =>
        jsonResponse(
          okReport({
            status: "incomplete",
            incomplete_analysis: [
              { code: "coverage_gap", message: "enrichment incomplete", path: "src/a.ts" },
            ],
          })
        )
      ) as typeof fetch,
    });
    expect(result.status).toBe("incomplete");
    expect(result.report?.status).toBe("incomplete");
  });

  it("never treats partial coverage as a clean scan when wire status is ok", async () => {
    const result = await analyzeWithPvimShadow(baseInput(), {
      url: BASE_URL,
      token: TOKEN,
      fetch: vi.fn(async () =>
        jsonResponse(
          okReport({
            status: "ok",
            incomplete_analysis: [{ code: "legacy_gap", message: "compat path" }],
          })
        )
      ) as typeof fetch,
    });
    expect(result.status).toBe("incomplete");
  });

  it("maps hard failure statuses distinctly", async () => {
    const timeout = await analyzeWithPvimShadow(baseInput(), {
      url: BASE_URL,
      token: TOKEN,
      fetch: vi.fn(async () =>
        jsonResponse(
          okReport({
            status: "timeout",
            findings: [],
            error: { code: "timeout", message: "budget exceeded" },
          })
        )
      ) as typeof fetch,
    });
    expect(timeout.status).toBe("timeout");

    const error = await analyzeWithPvimShadow(baseInput(), {
      url: BASE_URL,
      token: TOKEN,
      fetch: vi.fn(async () =>
        jsonResponse(
          okReport({
            status: "error",
            findings: [],
            error: { code: "internal", message: "boom" },
          })
        )
      ) as typeof fetch,
    });
    expect(error.status).toBe("error");
  });
});

describe("mapReportStatus", () => {
  it("distinguishes complete, partial, and failure", () => {
    expect(mapReportStatus(okReport())).toBe("ok");
    expect(
      mapReportStatus(
        okReport({
          status: "incomplete",
          incomplete_analysis: [{ code: "gap", message: "partial" }],
        })
      )
    ).toBe("incomplete");
    expect(
      mapReportStatus(
        okReport({
          status: "ok",
          incomplete_analysis: [{ code: "gap", message: "compat" }],
        })
      )
    ).toBe("incomplete");
    expect(mapReportStatus(okReport({ status: "error", findings: [] }))).toBe("error");
    expect(mapReportStatus(okReport({ status: "timeout", findings: [] }))).toBe("timeout");
  });
});

describe("response helpers", () => {
  it("parsePvimShadowReport accepts a valid report", () => {
    const parsed = parsePvimShadowReport(okReport());
    expect(parsed.ok).toBe(true);
  });

  it("parsePvimShadowReport accepts status incomplete", () => {
    const parsed = parsePvimShadowReport(
      okReport({
        status: "incomplete",
        incomplete_analysis: [{ code: "gap", message: "partial coverage" }],
      })
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.report.status).toBe("incomplete");
    }
  });

  it("toFirewallPvimAnalysis maps invalid_response to error", () => {
    const analysis = toFirewallPvimAnalysis({
      status: "invalid_response",
      message: "bad schema",
      elapsedMs: 5,
    });
    expect(analysis.status).toBe("error");
    expect(analysis.message).toBe("bad schema");
  });

  it("toFirewallPvimFindings keeps findings out of violations shape", () => {
    const findings = toFirewallPvimFindings(okReport());
    expect(findings).toHaveLength(1);
    expect(findings[0]?.source).toBe("pvim");
    expect(findings[0]?.engineSource).toBe("m2");
    expect(findings[0]?.findingId).toContain("m2:");
    // authorization_flaw is explicitly unsupported — never pending, never coerced.
    expect(findings[0]?.remediation).toMatchObject({
      kind: "unsupported",
      code: "unsupported_label",
    });
  });

  it("toFirewallPvimFindings marks confirmed secrets as supported", () => {
    const findings = toFirewallPvimFindings(
      okReport({
        commit_sha: "abcdef0123456789abcdef0123456789abcdef01",
        findings: [
          {
            finding_id: "m1:secret:src/lib/pay.ts:3",
            source: "m1",
            label: "secret_hardcoded",
            message: "Hardcoded API key",
            confidence: "confirmed",
            rule_id: "m1_secret_literal",
            path: "src/lib/pay.ts",
            start_line: 3,
          },
        ],
      })
    );
    expect(findings[0]?.engineSource).toBe("m1");
    expect(findings[0]?.remediation).toEqual({
      kind: "supported",
      category: "SECRET_LEAK",
      requiresScannerAgreement: true,
    });
  });

  it("toFirewallPvimFindings requires use client content for supabase client exposure", () => {
    const finding = {
      finding_id: "m1:sb:src/components/List.tsx:12",
      source: "m1" as const,
      family: "m1",
      label: "supabase_insecure_access",
      message: "Client query",
      confidence: "confirmed",
      rule_id: "m1_supabase_from",
      path: "src/components/List.tsx",
      start_line: 12,
    };
    const report = okReport({
      commit_sha: "abcdef0123456789abcdef0123456789abcdef01",
      findings: [finding],
    });

    const withoutClient = toFirewallPvimFindings(report, {
      contentAtPath: () => 'export function List() { return null }\n',
    });
    expect(withoutClient[0]?.remediation).toMatchObject({
      kind: "unsupported",
      code: "server_side_only",
    });

    const withClient = toFirewallPvimFindings(report, {
      contentAtPath: () => '"use client";\nexport function List() { return null }\n',
    });
    expect(withClient[0]?.remediation).toEqual({
      kind: "supported",
      category: "CLIENT_DB_EXPOSURE",
      requiresScannerAgreement: true,
    });
  });
});

describe("parsePvimShadowReport reasoning", () => {
  const validReasoning = {
    schema_version: PVIM_SHADOW_REASONING_SCHEMA,
    authoritative: false as const,
    may_authorize_remediation: false as const,
    status: "present" as const,
    detail: "validated_advisory",
    provider: "local_double",
    case_id: "unmatched",
    case_selection: "auto:unmatched",
    stop_reason: "evidence_sufficient",
    error: null,
    has_critical_reliability_flags: false,
    critical_reliability_flags: [] as string[],
    advisory: {
      verdict: "advisory_only",
      notes: "Service-role table access looks linked.",
      open_questions: ["Was ownership checked?"],
      investigation: {
        answers: [
          {
            question_id: "gap_service_role",
            answer_text: "Service-role construction observed.",
          },
        ],
      },
    },
  };

  it("accepts reports with missing reasoning", () => {
    const parsed = parsePvimShadowReport(okReport());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.report.reasoning).toBeUndefined();
    expect(parsed.report.findings).toHaveLength(1);
  });

  it("accepts reports with null reasoning", () => {
    const parsed = parsePvimShadowReport({ ...okReport(), reasoning: null });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.report.reasoning).toBeUndefined();
    expect(parsed.report.findings).toHaveLength(1);
  });

  it("retains valid reasoning and extracts display fields", () => {
    const parsed = parsePvimShadowReport({ ...okReport(), reasoning: validReasoning });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.report.reasoning?.schema_version).toBe(PVIM_SHADOW_REASONING_SCHEMA);
    expect(parsed.report.reasoning?.status).toBe("present");
    expect(parsed.report.reasoning?.authoritative).toBe(false);
    expect(parsed.report.reasoning?.may_authorize_remediation).toBe(false);
    expect(parsed.report.findings).toHaveLength(1);

    const display = toFirewallPvimReasoning(parsed.report.reasoning);
    expect(display?.status).toBe("present");
    expect(display?.notes).toMatch(/Service-role/);
    expect(display?.openQuestions).toEqual(["Was ownership checked?"]);
    expect(display?.answerBlurbs?.[0]).toMatch(/gap_service_role/);
  });

  it("discards reasoning when authoritative is not false, keeping findings", () => {
    const parsed = parsePvimShadowReport({
      ...okReport(),
      reasoning: { ...validReasoning, authoritative: true },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.report.reasoning).toBeUndefined();
    expect(parsed.report.findings).toHaveLength(1);
    expect(parsed.report.findings[0]?.rule_id).toBe("m2_p1_request_controlled_owner");
  });

  it("discards reasoning when may_authorize_remediation is not false, keeping findings", () => {
    const parsed = parsePvimShadowReport({
      ...okReport(),
      reasoning: { ...validReasoning, may_authorize_remediation: true },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.report.reasoning).toBeUndefined();
    expect(parsed.report.findings).toHaveLength(1);
  });

  it("discards malformed reasoning without rejecting findings", () => {
    const parsed = parsePvimShadowReport({
      ...okReport(),
      reasoning: { schema_version: "wrong", status: "present" },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.report.reasoning).toBeUndefined();
    expect(parsed.report.findings).toHaveLength(1);
  });

  it("keeps skipped/unavailable/invalid envelope statuses without advisory body", () => {
    for (const status of ["skipped", "unavailable", "invalid"] as const) {
      const parsed = parsePvimShadowReport({
        ...okReport(),
        reasoning: {
          ...validReasoning,
          status,
          detail: `${status}_detail`,
          advisory: { notes: "should be cleared" },
        },
      });
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.report.reasoning?.status).toBe(status);
      expect(parsed.report.reasoning?.advisory).toBeNull();
      const display = toFirewallPvimReasoning(parsed.report.reasoning);
      expect(display?.status).toBe(status);
      expect(display?.notes).toBeUndefined();
      expect(display?.openQuestions).toBeUndefined();
      expect(display?.answerBlurbs).toBeUndefined();
    }
  });
});
