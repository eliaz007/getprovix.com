import { describe, expect, it } from "vitest";
import { baseBranchCiBlockMessage } from "@/lib/github-base-ci-gate";

describe("baseBranchCiBlockMessage", () => {
  it("blocks when typecheck / CI checks failed on the base tip", () => {
    const message = baseBranchCiBlockMessage(
      [
        {
          name: "lint-typecheck-test-build",
          status: "completed",
          conclusion: "failure",
        },
      ],
      [],
      "main"
    );
    expect(message).toMatch(/Open Fix refused/);
    expect(message).toMatch(/main/);
    expect(message).toMatch(/lint-typecheck-test-build/);
  });

  it("blocks when Vercel / deploy commit statuses failed", () => {
    const message = baseBranchCiBlockMessage(
      [],
      [{ context: "Vercel – first-ai-app", state: "failure" }],
      "main"
    );
    expect(message).toMatch(/Vercel/);
  });

  it("allows Open Fix when CI checks succeeded", () => {
    expect(
      baseBranchCiBlockMessage(
        [
          {
            name: "lint-typecheck-test-build",
            status: "completed",
            conclusion: "success",
          },
        ],
        [{ context: "Vercel – first-ai-app", state: "success" }],
        "main"
      )
    ).toBeNull();
  });

  it("ignores unrelated or in-progress checks", () => {
    expect(
      baseBranchCiBlockMessage(
        [
          { name: "codecov", status: "completed", conclusion: "failure" },
          { name: "lint-typecheck-test-build", status: "in_progress", conclusion: null },
        ],
        [],
        "main"
      )
    ).toBeNull();
  });
});
