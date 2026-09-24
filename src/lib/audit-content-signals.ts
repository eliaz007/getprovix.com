import type { CiPipelineDepth } from "@/lib/repo-filesystem";

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
    /\b((?:npm|pnpm|yarn)(?:\s+run)?\s+test|npx\s+(?:vitest|jest|playwright|cypress)|vitest|jest|playwright|cypress|pytest|go test|cargo test)\b/.test(
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
