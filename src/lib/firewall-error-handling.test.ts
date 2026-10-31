import { describe, expect, it } from "vitest";
import { analyzeSourceTexts } from "../../scripts/ingest-engine";
import { planAutofix } from "@/lib/firewall-autofix";
import { applyErrorHandling, missingErrorHandlingViolations } from "@/lib/firewall-error-handling";

const route = `import { NextResponse } from "next/server";

export async function POST() {
  const rows = await supabase.from("jobs").select("*");
  const page = await fetch("https://example.com/jobs");
  return NextResponse.json({ rows, page });
}

export async function GET() {
  try {
    await fetch("https://example.com/health");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
`;

describe("missing error handling", () => {
  it("flags unprotected database and fetch calls in an API route", () => {
    const violations = missingErrorHandlingViolations("src/app/api/jobs/route.ts", route);
    expect(violations.map((violation) => violation.line)).toEqual([4, 5]);
    expect(violations.every((violation) => violation.rule === "Missing Error Handling" && violation.severity === "HIGH")).toBe(true);
  });

  it("leaves a call that is already inside try/catch alone", () => {
    const wrapped = applyErrorHandling("src/app/api/jobs/route.ts", route);
    expect(wrapped).toContain("try {");
    expect(wrapped).toContain('return NextResponse.json(\n      { ok: false, message: "The request could not be completed." },\n      { status: 500 }\n    ) as unknown as NextResponse<any>;');
    expect(wrapped).not.toContain("}}");
    expect(wrapped).toContain("  }\n}");
    expect(wrapped?.match(/import \{ NextResponse \}/g)).toHaveLength(1);
    expect(missingErrorHandlingViolations("src/app/api/jobs/route.ts", wrapped ?? "")).toEqual([]);
    expect(applyErrorHandling("src/app/api/jobs/route.ts", wrapped ?? "")).toBeNull();
  });

  it("casts the error response through unknown so it matches the route return", () => {
    const source = `import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse<Job[]>> {
  const rows = await supabase.from("jobs").select("*");
  return NextResponse.json(rows);
}

export async function list(): Promise<Job[]> {
  const rows = await supabase.from("jobs").select("*");
  return rows as Job[];
}
`;
    const wrapped = applyErrorHandling("src/app/api/jobs/route.ts", source);
    expect(wrapped).toContain(") as unknown as NextResponse<any>;");
    expect(wrapped).not.toContain(" as NextResponse<Job[]>");
    expect(wrapped).toContain("Promise<NextResponse<Job[]>>");
    expect(wrapped).toContain("Promise<Job[] | NextResponse<any>>");
  });

  it("returns an error object from a server action", () => {
    const source = `"use server";

export const saveJob = async (id: string) => {
  await db.query("update jobs set id = $1", [id]);
};
`;
    const wrapped = applyErrorHandling("src/app/actions/save.ts", source);
    expect(wrapped).toContain('return { ok: false, message: "The request could not be completed." };');
    expect(wrapped).not.toContain("NextResponse");
    expect(missingErrorHandlingViolations("src/app/actions/save.ts", wrapped ?? "")).toEqual([]);
  });

  it("ignores fetch calls in client components", () => {
    const source = `"use client";

export async function load() {
  await fetch("/api/jobs");
}
`;
    expect(missingErrorHandlingViolations("src/components/jobs.tsx", source)).toEqual([]);
    expect(applyErrorHandling("src/components/jobs.tsx", source)).toBeNull();
  });

  it("flags a pages API query and a sql call", () => {
    const source = `export default async function handler() {
  await sql\`select id from jobs\`;
  await pool.query("select id from jobs");
}
`;
    const violations = missingErrorHandlingViolations("pages/api/jobs.ts", source);
    expect(violations).toHaveLength(2);
    const wrapped = applyErrorHandling("pages/api/jobs.ts", source);
    expect(wrapped).toContain("NextResponse.json");
    expect(missingErrorHandlingViolations("pages/api/jobs.ts", wrapped ?? "")).toEqual([]);
  });

  it("shows the violation in a firewall scan and opens an autofix diff", () => {
    const report = analyzeSourceTexts(
      [{ filePath: "src/app/api/jobs/route.ts", content: route }],
      { includeOrphans: false }
    );
    expect(report.violations.some((violation) => violation.rule === "Missing Error Handling")).toBe(true);
    const plan = planAutofix("src/app/api/jobs/route.ts", route);
    expect(plan.canOpenPullRequest).toBe(true);
    expect(plan.writes).toHaveLength(1);
    expect(plan.writes[0]?.content).toContain("catch (error)");
    expect(plan.summary).toContain("try/catch");
  });
});
