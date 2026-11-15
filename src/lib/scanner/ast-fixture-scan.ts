import {
  runSecuritySuiteScan,
  type SecurityScanFile,
} from "@/lib/scanner/security-suite";
import {
  scanFilesForUseServerSupabaseAuth,
  USE_SERVER_SUPABASE_AUTH_RULE,
} from "@/lib/scanner/use-server-supabase-auth";

/**
 * Normalized AST hit for golden fixture assertions.
 * Merges security-suite findings with the use-server Supabase auth AST rule.
 */
export type AstScanHit = {
  ruleId: string;
  filePath: string;
  line: number;
  message: string;
};

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

/**
 * Run every AST-oriented scanner rule the fixtures exercise and return a
 * stable `{ ruleId, filePath, line, message }` list.
 */
export function runAstFixtureScan(files: readonly SecurityScanFile[]): AstScanHit[] {
  const suiteHits: AstScanHit[] = runSecuritySuiteScan(files).map((finding) => ({
    ruleId: finding.rule,
    filePath: normalizePath(finding.filePath),
    line: finding.line,
    message: finding.message,
  }));

  const useServerHits: AstScanHit[] = scanFilesForUseServerSupabaseAuth(files).map(
    (violation) => ({
      ruleId: violation.ruleId ?? USE_SERVER_SUPABASE_AUTH_RULE,
      filePath: normalizePath(violation.filePath),
      line: violation.line,
      message: violation.message,
    })
  );

  return [...suiteHits, ...useServerHits].sort(
    (left, right) =>
      left.filePath.localeCompare(right.filePath) ||
      left.line - right.line ||
      left.ruleId.localeCompare(right.ruleId)
  );
}

/** Compact key for exact expectation matching. */
export function astHitKey(hit: Pick<AstScanHit, "ruleId" | "filePath" | "line">): string {
  return `${normalizePath(hit.filePath)}:${hit.line}:${hit.ruleId}`;
}
