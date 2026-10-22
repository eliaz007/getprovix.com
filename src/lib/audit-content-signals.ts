import { isNoisePath, type CiPipelineDepth } from "@/lib/repo-filesystem";

const ASYNC_CALL = /\b(?:fetch\s*\(|axios\.|got\s*\(|ky\s*\()/g;
const TRY_BLOCK = /try\s*\{/g;

function stripNoise(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/`(?:\\.|[^`\\])*`/g, "''")
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, "''");
}

function collectTryCatchBodies(source: string): string[] {
  const bodies: string[] = [];
  TRY_BLOCK.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TRY_BLOCK.exec(source))) {
    let depth = 1;
    let index = match.index + match[0].length;
    const start = index;
    while (index < source.length && depth > 0) {
      const char = source[index];
      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
      }
      index += 1;
    }
    const body = source.slice(start, index - 1);
    const after = source.slice(index, index + 80);
    if (/\bcatch\b/.test(after)) {
      bodies.push(body);
    }
  }

  return bodies;
}

function countAsyncCalls(source: string): number {
  const awaits = source.match(/\bawait\s+/g)?.length ?? 0;
  const fetches = source.match(ASYNC_CALL)?.length ?? 0;
  const awaitedFetches =
    source.match(/\bawait\s+(?:fetch\s*\(|axios\.|got\s*\(|ky\s*\()/g)?.length ??
    0;
  return awaits + fetches - awaitedFetches;
}

/** Count fetch/await/axios calls that sit outside a try/catch. */
export function countUnhandledAsyncCalls(source: string): number {
  const cleaned = stripNoise(source);
  const total = countAsyncCalls(cleaned);
  if (total === 0) {
    return 0;
  }

  const handled = collectTryCatchBodies(cleaned).reduce(
    (sum, body) => sum + countAsyncCalls(body),
    0
  );

  return Math.max(0, total - handled);
}

export type CiGateReport = {
  hasLint: boolean;
  hasTests: boolean;
  hasBuild: boolean;
  hasDeploy: boolean;
  /** turbo/nx task graph or a multi-job pipeline. */
  hasMonorepoPipeline: boolean;
};

const CI_LINT =
  /\b((?:npm|pnpm|yarn|bun)(?:\s+run)?\s+lint|npx\s+eslint|eslint|biome\s+check|turbo\s+(?:run\s+)?(?:[\w@/:-]+\s+)*lint)\b/;
const CI_TESTS =
  /\b((?:npm|pnpm|yarn|bun)(?:\s+run)?\s+test|npx\s+(?:vitest|jest|playwright|cypress)|vitest|jest|playwright|cypress|pytest|go test|cargo test|turbo\s+(?:run\s+)?(?:[\w@/:-]+\s+)*test)\b/;
const CI_BUILD =
  /\b((?:npm|pnpm|yarn|bun)(?:\s+run)?\s+build|next\s+build|npx\s+next\s+build|npx\s+tsc\b|\btsc\b|turbo\s+(?:run\s+)?(?:[\w@/:-]+\s+)*build)\b/;
const CI_DEPLOY =
  /\b(deploy|preview|vercel|netlify|flyctl|wrangler|pulumi|gh-pages)\b|terraform\s+apply|environment:\s*(production|preview)/;
const CI_MONOREPO =
  /\b(turbo\s+(run|build|test|lint)|nx\s+(run|affected|build|test|lint)|pnpm\s+-r)\b/;

/**
 * Lint, test, and production-build steps across ALL inspected workflow bodies.
 * Multi-file pipelines (e.g. lint in ci.yml + tests in e2e.yml) are OR'd together.
 */
export function analyzeCiGates(contents: string[]): CiGateReport {
  const joined = contents.join("\n").toLowerCase();
  return {
    hasLint: CI_LINT.test(joined),
    hasTests: CI_TESTS.test(joined),
    hasBuild: CI_BUILD.test(joined),
    hasDeploy: CI_DEPLOY.test(joined),
    hasMonorepoPipeline: CI_MONOREPO.test(joined),
  };
}

export type RouteContractReport = {
  sampled: boolean;
  schemaValidated: boolean;
  unvalidatedAssertions: number;
  completeContracts: boolean;
};

const ROUTE_HANDLER = /\/api\/.+\/route\.[cm]?[jt]sx?$/i;
const SCHEMA_LIBRARY =
  /\b(z\.(?:object|strictObject|string|number|boolean|array|record|union|discriminatedUnion|enum|instanceof)|safeParse\s*\(|valibot|yup\.|ajv|superstruct)\b/;
const BUILTIN_PARSE =
  /\b(?:JSON|Date|Number|BigInt|path|url|URL|URLSearchParams|querystring|qs|YAML|yaml|Buffer)\s*\.\s*parse\s*\(/g;
const TYPE_ASSERTION = /\bas\s+(?!const\b)[A-Z][A-Za-z0-9_]*/g;

/** Zod `.parse` / `.safeParse`, schema libraries, or equivalent guards. Not `JSON.parse`. */
function hasRuntimeSchemaValidation(source: string): boolean {
  const cleaned = stripNoise(source);
  if (SCHEMA_LIBRARY.test(cleaned)) {
    return true;
  }
  BUILTIN_PARSE.lastIndex = 0;
  const withoutBuiltin = cleaned.replace(BUILTIN_PARSE, " ");
  return /\.\s*parse\s*\(/.test(withoutBuiltin);
}

/** Route handlers need runtime schema parsing, not `as Type` casts. */
export function analyzeRouteContracts(
  files: Array<{ path: string; text: string }>
): RouteContractReport {
  const routes = files.filter((file) => ROUTE_HANDLER.test(file.path));
  if (routes.length === 0) {
    return {
      sampled: false,
      schemaValidated: false,
      unvalidatedAssertions: 0,
      completeContracts: false,
    };
  }

  let unvalidatedAssertions = 0;
  let schemaRoutes = 0;
  let cleanSchemaRoutes = 0;
  for (const route of routes) {
    const cleaned = stripNoise(route.text);
    const hasSchema = hasRuntimeSchemaValidation(route.text);
    TYPE_ASSERTION.lastIndex = 0;
    const assertions = cleaned.match(TYPE_ASSERTION)?.length ?? 0;
    unvalidatedAssertions += assertions;
    if (hasSchema) {
      schemaRoutes += 1;
    }
    if (hasSchema && assertions === 0) {
      cleanSchemaRoutes += 1;
    }
  }

  const schemaValidated = schemaRoutes === routes.length;
  const completeContracts =
    cleanSchemaRoutes === routes.length && unvalidatedAssertions === 0;

  return {
    sampled: true,
    schemaValidated,
    unvalidatedAssertions,
    completeContracts,
  };
}

const SAMPLED_UNIT_TEST = /\.(?:test|spec)\.[cm]?[jt]sx?$/i;
const ASSERTION_CALL =
  /\b(?:expect|assert(?:Equal|Equals|StrictEqual|DeepEqual|DeepStrictEqual|NotEqual|NotStrictEqual)?)\s*(?:\.\s*[A-Za-z_]\w*\s*)?\(/g;
const TAUTOLOGICAL_EXPECT =
  /\bexpect\s*(?:\.\s*[A-Za-z_]\w*\s*)?\(\s*([^()\n]+?)\s*\)\s*\.\s*(toBeTruthy|toBeFalsy|toStrictEqual|toEqual|toBe)\s*\(\s*([^()\n]*?)\s*\)/g;
const TAUTOLOGICAL_ASSERT =
  /\bassert\s*(?:\.\s*(deepStrictEqual|strictEqual|deepEqual|equal|ok)\s*)?\(\s*([^()\n]+?)\s*(?:,\s*([^()\n]+?)\s*)?\)/g;

export type TestContentReport = {
  assertionCount: number;
  tautologicalCount: number;
  genuineAssertionCount: number;
  hollow: boolean;
};

/** `*.test.ts` / `*.spec.ts` (and js/tsx twins), excluding vendor and demo trees. */
export function isSampledUnitTestPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").trim();
  if (!normalized || isNoisePath(normalized)) {
    return false;
  }
  return SAMPLED_UNIT_TEST.test(normalized);
}

/**
 * Spread samples across the tree so one stub directory does not hide real suites.
 */
export function preferTestSamplePaths(paths: string[], limit = 6): string[] {
  const eligible = [
    ...new Set(paths.map((path) => path.replace(/\\/g, "/").trim()).filter(Boolean)),
  ]
    .filter(isSampledUnitTestPath)
    .sort((left, right) => left.localeCompare(right));
  const budget = Math.max(0, limit);
  if (eligible.length <= budget) {
    return eligible;
  }

  const picked: string[] = [];
  for (let index = 0; index < budget; index += 1) {
    picked.push(eligible[Math.floor((index * eligible.length) / budget)]!);
  }
  return picked;
}

function readLiteral(raw: string): { kind: string; value: string } | null {
  const value = raw.trim();
  if (value === "true" || value === "false") {
    return { kind: "bool", value };
  }
  if (value === "null") {
    return { kind: "null", value };
  }
  if (value === "undefined") {
    return { kind: "undef", value };
  }
  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    return { kind: "num", value: String(Number(value)) };
  }
  return null;
}

function sameLiteral(
  left: { kind: string; value: string } | null,
  right: { kind: string; value: string } | null
): boolean {
  return Boolean(left && right && left.kind === right.kind && left.value === right.value);
}

function countTautologicalAssertions(source: string): number {
  let count = 0;
  TAUTOLOGICAL_EXPECT.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAUTOLOGICAL_EXPECT.exec(source))) {
    const actual = readLiteral(match[1] ?? "");
    const matcher = match[2];
    if (matcher === "toBeTruthy" && actual?.value === "true") {
      count += 1;
      continue;
    }
    if (matcher === "toBeFalsy" && actual?.value === "false") {
      count += 1;
      continue;
    }
    if (
      (matcher === "toBe" || matcher === "toEqual" || matcher === "toStrictEqual") &&
      sameLiteral(actual, readLiteral(match[3] ?? ""))
    ) {
      count += 1;
    }
  }

  TAUTOLOGICAL_ASSERT.lastIndex = 0;
  while ((match = TAUTOLOGICAL_ASSERT.exec(source))) {
    const method = match[1];
    const left = readLiteral(match[2] ?? "");
    const right = match[3] !== undefined ? readLiteral(match[3]) : null;
    if (!method || method === "ok") {
      if (left?.value === "true" || (left?.kind === "num" && left.value === "1")) {
        count += 1;
      }
      continue;
    }
    if (sameLiteral(left, right)) {
      count += 1;
    }
  }

  return count;
}

/**
 * Hollow when the file has no executable assertions, or every assertion is a
 * tautology such as `expect(true).toBe(true)` / `expect(1).toBe(1)`.
 * A single genuine assertion keeps the file out of the hollow bucket.
 */
export function analyzeTestFileContent(source: string): TestContentReport {
  const cleaned = stripNoise(source);
  ASSERTION_CALL.lastIndex = 0;
  const assertionCount = cleaned.match(ASSERTION_CALL)?.length ?? 0;
  const tautologicalCount = Math.min(
    assertionCount,
    countTautologicalAssertions(cleaned)
  );
  const genuineAssertionCount = Math.max(0, assertionCount - tautologicalCount);
  return {
    assertionCount,
    tautologicalCount,
    genuineAssertionCount,
    hollow: assertionCount === 0 || genuineAssertionCount === 0,
  };
}

export function summarizeSampledTests(
  files: Array<{ path: string; text: string }>
): { sampled: number; hollow: number; mostlyHollow: boolean } {
  const tests = files.filter((file) => isSampledUnitTestPath(file.path));
  if (tests.length === 0) {
    return { sampled: 0, hollow: 0, mostlyHollow: false };
  }

  let hollow = 0;
  for (const file of tests) {
    if (analyzeTestFileContent(file.text).hollow) {
      hollow += 1;
    }
  }

  return {
    sampled: tests.length,
    hollow,
    mostlyHollow: hollow / tests.length >= 0.5,
  };
}

export function analyzeWorkflowDepth(contents: string[]): CiPipelineDepth {
  if (contents.length === 0) {
    return "none";
  }

  const joined = contents.join("\n").toLowerCase();
  const hasDeploy =
    /\b(deploy|preview|vercel|netlify|flyctl|wrangler|pulumi|gh-pages)\b/.test(
      joined
    ) ||
    /terraform\s+apply/.test(joined) ||
    /environment:\s*(production|preview)/.test(joined);
  const hasTests =
    /\b((?:npm|pnpm|yarn|bun)(?:\s+run)?\s+test|npx\s+(?:vitest|jest|playwright|cypress)|vitest|jest|playwright|cypress|pytest|go test|cargo test|turbo\s+(?:run\s+)?(?:[\w@/:-]+\s+)*test)\b/.test(
      joined
    );

  if (hasDeploy) {
    return "deploy";
  }
  if (hasTests) {
    return "tests";
  }
  return "lint_build";
}

export function preferSourceSamplePaths(paths: string[], limit = 6): string[] {
  const scored = paths.map((path) => {
    let score = 0;
    if (/(^|\/)(api|route|server|actions)\//i.test(path)) {
      score += 4;
    }
    if (/(route|handler|client|fetch|request)\.[cm]?[jt]sx?$/i.test(path)) {
      score += 3;
    }
    if (/(^|\/)(lib|utils|services)\//i.test(path)) {
      score += 2;
    }
    return { path, score };
  });

  return scored
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .slice(0, limit)
    .map((item) => item.path);
}

/** Real pre-merge gates — prefer these when sampling workflow YAML. */
const WORKFLOW_CI_SIGNAL =
  /(^|[\/._-])(ci|test|tests|e2e|build|lint|check|typecheck|unit|integration|verify|quality|coverage|playwright|cypress|vitest|jest)([\/._-]|$)/i;

/** Bot/chore automation that should not crowd out CI samples. */
const WORKFLOW_CHORE_SIGNAL =
  /(label|labels|stale|assign|greet|greeting|triage|issue|issues|pr-title|comment|lock|welcome|congratulate|semantic|dependabot|codeql|scorecard|changelog|release-please|autofix|size-limit|license|cla)\b/i;

function workflowBasename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

/** Higher = more likely to encode lint/test/build gates. */
export function rankCiWorkflowPath(path: string): number {
  const base = workflowBasename(path);
  let score = 0;

  if (WORKFLOW_CI_SIGNAL.test(base) || WORKFLOW_CI_SIGNAL.test(path)) {
    score += 10;
  }
  if (/(^|[\/._-])ci([\/._-]|$)/i.test(base)) {
    score += 4;
  }
  if (/test/i.test(base)) {
    score += 3;
  }
  if (/e2e|playwright|cypress/i.test(base)) {
    score += 3;
  }
  if (/build|lint|check|typecheck/i.test(base)) {
    score += 2;
  }
  if (/deploy|preview|release/i.test(base)) {
    score += 1;
  }
  if (WORKFLOW_CHORE_SIGNAL.test(base)) {
    score -= 12;
  }

  return score;
}

/**
 * Prefer CI-shaped workflow filenames (ci, test, e2e, build, lint, check)
 * over bot/chore automation before applying the fetch budget.
 */
export function preferWorkflowSamplePaths(
  paths: string[],
  limit = 10
): string[] {
  return [...paths]
    .sort(
      (left, right) =>
        rankCiWorkflowPath(right) - rankCiWorkflowPath(left) ||
        left.localeCompare(right)
    )
    .slice(0, Math.max(0, limit));
}

/** Best path to cite in DevOps explanations — not tree-order `[0]`. */
export function selectPrimaryCiWorkflowPath(
  paths: string[] | null | undefined
): string | null {
  if (!paths?.length) {
    return null;
  }
  return preferWorkflowSamplePaths(paths, 1)[0] ?? null;
}
