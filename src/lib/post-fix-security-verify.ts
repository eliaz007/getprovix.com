import {
  fingerprintSecurityQuery,
  runSecuritySuiteScan,
  type SecurityCategory,
  type SecurityFinding,
  type SecurityScanFile,
} from "@/lib/scanner/security-suite";

export type PostFixVerifyTarget = {
  category: SecurityCategory;
  filePath: string;
  line: number;
  rule?: string;
  message?: string;
  snippet?: string | null;
};

export type PostFixVerifyResult =
  | { ok: true }
  | {
      ok: false;
      reason: "still-present" | "scan-failed";
      message: string;
      residual?: SecurityFinding;
    };

type ScanFn = (files: readonly SecurityScanFile[]) => SecurityFinding[];

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\/+/, "");
}

function normalizeEvidence(text: string): string {
  return fingerprintSecurityQuery(text);
}

function secretLabelFromMessage(message: string | undefined): string | null {
  if (!message) return null;
  const match = /^(.+?) is (?:exposed|committed) in source/i.exec(message.trim());
  return match?.[1]?.trim() || null;
}

function envNameFromTarget(original: PostFixVerifyTarget): string | null {
  const fromMessage = /process\.env\.([A-Z0-9_]+)/.exec(original.message ?? "")?.[1];
  if (fromMessage) return fromMessage;
  return /(?:Move it to|moving it to) ([A-Z0-9_]+)/i.exec(original.message ?? "")?.[1] ?? null;
}

function packageNameFromEvidence(target: {
  snippet?: string | null;
  message?: string;
}): string | null {
  const fromSnippet = /"((?:@[^"/]+\/)?[^"]+)"\s*:/.exec(target.snippet ?? "")?.[1];
  if (fromSnippet) return fromSnippet;
  return (
    /(?:^|\b)((?:@[^/\s]+\/)?[a-z0-9._-]+)\s+(?:below|is deprecated|is an outdated|pulls the entire)/i.exec(
      target.message ?? ""
    )?.[1] ?? null
  );
}

function sameSecretIdentity(original: PostFixVerifyTarget, residual: SecurityFinding): boolean {
  const label = secretLabelFromMessage(original.message);
  if (label && residual.message.includes(label)) return true;

  const left = normalizeEvidence(original.snippet ?? "");
  const right = normalizeEvidence(residual.snippet ?? "");
  if (left.length >= 8 && right.length >= 8) {
    if (left === right || left.includes(right.slice(0, 24)) || right.includes(left.slice(0, 24))) {
      return true;
    }
  }

  const envName = envNameFromTarget(original);
  const residualEnv = residual.remediation?.envExample?.replace(/=$/, "") ?? null;
  if (envName && residualEnv && envName === residualEnv) return true;

  return false;
}

function sameClientQueryIdentity(original: PostFixVerifyTarget, residual: SecurityFinding): boolean {
  const hint = normalizeEvidence(original.snippet ?? "");
  const residualFp = normalizeEvidence(residual.snippet ?? "");

  if (hint.length >= 12) {
    if (residualFp.includes(hint.slice(0, 48)) || hint.includes(residualFp.slice(0, 48))) {
      return true;
    }
    const hintFrom = /from\s*\(\s*'([^']+)'/.exec(hint)?.[1];
    const residualFrom = /from\s*\(\s*'([^']+)'/.exec(residualFp)?.[1];
    if (hintFrom && hintFrom === residualFrom) return true;

    const hintPrisma = /\bprisma\s*\.\s*([a-z0-9_]+)/i.exec(hint)?.[1];
    const residualPrisma = /\bprisma\s*\.\s*([a-z0-9_]+)/i.exec(residualFp)?.[1];
    if (hintPrisma && hintPrisma === residualPrisma) return true;
  }

  // No usable snippet: same path + category fails closed (cannot prove a different finding).
  if (!hint && normalizePath(original.filePath) === residual.filePath) return true;
  return false;
}

