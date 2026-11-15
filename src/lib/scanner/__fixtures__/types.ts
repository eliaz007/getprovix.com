/**
 * Shared shapes for AST scanner golden fixtures.
 * Contents are virtual source texts scanned under `virtualPath` — not live app modules.
 */

export type AstFixtureExpectation = {
  /** Stable rule id asserted by the fixture test runner. */
  ruleId: string;
  /** 1-based line the scanner must report. */
  line: number;
};

export type AstFixtureCase = {
  /** Stable fixture id for diagnostics. */
  id: string;
  /** Virtual path presented to scanners (App Router / Route Handler layout). */
  virtualPath: string;
  /** Source text to scan. */
  content: string;
  /** Expected hits when scanning this case alone. Empty for compliant fixtures. */
  expected: readonly AstFixtureExpectation[];
};
