import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DAILY_SCAN_LIMIT,
  incrementDailyScanUsage,
  loadDailyScanUsage,
  resolveDailyScanUsage,
} from "@/lib/daily-scan-limit";
import {
  getSharedAudit,
  isSharedAuditId,
  parseSharedAuditPayload,
} from "@/lib/shared-audit";
import {
  isProfileUuid,
  profileRowLookupKeys,
  uniqueCandidateIds,
} from "@/lib/resolve-candidate-profile";
import {
  fetchPublicJobFeed,
  jobDisplayTags,
  parseJobListInput,
  toJobMatchJobPayload,
} from "@/lib/jobs";
import {
  loadProfileAccountKind,
  loadStoredAccountRole,
} from "@/lib/account-role";
import { emptyProductionAuditMetrics } from "@/lib/production-audit-metrics";
import { emptyScoreCapAudit } from "@/lib/repo-filesystem";

function createProfilesClient(options: {
  selectData?: Record<string, unknown> | null;
  selectError?: { message: string } | null;
  updateError?: { message: string } | null;
  byUserIdData?: Record<string, unknown> | null;
}) {
  const calls: Array<{ table: string; op: string; args: unknown[] }> = [];

  const client = {
    from(table: string) {
      calls.push({ table, op: "from", args: [table] });
      return {
        select(columns: string) {
          calls.push({ table, op: "select", args: [columns] });
          return {
            eq(column: string, value: string) {
              calls.push({ table, op: "eq", args: [column, value] });
              return {
                maybeSingle: async () => {
                  if (column === "user_id") {
                    return {
                      data: options.byUserIdData ?? null,
                      error: options.selectError ?? null,
                    };
                  }
                  return {
                    data: options.selectData ?? null,
                    error: options.selectError ?? null,
                  };
                },
              };
            },
          };
        },
        update(values: Record<string, unknown>) {
          calls.push({ table, op: "update", args: [values] });
          return {
            eq: async (column: string, value: string) => {
              calls.push({ table, op: "eq", args: [column, value] });
              return { error: options.updateError ?? null };
            },
          };
        },
      };
    },
  };

  return { client, calls };
}

