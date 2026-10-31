import { formatCommitHistoryReason } from "@/lib/commit-history-score";
import { clampScore0to100 } from "@/lib/score-scale";
import {
  scoreTesting,
  type CommitHistoryStat,
} from "@/lib/production-audit-metrics";
import {
  resolveUnitTestFileCount,
  type RepoFilesystemEvidence,
  type ScoreCapAudit,
} from "@/lib/repo-filesystem";
export type { CommitHistoryStat };

export function targetedAuditSuggestions(input: {
  language: string | null;
  testingScore: number;
  testFileCount: number;
  devopsScore: number;
  needsSchemaValidation: boolean;
  needsBuildGate: boolean;
}): string[] {
  const language = input.language?.trim().toLowerCase() ?? "";
  const javascript = /^(typescript|javascript|tsx|jsx)$/i.test(language);
  const suggestions: string[] = [];

  if (input.needsBuildGate && input.devopsScore < 75) {
    if (javascript) {
      suggestions.push(
        "Add a production build step (`next build` or `tsc`) to the CI workflow."
      );
    } else if (language === "go") {
      suggestions.push(
        "Add a CI step that runs `go build ./...` (and ideally `go test ./...`) on pull requests."
      );
    } else if (language === "python" || language === "jupyter notebook") {
      suggestions.push(
        "Add a CI step that runs `pytest` (and ideally `ruff check` or `mypy`) on pull requests."
      );
    } else if (language === "rust") {
      suggestions.push(
        "Add a CI step that runs `cargo check` and `cargo test` on pull requests."
      );
    } else {
      suggestions.push(
        "Add a CI workflow that runs this repository's native lint, test, and build commands on pull requests."
      );
    }
  }
  if (javascript && input.needsSchemaValidation) {
    suggestions.push(
      "Add Zod schema parsing on API route handlers that currently cast JSON with `as Type`."
    );
  }
  if (input.testingScore < 70 && input.testFileCount < 10) {
    suggestions.push(
      javascript
        ? "Expand integration or end-to-end coverage with a TypeScript test such as src/foo.test.ts."
        : language === "go"
          ? "Expand package coverage with a Go test such as foo_test.go using `go test ./...`."
          : language === "python" || language === "jupyter notebook"
            ? "Expand coverage with a pytest module such as tests/test_app.py."
            : language === "rust"
              ? "Expand coverage with a Rust unit/integration test and `cargo test`."
              : "Expand integration or end-to-end coverage with a test file that matches this repository's primary language."
    );
  }

  return suggestions;
}