function sameDependencyIdentity(original: PostFixVerifyTarget, residual: SecurityFinding): boolean {
  const name = packageNameFromEvidence(original);
  if (!name) {
    return normalizePath(original.filePath) === residual.filePath;
  }
  const lower = name.toLowerCase();
  return (
    residual.snippet.toLowerCase().includes(`"${lower}"`) ||
    residual.message.toLowerCase().includes(lower)
  );
}

/** True when a post-fix residual finding is the same vulnerability as `original`. */
export function findingMatchesOriginal(
  original: PostFixVerifyTarget,
  residual: SecurityFinding
): boolean {
  if (residual.category !== original.category) return false;
  if (original.category === "SECRET_LEAK") return sameSecretIdentity(original, residual);
  if (original.category === "CLIENT_DB_EXPOSURE") return sameClientQueryIdentity(original, residual);
  if (original.category === "VULNERABLE_DEPENDENCY") return sameDependencyIdentity(original, residual);
  if (original.category === "INSECURE_AUTH_SESSION") {
    // Same file + getSession evidence (or residual still naming getSession).
    if (normalizePath(original.filePath) !== residual.filePath) return false;
    const left = normalizeEvidence(original.snippet ?? "");
    const right = normalizeEvidence(residual.snippet ?? "");
    if (left.includes("getsession") || right.includes("getsession")) return true;
    return normalizePath(original.filePath) === residual.filePath;
  }
  return false;
}

/**
 * Rescan the proposed patched file graph and fail closed if the original
 * security finding is still present. Unrelated findings do not block.
 */
export function verifySecurityFixResolved(
  original: PostFixVerifyTarget,
  patchedFiles: readonly SecurityScanFile[],
  options?: { scan?: ScanFn }
): PostFixVerifyResult {
  const scan = options?.scan ?? runSecuritySuiteScan;
  try {
    if (patchedFiles.length === 0) {
      return {
        ok: false,
        reason: "scan-failed",
        message:
          "Post-fix security verification could not run: no patched files were provided. The pull request was not opened.",
      };
    }

    const findings = scan(
      patchedFiles.map((file) => ({
        filePath: normalizePath(file.filePath),
        content: file.content,
      }))
    );

    if (!Array.isArray(findings)) {
      return {
        ok: false,
        reason: "scan-failed",
        message:
          "Post-fix security verification could not complete (invalid scanner result). The pull request was not opened.",
      };
    }

    const residual = findings.find((finding) => findingMatchesOriginal(original, finding));
    if (residual) {
      return {
        ok: false,
        reason: "still-present",
        message: `Post-fix security verification failed: the original ${original.category} finding is still present in the proposed patch (${residual.filePath}:${residual.line}). The pull request was not opened.`,
        residual,
      };
    }

    return { ok: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 200) : "unknown error";
    return {
      ok: false,
      reason: "scan-failed",
      message: `Post-fix security verification could not complete (${detail}). The pull request was not opened.`,
    };
  }
}

/**
 * Capture identifying evidence for the original finding before a patch is applied.
 * Prefers the requested line, then snippet identity, then the first same-category hit.
 */
export function captureOriginalSecurityFinding(
  file: SecurityScanFile,
  category: SecurityCategory,
  line: number,
  hint?: { snippet?: string | null }
): PostFixVerifyTarget {
  const filePath = normalizePath(file.filePath);
  let findings: SecurityFinding[] = [];
  try {
    findings = runSecuritySuiteScan([{ filePath, content: file.content }]).filter(
      (item) => item.category === category && item.filePath === filePath
    );
  } catch {
    return {
      category,
      filePath,
      line,
      snippet: hint?.snippet ?? null,
    };
  }

  const exact = findings.find((item) => item.line === line);
  const bySnippet = hint?.snippet
    ? findings.find((item) =>
        findingMatchesOriginal(
          { category, filePath, line, snippet: hint.snippet, message: item.message },
          item
        )
      )
    : undefined;
  const chosen = exact ?? bySnippet ?? findings[0] ?? null;

  return {
    category,
    filePath,
    line: chosen?.line ?? line,
    rule: chosen?.rule,
    message: chosen?.message,
    snippet: hint?.snippet ?? chosen?.snippet ?? null,
  };
}
