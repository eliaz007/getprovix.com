import { describe, expect, it } from "vitest";
import {
  COMPLIANT_FIXTURES,
  COMPLIANT_SCAN_FILES,
  VULNERABLE_FIXTURES,
  VULNERABLE_SCAN_FILES,
} from "@/lib/scanner/__fixtures__";
import { astHitKey, runAstFixtureScan } from "@/lib/scanner/ast-fixture-scan";

describe("AST scanner golden fixtures", () => {
  describe("vulnerable-patterns.ts", () => {
    it("triggers the exact expected rule ids and line numbers per fixture", () => {
      for (const fixture of VULNERABLE_FIXTURES) {
        const hits = runAstFixtureScan([
          { filePath: fixture.virtualPath, content: fixture.content },
        ]);
        const actualKeys = hits.map((hit) => astHitKey(hit)).sort();
        const expectedKeys = fixture.expected
          .map((item) =>
            astHitKey({
              filePath: fixture.virtualPath,
              line: item.line,
              ruleId: item.ruleId,
            })
          )
          .sort();

        expect(actualKeys, `fixture ${fixture.id}`).toEqual(expectedKeys);
      }
    });

    it("aggregates every expected hit when all vulnerable files are scanned together", () => {
      const hits = runAstFixtureScan(VULNERABLE_SCAN_FILES);
      const actualKeys = hits.map((hit) => astHitKey(hit)).sort();
      const expectedKeys = VULNERABLE_FIXTURES.flatMap((fixture) =>
        fixture.expected.map((item) =>
          astHitKey({
            filePath: fixture.virtualPath,
            line: item.line,
            ruleId: item.ruleId,
          })
        )
      ).sort();

      expect(actualKeys).toEqual(expectedKeys);
    });
  });

  describe("compliant-patterns.ts", () => {
    it("returns 0 violations for each secure counterpart", () => {
      for (const fixture of COMPLIANT_FIXTURES) {
        const hits = runAstFixtureScan([
          { filePath: fixture.virtualPath, content: fixture.content },
        ]);
        expect(hits, `fixture ${fixture.id}`).toEqual([]);
        expect(fixture.expected).toEqual([]);
      }
    });

    it("returns 0 violations when all compliant files are scanned together", () => {
      expect(runAstFixtureScan(COMPLIANT_SCAN_FILES)).toEqual([]);
    });
  });
});