function createJobsClient(sequence: Array<{
  data: unknown;
  error: { message: string; code?: string } | null;
}>) {
  let index = 0;
  return {
    from(table: string) {
      expect(table).toBe("jobs");
      return {
        select() {
          return {
            eq() {
              return {
                order() {
                  return {
                    limit: async () => sequence[index++] ?? { data: [], error: null },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(),
}));

describe("database query helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves daily scan usage and resets across UTC days", () => {
    const sameDay = resolveDailyScanUsage(4, "2026-10-02", "2026-10-02");
    expect(sameDay).toEqual({
      daily_scans: 4,
      last_scan_date: "2026-10-02",
      limit_reached: false,
      remaining: DAILY_SCAN_LIMIT - 4,
    });

    const nextDay = resolveDailyScanUsage(10, "2026-10-01", "2026-10-02");
    expect(nextDay.daily_scans).toBe(0);
    expect(nextDay.limit_reached).toBe(false);
    expect(nextDay.remaining).toBe(DAILY_SCAN_LIMIT);

    const capped = resolveDailyScanUsage(10, "2026-10-02", "2026-10-02");
    expect(capped.limit_reached).toBe(true);
    expect(capped.remaining).toBe(0);
  });

  it("loads and increments daily scan counters through profiles queries", async () => {
    const loaded = createProfilesClient({
      selectData: { daily_scans: 2, last_scan_date: "2026-10-02" },
    });
    const usage = await loadDailyScanUsage(
      loaded.client as never,
      "11111111-1111-4111-8111-111111111111"
    );
    expect(usage.error).toBeNull();
    expect(usage.usage.daily_scans).toBe(2);
    expect(loaded.calls.some((call) => call.op === "select")).toBe(true);

    const failing = createProfilesClient({
      selectError: { message: "relation missing" },
    });
    const failed = await loadDailyScanUsage(
      failing.client as never,
      "11111111-1111-4111-8111-111111111111"
    );
    expect(failed.error).toBe("relation missing");
    expect(failed.usage.daily_scans).toBe(0);

    const writer = createProfilesClient({});
    const next = await incrementDailyScanUsage(
      writer.client as never,
      "11111111-1111-4111-8111-111111111111",
      resolveDailyScanUsage(2, "2026-10-02", "2026-10-02")
    );
    expect(next.daily_scans).toBe(3);
    expect(writer.calls.some((call) => call.op === "update")).toBe(true);
  });

  it("parses shared audit payloads and validates UUID ids", async () => {
    const validId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    expect(isSharedAuditId(validId)).toBe(true);
    expect(isSharedAuditId("not-a-uuid")).toBe(false);

    const metrics = emptyProductionAuditMetrics();
    metrics.evidence.inspected = true;
    const parsed = parseSharedAuditPayload(validId, {
      repoName: "acme/widgets",
      repoUrl: "https://github.com/acme/widgets",
      result: {
        score: 72,
        strengths: ["typed source"],
        redFlags: [1, "missing CI"],
        recommendations: ["add workflow"],
        checks: [],
        scoreCap: emptyScoreCapAudit(72),
        metrics,
        filesystem: null,
        commitDates: ["2026-09-01"],
        executiveBrief: {
          employerSummary: "Scoped product bet.",
          developerSummary: "Add CI first.",
          recommendedRoleBand: "Needs Hardening",
        },
      },
    });

    expect(parsed?.repoName).toBe("acme/widgets");
    expect(parsed?.result.score).toBe(72);
    expect(parsed?.result.redFlags).toEqual(["missing CI"]);
    expect(parsed?.result.executiveBrief?.recommendedRoleBand).toBe(
      "Needs Hardening"
    );
    expect(parseSharedAuditPayload(validId, { result: { score: "bad" } })).toBeNull();

    const { createClient } = await import("@/utils/supabase/server");
    vi.mocked(createClient).mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: validId,
                payload: {
                  repoName: "acme/widgets",
                  result: {
                    score: 72,
                    metrics,
                    strengths: [],
                    redFlags: [],
                    recommendations: [],
                    checks: [],
                  },
                },
              },
              error: null,
            }),
          }),
        }),
      }),
    } as never);

    const shared = await getSharedAudit(validId);
    expect(shared?.id).toBe(validId);
    expect(await getSharedAudit("bad-id")).toBeNull();
  });

  it("normalizes profile ids and job feed query results", async () => {
    const id = "22222222-2222-4222-8222-222222222222";
    expect(isProfileUuid(id)).toBe(true);
    expect(isProfileUuid("nope")).toBe(false);
    expect(uniqueCandidateIds([id, id, null, "bad"])).toEqual([id]);
    expect(
      profileRowLookupKeys({
        id,
        user_id: "33333333-3333-4333-8333-333333333333",
      })
    ).toContain(id);

    expect(parseJobListInput(["React", "react", "TypeScript"])).toEqual([
      "React",
      "TypeScript",
    ]);
    expect(
      jobDisplayTags({
        tech_stack: ["Next.js"],
        required_skills: ["TypeScript"],
        tags: ["ignored"],
      })
    ).toEqual(["Next.js", "TypeScript"]);
    expect(
      toJobMatchJobPayload({
        id: "job-1",
        title: "Engineer",
        company: "Acme",
        location: null,
        salary_range: null,
        tags: ["node"],
        tech_stack: ["Node.js"],
        required_skills: [],
        employer_id: id,
        status: "active",
      }).requiredSkills
    ).toEqual(["node"]);

    const jobs = createJobsClient([
      {
        data: [
          {
            id: "job-1",
            title: "Engineer",
            company: "Acme",
            location: null,
            salary_range: null,
            tags: ["node"],
            employer_id: id,
            status: "active",
          },
        ],
        error: null,
      },
    ]);
    const feed = await fetchPublicJobFeed(jobs as never);
    expect(feed.error).toBeNull();
    expect(feed.data).toHaveLength(1);

    const kind = await loadProfileAccountKind(
      createProfilesClient({ selectData: { role: "employer" } }).client,
      id
    );
    expect(kind).toBe("employer");

    const role = await loadStoredAccountRole(
      createProfilesClient({ selectData: { role: "candidate" } }).client,
      { id, user_metadata: {} } as never
    );
    expect(role).toBe("candidate");
  });
});
