export type SecurityCategory = "SECRET_LEAK" | "CLIENT_DB_EXPOSURE" | "VULNERABLE_DEPENDENCY";

export type SecuritySeverity = "CRITICAL" | "HIGH" | "MEDIUM";

export type SecurityRemediation = {
  diff: string;
  command?: string;
  envExample?: string;
};

export type SecurityFinding = {
  filePath: string;
  severity: SecuritySeverity;
  rule: string;
  message: string;
  line: number;
  category: SecurityCategory;
  snippet: string;
  remediation: SecurityRemediation;
};

export type SecurityScanFile = {
  filePath: string;
  content: string;
};

type Semver = [number, number, number];

type SecretRule = {
  label: string;
  envName: string;
  pattern: RegExp;
};

export type SecretRuleCatalogEntry = {
  id: string;
  label: string;
  envName: string;
  pattern: string;
};

const SECRET_RULES: readonly SecretRule[] = [
  {
    label: "Supabase service-role JWT",
    envName: "SUPABASE_SERVICE_ROLE_KEY",
    pattern: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+/g,
  },
  {
    label: "Supabase secret",
    envName: "SUPABASE_SERVICE_ROLE_KEY",
    pattern: /sbp_[a-zA-Z0-9]{30,}/g,
  },
  {
    label: "Stripe live secret key",
    envName: "STRIPE_SECRET_KEY",
    pattern: /sk_live_[0-9a-zA-Z]{24,}/g,
  },
  {
    label: "OpenAI API key",
    envName: "OPENAI_API_KEY",
    pattern: /sk-proj-[a-zA-Z0-9\-_]{20,}/g,
  },
  {
    label: "Anthropic API key",
    envName: "ANTHROPIC_API_KEY",
    pattern: /sk-ant-[a-zA-Z0-9\-_]{20,}/g,
  },
  {
    label: "AWS access key",
    envName: "AWS_ACCESS_KEY_ID",
    pattern: /AKIA[0-9A-Z]{16}/g,
  },
];

export const SECRET_RULE_CATALOG: readonly SecretRuleCatalogEntry[] = SECRET_RULES.map((rule) => ({
  id: rule.label,
  label: rule.label,
  envName: rule.envName,
  pattern: rule.pattern.source,
}));

type DepFloor = {
  name: string;
  safe: Semver;
  severity: SecuritySeverity;
  reason: string;
};

const DEPENDENCY_FLOORS: readonly DepFloor[] = [
  {
    name: "jsonwebtoken",
    safe: [9, 0, 0],
    severity: "HIGH",
    reason: "jsonwebtoken below 9.0.0 accepts unsafe key types.",
  },
  {
    name: "axios",
    safe: [1, 6, 0],
    severity: "HIGH",
    reason: "axios below 1.6.0 is missing SSRF and header-injection fixes.",
  },
  {
    name: "lodash",
    safe: [4, 17, 21],
    severity: "HIGH",
    reason: "lodash below 4.17.21 is affected by prototype pollution.",
  },
  {
    name: "node-fetch",
    safe: [2, 6, 7],
    severity: "HIGH",
    reason: "node-fetch below 2.6.7 forwards sensitive headers on redirect.",
  },
];

const NEXT_FLOORS: Readonly<Record<number, Semver>> = {
  12: [12, 3, 5],
  13: [13, 5, 9],
  14: [14, 2, 25],
  15: [15, 2, 3],
};

const DEPRECATED_PACKAGES: readonly { name: string; message: string; command: string }[] = [
  {
    name: "request",
    message: "request is deprecated and unmaintained.",
    command: "npm uninstall request",
  },
  {
    name: "moment",
    message: "moment is a deprecated, full-library date import.",
    command: "npm uninstall moment",
  },
  {
    name: "node-uuid",
    message: "node-uuid is deprecated.",
    command: "npm uninstall node-uuid",
  },
];

const CLIENT_PATTERNS: readonly { kind: "supabase" | "prisma" | "drizzle" | "sql"; pattern: RegExp }[] = [
  {
    kind: "supabase",
    pattern:
      /supabase\s*\.\s*from\s*\(\s*(['"`])[^'"`]+\1\s*\)\s*\.\s*(?:select|insert|update|delete|upsert)\b/g,
  },
  {
    kind: "prisma",
    pattern: /\bprisma(?:\s*\.\s*[A-Za-z_$][\w$]*)+/g,
  },
  {
    kind: "drizzle",
    pattern: /\bdb\s*\.\s*(?:select|insert|update|delete|execute|transaction|query)\s*\([\s\S]*?\)/g,
  },
  {
    kind: "sql",
    pattern: /\bsql\s*`[^`]*`|\b(?:pool|client)\s*\.\s*(?:query|execute)\s*\([\s\S]*?\)/g,
  },
];

const BLOAT_IMPORTS: readonly { packageName: string; pattern: RegExp; replacement: string }[] = [
  {
    packageName: "lodash",
    pattern: /import\s+(?:\*\s+as\s+\w+|\w+|\{[^}]+\})\s+from\s+(['"])lodash\1/g,
    replacement: 'import debounce from "lodash/debounce"',
  },
  {
    packageName: "moment",
    pattern: /import\s+(?:\*\s+as\s+\w+|\w+|\{[^}]+\})\s+from\s+(['"])moment\1/g,
    replacement: 'import { format } from "date-fns"',
  },
];

function normalizedPath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function baseName(filePath: string): string {
  const parts = normalizedPath(filePath).split("/");
  return parts[parts.length - 1] ?? filePath;
}

function ignoredPath(filePath: string): boolean {
  return normalizedPath(filePath)
    .split("/")
    .some((part) => part === "node_modules" || part === ".next" || part === "dist" || part === "build");
}

function isEnvFile(filePath: string): boolean {
  const name = baseName(filePath);
  return name === ".env" || name.startsWith(".env.");
}

function isCodeFile(filePath: string): boolean {
  return /\.(?:ts|tsx|js|jsx)$/.test(baseName(filePath));
}

/** Vitest/Jest suites often embed example imports in strings — those are not app deps. */
function isTestSourceFile(filePath: string): boolean {
  const normalized = normalizedPath(filePath).replace(/^\/+/, "");
  const name = baseName(normalized);
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(name)) return true;
  return normalized.split("/").some((part) => part === "__tests__" || part === "__mocks__" || part === "tests");
}

/** Blank string/template interiors (keep quotes + newlines) so fixture text cannot match import rules. */
function maskCodeCommentsAndStrings(source: string): string {
  let out = "";
  let quote: "'" | '"' | "`" | null = null;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index] ?? "";
    const next = source[index + 1] ?? "";

    if (lineComment) {
      if (char === "\n") {
        lineComment = false;
        out += "\n";
      } else {
        out += " ";
      }
      continue;
    }

    if (blockComment) {
      if (char === "*" && next === "/") {
        out += "  ";
        index += 1;
        blockComment = false;
      } else {
        out += char === "\n" ? "\n" : " ";
      }
      continue;
    }

    if (quote) {
      if (char === "\\") {
        out += "  ";
        index += 1;
        continue;
      }
      if (char === quote) {
        out += char;
        quote = null;
        continue;
      }
      // Keep template expression boundaries scannable without matching imports inside strings.
      if (quote === "`" && char === "$" && next === "{") {
        out += "${";
        index += 1;
        continue;
      }
      out += char === "\n" ? "\n" : " ";
      continue;
    }

    if (char === "/" && next === "/") {
      out += "  ";
      index += 1;
      lineComment = true;
      continue;
    }
    if (char === "/" && next === "*") {
      out += "  ";
      index += 1;
      blockComment = true;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      out += char;
      continue;
    }
    out += char;
  }

  return out;
}

function isSecretFile(filePath: string): boolean {
  if (ignoredPath(filePath)) return false;
  const name = baseName(filePath);
  if (name === "package-lock.json" || name === "npm-shrinkwrap.json") return false;
  if (isCodeFile(filePath) || isEnvFile(filePath)) return true;
  return name.endsWith(".json");
}

function lineAt(source: string, index: number): number {
  let line = 1;
  const end = Math.min(index, source.length);
  for (let cursor = 0; cursor < end; cursor += 1) {
    if (source.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}

function lineText(source: string, line: number): string {
  return source.split(/\r?\n/)[line - 1] ?? "";
}

function redact(secret: string): string {
  const tail = secret.slice(-4);
  if (secret.startsWith("sk_live_")) return `sk_live_...${tail}`;
  if (secret.startsWith("sk-proj-")) return `sk-proj-...${tail}`;
  if (secret.startsWith("sk-ant-")) return `sk-ant-...${tail}`;
  if (secret.startsWith("sbp_")) return `sbp_...${tail}`;
  if (secret.startsWith("AKIA")) return `AKIA...${tail}`;
  if (secret.startsWith("eyJ")) return `eyJ...${tail}`;
  return `${secret.slice(0, 4)}...${tail}`;
}

function maskCodeComments(source: string): string {
  let out = "";
  let quote: "'" | '"' | "`" | null = null;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index] ?? "";
    const next = source[index + 1] ?? "";

    if (lineComment) {
      if (char === "\n") {
        lineComment = false;
        out += "\n";
      } else {
        out += " ";
      }
      continue;
    }

    if (blockComment) {
      if (char === "*" && next === "/") {
        out += "  ";
        index += 1;
        blockComment = false;
      } else {
        out += char === "\n" ? "\n" : " ";
      }
      continue;
    }

    if (quote) {
      out += char;
      if (char === "\\") {
        out += next;
        index += 1;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }

    if (char === "/" && next === "/") {
      out += "  ";
      index += 1;
      lineComment = true;
      continue;
    }
    if (char === "/" && next === "*") {
      out += "  ";
      index += 1;
      blockComment = true;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      out += char;
      continue;
    }
    out += char;
  }

  return out;
}

function maskForScan(filePath: string, content: string): string {
  if (isEnvFile(filePath)) {
    return content
      .split("\n")
      .map((line) => (line.trimStart().startsWith("#") ? " ".repeat(line.length) : line))
      .join("\n");
  }
  if (isCodeFile(filePath)) return maskCodeComments(content);
  return content;
}

function formatVersion(version: Semver): string {
  return `${version[0]}.${version[1]}.${version[2]}`;
}

function parseVersion(spec: string): Semver | null {
  const match = spec.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersion(left: Semver, right: Semver): number {
  for (let index = 0; index < 3; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function envNameOnLine(line: string, fallback: string): string {
  const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
  return match?.[1] ?? fallback;
}

function replaceLiteral(line: string, secret: string, envName: string, filePath: string): string {
  if (isEnvFile(filePath)) {
    return line.replace(secret, "");
  }
  const replacement = `process.env.${envName}`;
  if (line.includes(`"${secret}"`)) return line.replace(`"${secret}"`, replacement);
  if (line.includes(`'${secret}'`)) return line.replace(`'${secret}'`, replacement);
  if (line.includes(`\`${secret}\``)) return line.replace(`\`${secret}\``, replacement);
  if (filePath.endsWith(".json")) return line.replace(secret, replacement);
  return line.replace(secret, replacement);
}

function unifiedLine(filePath: string, line: number, before: string, after: string, extra = ""): string {
  return [
    `--- a/${normalizedPath(filePath)}`,
    `+++ b/${normalizedPath(filePath)}`,
    `@@ -${line},1 +${line},1 @@`,
    `-${before}`,
    `+${after}`,
    extra,
  ]
    .filter((part) => part.length > 0)
    .join("\n");
}

function scanSecrets(file: SecurityScanFile): SecurityFinding[] {
  const filePath = normalizedPath(file.filePath);
  if (!isSecretFile(filePath) || file.content.includes("\u0000")) return [];

  const masked = maskForScan(filePath, file.content);
  const findings: SecurityFinding[] = [];

  for (const rule of SECRET_RULES) {
    const matcher = new RegExp(rule.pattern.source, "g");
    for (const match of masked.matchAll(matcher)) {
      const secret = match[0];
      const index = match.index ?? 0;
      if (!secret || masked.slice(index, index + secret.length) !== secret) continue;
      const line = lineAt(file.content, index);
      const originalLine = lineText(file.content, line);
      const envName = isEnvFile(filePath) ? envNameOnLine(originalLine, rule.envName) : rule.envName;
      const redactedLine = originalLine.replace(secret, redact(secret));
      const patchedLine = replaceLiteral(originalLine, secret, envName, filePath);
      const envExample = `${envName}=`;
      const exampleDiff = isEnvFile(filePath)
        ? ""
        : ["--- /dev/null", "+++ b/.env.example", "@@ -0,0 +1 @@", `+${envExample}`].join("\n");

      findings.push({
        filePath,
        severity: "CRITICAL",
        rule: "Hardcoded Secret",
        category: "SECRET_LEAK",
        line,
        message: `${rule.label} is committed in source. Move it to ${envName}.`,
        snippet: redactedLine.trim().slice(0, 180),
        remediation: {
          diff: unifiedLine(filePath, line, redactedLine, patchedLine, exampleDiff),
          envExample,
          command: `Add ${envName} to the deployment environment.`,
        },
      });
    }
  }

  return findings;
}

function hasUseClient(content: string): boolean {
  const head = content.replace(/^\uFEFF/, "").slice(0, 800);
  return /^\s*(?:(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)\s*)*['"]use client['"]/.test(head);
}

function actionName(line: number): string {
  return line === 1 ? "secureQuery" : `secureQuery${line}`;
}

const SECURE_QUERY_IMPORT = "@/app/actions/secure-query";
const SECURE_QUERY_RELATIVE = "app/actions/secure-query.ts";
export const SUPABASE_SERVER_IMPORT = "@/utils/supabase/server";
const SUPABASE_SERVER_RELATIVE = "utils/supabase/server.ts";

/** Portable Next.js App Router Supabase server client — bundled when the target repo lacks it. */
export const SUPABASE_SERVER_HELPER = `import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieToSet = { name: string; value: string; options?: object };

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component without mutable cookies.
          }
        },
      },
    }
  );
}
`;

type ScaffoldableHelper = {
  importModule: string;
  /** Path under the `@/` root (no `src/` prefix). */
  relativePath: string;
  content: string;
};

const SCAFFOLDABLE_HELPERS: readonly ScaffoldableHelper[] = [
  {
    importModule: SUPABASE_SERVER_IMPORT,
    relativePath: SUPABASE_SERVER_RELATIVE,
    content: SUPABASE_SERVER_HELPER,
  },
  // Some vibe-coded apps place the helper here — same createClient contract.
  {
    importModule: "@/lib/supabase/server",
    relativePath: "lib/supabase/server.ts",
    content: SUPABASE_SERVER_HELPER,
  },
];

export type SecurityFixLayout = {
  /** Destination path written into the Git tree. */
  serverActionPath: string;
  /** Module specifier used by the patched client import. */
  importModule: string;
};

/** Place the action under `src/` when the client file already lives there. */
export function serverActionFilePath(clientFilePath: string): string {
  const normalized = normalizedPath(clientFilePath).replace(/^\/+/, "");
  return normalized === "src" || normalized.startsWith("src/")
    ? `src/${SECURE_QUERY_RELATIVE}`
    : SECURE_QUERY_RELATIVE;
}

export function isServerActionFilePath(filePath: string): boolean {
  const normalized = normalizedPath(filePath).replace(/^\/+/, "");
  return normalized === SECURE_QUERY_RELATIVE || normalized === `src/${SECURE_QUERY_RELATIVE}`;
}

/**
 * Read `@/*` (or baseUrl) from a tsconfig/jsconfig body.
 * Returns `src` when aliases resolve under `./src`, `root` when they resolve at `.`.
 */
export function detectAtAliasRoot(tsconfigText: string): "src" | "root" | null {
  const pathMatch = tsconfigText.match(/["']@\/\*["']\s*:\s*\[\s*["']([^"']+)["']/);
  if (pathMatch?.[1]) {
    const target = pathMatch[1].replace(/\\/g, "/").replace(/^\.\//, "");
    if (target === "src/*" || target === "src/**" || /^src\/\*$/.test(target)) return "src";
    if (target === "*" || target === "./*" || target === "**") return "root";
    if (target === "src" || target.startsWith("src/")) return "src";
    return null;
  }

  const baseMatch = tsconfigText.match(/["']baseUrl["']\s*:\s*["']([^"']+)["']/);
  if (!baseMatch?.[1]) return null;
  const baseUrl = baseMatch[1].replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
  if (baseUrl === "src") return "src";
  if (baseUrl === "." || baseUrl === "") return "root";
  return null;
}

/** Prefer tsconfig `@/*` mapping; fall back to the client file's `src/` prefix. */
export function resolveSecurityFixLayout(options: {
  clientFilePath: string;
  tsconfigContents?: readonly (string | null | undefined)[];
}): SecurityFixLayout {
  for (const text of options.tsconfigContents ?? []) {
    if (typeof text !== "string" || !text.trim()) continue;
    const alias = detectAtAliasRoot(text);
    if (alias === "src") {
      return { serverActionPath: `src/${SECURE_QUERY_RELATIVE}`, importModule: SECURE_QUERY_IMPORT };
    }
    if (alias === "root") {
      return { serverActionPath: SECURE_QUERY_RELATIVE, importModule: SECURE_QUERY_IMPORT };
    }
  }

  return {
    serverActionPath: serverActionFilePath(options.clientFilePath),
    importModule: SECURE_QUERY_IMPORT,
  };
}

function secureQueryImport(name: string, importModule = SECURE_QUERY_IMPORT): string {
  return `import { ${name} } from "${importModule}";`;
}

/** True when `text` is a finished `import …` statement (handles multiline `{ … }`). */
function isCompleteImportStatement(text: string): boolean {
  if (!/^\s*import\b/.test(text)) return false;
  let depth = 0;
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === '"' || char === "'" || char === "`") {
      index = skipStringLiteral(text, index);
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    index += 1;
  }
  if (depth !== 0) return false;
  const trimmed = text.replace(/\s+$/u, "");
  if (/;\s*$/u.test(trimmed)) return true;
  // ASI: side-effect import or `from "module"` with balanced braces.
  if (/^import\s+["'][^"']+["']\s*$/u.test(trimmed.trim())) return true;
  return /\bfrom\s+["'][^"']+["']\s*$/u.test(trimmed);
}

/**
 * Index of the line after the import statement that starts at `start`
 * (so callers can splice after the closing `}` / `from` / `;` line).
 */
function importStatementEndLine(lines: readonly string[], start: number): number {
  let buf = "";
  for (let index = start; index < lines.length; index += 1) {
    buf += `${index === start ? "" : "\n"}${lines[index] ?? ""}`;
    if (isCompleteImportStatement(buf)) return index + 1;
  }
  return Math.min(start + 1, lines.length);
}

/** Insert or merge a named `secureQuery*` import without duplicating the module line. */
export function ensureSecureQueryNamedImport(
  source: string,
  name: string,
  importModule = SECURE_QUERY_IMPORT
): string {
  const escapedModule = importModule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const existing = new RegExp(
    `import\\s*\\{([^}]*)\\}\\s*from\\s*["']${escapedModule}["']\\s*;?`
  ).exec(source);
  if (existing) {
    const names = (existing[1] ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (names.includes(name)) return source;
    const merged = `import { ${[...names, name].join(", ")} } from "${importModule}";`;
    return `${source.slice(0, existing.index)}${merged}${source.slice(existing.index + existing[0].length)}`;
  }

  const line = secureQueryImport(name, importModule);
  const lines = source.split("\n");
  let insertAt = 0;
  for (let cursor = 0; cursor < Math.min(lines.length, 40); cursor += 1) {
    if (/['"]use client['"]/.test(lines[cursor] ?? "")) {
      insertAt = cursor + 1;
      break;
    }
  }
  // Prefer sitting after the full import block (not inside multiline `import {`).
  for (let cursor = insertAt; cursor < Math.min(lines.length, 120); ) {
    const current = lines[cursor] ?? "";
    if (/^\s*import\b/.test(current)) {
      insertAt = importStatementEndLine(lines, cursor);
      cursor = insertAt;
      continue;
    }
    if (/^\s*$/.test(current)) {
      cursor += 1;
      continue;
    }
    break;
  }
  lines.splice(insertAt, 0, line);
  return lines.join("\n");
}

/**
 * Generation rules for server-action / patch output (CI enforces
 * `@typescript-eslint/no-explicit-any`):
 * - NEVER emit explicit `any` or `as any` / unnecessary casts in generated code.
 * - Do NOT widen return `data` to `unknown` — omit an explicit return type so
 *   TypeScript can infer from the Supabase query (call sites still Zod/narrow).
 * - Prefer concrete / generic types over `any` / blanket `unknown` wrappers.
 */

/** True when the `@/*` alias resolves under `./src`. */
export function layoutUsesSrcAlias(layout?: SecurityFixLayout | null): boolean {
  if (layout?.serverActionPath) {
    return normalizedPath(layout.serverActionPath).replace(/^\/+/, "").startsWith("src/");
  }
  return true;
}

export function helperFilePathForImport(
  importModule: string,
  layout?: SecurityFixLayout | null
): string | null {
  const helper = SCAFFOLDABLE_HELPERS.find((entry) => entry.importModule === importModule);
  if (!helper) return null;
  return layoutUsesSrcAlias(layout) ? `src/${helper.relativePath}` : helper.relativePath;
}

export function isSupportingHelperPath(filePath: string): boolean {
  const normalized = normalizedPath(filePath).replace(/^\/+/, "");
  return SCAFFOLDABLE_HELPERS.some(
    (helper) =>
      normalized === helper.relativePath || normalized === `src/${helper.relativePath}`
  );
}

export function collectAtImportModules(content: string): string[] {
  const modules: string[] = [];
  const seen = new Set<string>();
  for (const match of content.matchAll(/\bfrom\s+["'](@\/[^"']+)["']/g)) {
    const moduleName = match[1];
    if (!moduleName || seen.has(moduleName)) continue;
    seen.add(moduleName);
    modules.push(moduleName);
  }
  return modules;
}

/** Scaffoldable helpers referenced by these writes but not yet present in the write set. */
export function missingSupportingHelperWrites(
  writes: readonly { filePath: string; content: string }[],
  layout?: SecurityFixLayout | null
): SecurityFixWrite[] {
  const byPath = new Set(writes.map((write) => normalizedPath(write.filePath).replace(/^\/+/, "")));
  const inferredLayout =
    layout ??
    ({
      serverActionPath: writes.some((write) =>
        normalizedPath(write.filePath).replace(/^\/+/, "").startsWith("src/")
      )
        ? `src/${SECURE_QUERY_RELATIVE}`
        : SECURE_QUERY_RELATIVE,
      importModule: SECURE_QUERY_IMPORT,
    } satisfies SecurityFixLayout);

  const needed = new Map<string, SecurityFixWrite>();
  for (const write of writes) {
    for (const moduleName of collectAtImportModules(write.content)) {
      const helper = SCAFFOLDABLE_HELPERS.find((entry) => entry.importModule === moduleName);
      if (!helper) continue;
      const filePath = helperFilePathForImport(moduleName, inferredLayout);
      if (!filePath || byPath.has(filePath) || needed.has(filePath)) continue;
      needed.set(filePath, { filePath, content: helper.content.endsWith("\n") ? helper.content : `${helper.content}\n` });
    }
  }
  return [...needed.values()];
}

/** Helpers the client-query plan always needs (createClient), placed for the active `@/` root. */
export function supportingHelperWritesForLayout(layout?: SecurityFixLayout | null): SecurityFixWrite[] {
  const resolved = layout ?? {
    serverActionPath: `src/${SECURE_QUERY_RELATIVE}`,
    importModule: SECURE_QUERY_IMPORT,
  };
  const filePath = helperFilePathForImport(SUPABASE_SERVER_IMPORT, resolved);
  if (!filePath) return [];
  return [
    {
      filePath,
      content: SUPABASE_SERVER_HELPER.endsWith("\n") ? SUPABASE_SERVER_HELPER : `${SUPABASE_SERVER_HELPER}\n`,
    },
  ];
}

function skipStringLiteral(source: string, start: number): number {
  const quote = source[start];
  if (quote !== '"' && quote !== "'" && quote !== "`") return start;
  let index = start + 1;
  while (index < source.length) {
    const char = source[index];
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (quote === "`" && char === "$" && source[index + 1] === "{") {
      index += 2;
      let depth = 1;
      while (index < source.length && depth > 0) {
        const inner = source[index];
        if (inner === '"' || inner === "'" || inner === "`") {
          index = skipStringLiteral(source, index);
          continue;
        }
        if (inner === "{") depth += 1;
        else if (inner === "}") depth -= 1;
        index += 1;
      }
      continue;
    }
    if (char === quote) return index + 1;
    index += 1;
  }
  return source.length;
}

function skipBalanced(source: string, start: number, open: string, close: string): number {
  if (source[start] !== open) return start;
  let depth = 0;
  let index = start;
  while (index < source.length) {
    const char = source[index];
    if (char === '"' || char === "'" || char === "`") {
      index = skipStringLiteral(source, index);
      continue;
    }
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
    index += 1;
  }
  return source.length;
}

function skipWhitespace(source: string, start: number): number {
  let index = start;
  while (index < source.length && /\s/.test(source[index] ?? "")) index += 1;
  return index;
}

/** Grow a regex hit through `.select(...)` args and further builder chains. */
function extendClientQueryEnd(source: string, matchStart: number, matchEnd: number): number {
  let index = matchEnd;
  index = skipWhitespace(source, index);
  if (source[index] === "(") {
    index = skipBalanced(source, index, "(", ")");
  }

  while (true) {
    let cursor = skipWhitespace(source, index);
    if (source[cursor] === "?" && source[cursor + 1] === ".") cursor += 2;
    else if (source[cursor] === ".") cursor += 1;
    else break;
    cursor = skipWhitespace(source, cursor);
    if (!/[A-Za-z_$]/.test(source[cursor] ?? "")) break;
    while (cursor < source.length && /[A-Za-z0-9_$]/.test(source[cursor] ?? "")) cursor += 1;
    cursor = skipWhitespace(source, cursor);
    if (source[cursor] !== "(") break;
    index = skipBalanced(source, cursor, "(", ")");
  }

  return Math.max(index, matchEnd);
}

const QUERY_PARAM_RESERVED = new Set([
  "supabase",
  "prisma",
  "db",
  "sql",
  "pool",
  "client",
  // Bound by the generated getUser() auth check — never pass as a function param.
  "user",
  "true",
  "false",
  "null",
  "undefined",
  "await",
  "new",
  "return",
  "const",
  "let",
  "var",
  "as",
  "satisfies",
  "void",
  "typeof",
  "from",
  "select",
  "insert",
  "update",
  "delete",
  "upsert",
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "is",
  "in",
  "contains",
  "containedBy",
  "rangeGt",
  "rangeGte",
  "rangeLt",
  "rangeLte",
  "rangeAdjacent",
  "overlaps",
  "textSearch",
  "match",
  "not",
  "or",
  "filter",
  "order",
  "limit",
  "range",
  "single",
  "maybeSingle",
  "csv",
  "throwOnError",
  "returns",
  "findMany",
  "findFirst",
  "findUnique",
  "create",
  "createMany",
  "updateMany",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
  "execute",
  "transaction",
  "query",
  // Object-literal option keys (e.g. `.order("created_at", { ascending: false })`).
  "ascending",
  "nullsFirst",
  "foreignTable",
  "referencedTable",
  "head",
]);

const FILTER_SCALAR_METHODS = "eq|neq|gt|gte|lt|lte|like|ilike|match|imatch";

type NestedParamShape = { [key: string]: NestedParamShape | "string" };

type QueryParamInfo = {
  name: string;
  propertyPaths: string[][];
  usedInInFilter: boolean;
  usedInIsFilter: boolean;
  usedInLimitOrRange: boolean;
};

function maskQueryExpressionStrings(expression: string): string {
  let masked = "";
  for (let index = 0; index < expression.length; ) {
    const char = expression[index] ?? "";
    if (char === '"' || char === "'" || char === "`") {
      const end = skipStringLiteral(expression, index);
      masked += " ".repeat(end - index);
      index = end;
      continue;
    }
    masked += char;
    index += 1;
  }
  return masked;
}

/** Blank out `{ key: ... }` / `{ key, }` names so object keys are not treated as params. */
function maskObjectLiteralKeys(expression: string): string {
  return expression.replace(
    /([{,]\s*)([A-Za-z_$][\w$]*)(\s*(?::|,|}))/g,
    (_full, prefix: string, key: string, suffix: string) => `${prefix}${" ".repeat(key.length)}${suffix}`
  );
}

function extractQueryParams(expression: string): string[] {
  let masked = maskQueryExpressionStrings(expression);
  masked = maskObjectLiteralKeys(masked);
  masked = masked.replace(/(\?\.)\s*[A-Za-z_$][\w$]*/g, (part) => " ".repeat(part.length));
  masked = masked.replace(/(\.)\s*[A-Za-z_$][\w$]*/g, (part) => " ".repeat(part.length));

  const params: string[] = [];
  const seen = new Set<string>();
  for (const match of masked.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) {
    const name = match[1];
    if (!name || QUERY_PARAM_RESERVED.has(name) || seen.has(name)) continue;
    seen.add(name);
    params.push(name);
  }
  return params;
}

/**
 * Resolve `const name = "..."` / `let` / `var` string bindings in `source`.
 * Template literals with `${...}` are rejected (not safe to inline).
 */
function resolveStringLiteralBinding(source: string, name: string): string | null {
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) return null;
  const assign = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*`);
  const match = assign.exec(source);
  if (!match || match.index == null) return null;
  const start = match.index + match[0].length;
  const quote = source[start];
  if (quote !== '"' && quote !== "'" && quote !== "`") return null;
  const end = skipStringLiteral(source, start);
  if (end <= start + 1) return null;
  const raw = source.slice(start + 1, end - 1);
  if (quote === "`" && /\$\{/.test(raw)) return null;
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\");
}

/**
 * Rewrite `.select(varName)` to `.select("literal")` when `varName` is a string
 * const in `source`. Keeps Supabase row typing (avoids GenericStringError from
 * dynamic `.select(string)`).
 */
export function inlineSelectStringLiterals(expression: string, source: string): string {
  return expression.replace(
    /\.\s*select\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g,
    (full, name: string) => {
      const literal = resolveStringLiteralBinding(source, name);
      if (literal == null) return full;
      return `.select(${JSON.stringify(literal)})`;
    }
  );
}

function looksBooleanParamName(name: string): boolean {
  return (
    /^(?:is|has|can|should)[A-Z_][\w$]*$/.test(name) ||
    /^(?:active|enabled|disabled|visible|published|verified|deleted|open|closed)$/i.test(name)
  );
}

function analyzeQueryParam(expression: string, name: string): QueryParamInfo {
  const masked = maskQueryExpressionStrings(expression);
  const propertyPaths: string[][] = [];
  const propRe = new RegExp(
    `\\b${name}\\s*((?:\\?\\.\\s*[A-Za-z_$][\\w$]*|\\.\\s*[A-Za-z_$][\\w$]*)+)`,
    "g"
  );
  for (const match of masked.matchAll(propRe)) {
    const chain = match[1] ?? "";
    const parts = [...chain.matchAll(/[A-Za-z_$][\w$]*/g)].map((part) => part[0] ?? "").filter(Boolean);
    if (parts.length > 0) propertyPaths.push(parts);
  }
  // Use the raw expression so quoted column names are still visible.
  const usedInInFilter = new RegExp(
    `\\.\\s*in\\s*\\(\\s*(['\`"][^'\`"]+['\`"])\\s*,\\s*${name}\\b`
  ).test(expression);
  const usedInIsDirect = new RegExp(
    `\\.\\s*is\\s*\\(\\s*(['\`"][^'\`"]+['\`"])\\s*,\\s*${name}\\b`
  ).test(expression);
  const usedInEqAsBool =
    looksBooleanParamName(name) &&
    propertyPaths.length === 0 &&
    new RegExp(`\\.\\s*eq\\s*\\(\\s*(['\`"][^'\`"]+['\`"])\\s*,\\s*${name}\\b`).test(expression);
  const usedInLimitOrRange = new RegExp(
    `\\.\\s*(?:limit|range)\\s*\\(\\s*[^)]*\\b${name}\\b`
  ).test(expression);
  return {
    name,
    propertyPaths,
    usedInInFilter,
    usedInIsFilter: usedInIsDirect || usedInEqAsBool,
    usedInLimitOrRange,
  };
}

function mergeParamPath(root: NestedParamShape, path: readonly string[]): void {
  let node = root;
  for (let index = 0; index < path.length; index += 1) {
    const key = path[index];
    if (!key) continue;
    if (index === path.length - 1) {
      if (typeof node[key] !== "object") node[key] = "string";
      return;
    }
    const existing = node[key];
    if (!existing || existing === "string") {
      node[key] = {};
    }
    node = node[key] as NestedParamShape;
  }
}

function renderParamShape(shape: NestedParamShape): string {
  return `{ ${Object.entries(shape)
    .map(([key, value]) => (value === "string" ? `${key}: string` : `${key}: ${renderParamShape(value)}`))
    .join("; ")} }`;
}

function paramTypeAnnotation(info: QueryParamInfo): string {
  if (info.usedInInFilter && info.propertyPaths.length === 0) {
    return `${info.name}: readonly string[] | undefined`;
  }
  if (info.usedInIsFilter && info.propertyPaths.length === 0) {
    return `${info.name}: boolean | null | undefined`;
  }
  if (info.usedInLimitOrRange && info.propertyPaths.length === 0 && !info.usedInInFilter && !info.usedInIsFilter) {
    // `.limit(HISTORY_LIMIT)` / `.range(from, to)` — keep numeric, not string.
    return `${info.name}: number | undefined`;
  }
  if (info.propertyPaths.length > 0) {
    const shape: NestedParamShape = {};
    for (const path of info.propertyPaths) mergeParamPath(shape, path);
    return `${info.name}: ${renderParamShape(shape)} | undefined`;
  }
  return `${info.name}: string | undefined`;
}

/** Turn a filter value into `string | undefined` for Supabase `.eq()` / comparable filters. */
function coerceToStringUndefined(valueExpr: string): string {
  const trimmed = valueExpr.trim();
  if (!trimmed) return trimmed;
  if (/==\s*null\s*\?\s*undefined\s*:/.test(trimmed)) return trimmed;
  if (/^String\s*\(/.test(trimmed)) return trimmed;
  if (/^['"`]/.test(trimmed)) return trimmed;
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) return `String(${trimmed})`;
  if (/^\w+(?:\s*\?\.\s*\w+)+$/.test(trimmed) || /^\w+(?:\s*\.\s*\w+)+$/.test(trimmed)) {
    const optional = trimmed.replace(/\s*\.\s*/g, "?.");
    const solid = trimmed.replace(/\s*\?\.\s*/g, ".");
    return `${optional} == null ? undefined : String(${solid})`;
  }
  if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) {
    return `${trimmed} == null ? undefined : String(${trimmed})`;
  }
  return trimmed;
}

/**
 * Rewrite filter chains so generated actions typecheck against Supabase:
 * - `.eq/.neq(..., true|false|null)` → `.is(...)` / `.not(..., "is", ...)`
 * - number literals → `String(n)` for string filters
 * - param values coerced to `string | undefined` (except `.is` / `.in`)
 */
export function normalizeSupabaseFilterExpression(
  expression: string,
  paramInfos?: readonly QueryParamInfo[]
): string {
  const params =
    paramInfos ??
    extractQueryParams(expression).map((name) => analyzeQueryParam(expression, name));
  const paramNames = new Set(params.map((param) => param.name));
  const isParams = new Set(params.filter((param) => param.usedInIsFilter).map((param) => param.name));

  // Boolean/null equality belongs on `.is()`, not string `.eq()`.
  let next = expression.replace(
    /\.\s*(eq|neq)\s*\(\s*(['"`][^'"`]+['"`])\s*,\s*(true|false|null)\s*\)/g,
    (_full, method: string, column: string, literal: string) => {
      if (method === "eq") return `.is(${column}, ${literal})`;
      return `.not(${column}, "is", ${literal})`;
    }
  );

  // Boolean-named params mistakenly passed to `.eq()` → `.is()`.
  for (const name of isParams) {
    next = next.replace(
      new RegExp(`\\.\\s*eq\\s*\\(\\s*(['\`"][^'\`"]+['\`"])\\s*,\\s*${name}\\b\\s*\\)`, "g"),
      (_full, column: string) => `.is(${column}, ${name} ?? null)`
    );
  }

  const filterRe = new RegExp(
    `\\.(${FILTER_SCALAR_METHODS})\\(\\s*(['\`"][^'\`"]+['\`"])\\s*,\\s*([^)]+?)\\s*\\)`,
    "g"
  );
  next = next.replace(filterRe, (_full, method: string, column: string, rawValue: string) => {
    const value = rawValue.trim();
    if (/^(true|false|null)$/.test(value)) {
      // Leftover after eq→is rewrite (e.g. like/ilike) — stringify.
      return `.${method}(${column}, ${coerceToStringUndefined(value)})`;
    }
    if (/^\d+(?:\.\d+)?$/.test(value)) {
      return `.${method}(${column}, ${coerceToStringUndefined(value)})`;
    }
    const root = /^([A-Za-z_$][\w$]*)/.exec(value)?.[1];
    if (!root || !paramNames.has(root)) {
      return `.${method}(${column}, ${value})`;
    }
    if (isParams.has(root)) {
      return `.${method}(${column}, ${value})`;
    }
    return `.${method}(${column}, ${coerceToStringUndefined(value)})`;
  });

  // `.is(column, param)` — keep boolean | null, default undefined → null.
  next = next.replace(
    /\.\s*is\s*\(\s*(['"`][^'"`]+['"`])\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g,
    (_full, column: string, name: string) => {
      if (!isParams.has(name) && !paramNames.has(name)) {
        return `.is(${column}, ${name})`;
      }
      if (/^(true|false|null)$/.test(name)) return `.is(${column}, ${name})`;
      return `.is(${column}, ${name} ?? null)`;
    }
  );

  for (const param of params) {
    if (!param.usedInInFilter) continue;
    const inRe = new RegExp(`\\.\\s*in\\s*\\(\\s*(['\`"][^'\`"]+['\`"])\\s*,\\s*${param.name}\\b`, "g");
    next = next.replace(inRe, (_full, column: string) => `.in(${column}, ${param.name} ?? []`);
  }
  return next;
}

function coerceSupabaseFilterArgs(expression: string, params: readonly QueryParamInfo[]): string {
  return normalizeSupabaseFilterExpression(expression, params);
}

function clientActionCall(name: string, params: readonly string[], source: string, index: number): string {
  const args = params.join(", ");
  const call = `${name}(${args})`;
  const before = source.slice(0, index).replace(/\s+$/, "");
  if (/\bawait$/.test(before)) return call;
  return `await ${call}`;
}

/**
 * Build a `"use server"` action patch for a client DB query.
 * Output must satisfy `@typescript-eslint/no-explicit-any` (no `any`, no `as any`).
 */
function serverAction(
  kind: "supabase" | "prisma" | "drizzle" | "sql",
  expression: string,
  name: string,
  params: readonly string[] = []
): string {
  const imports = [`import { createClient } from "${SUPABASE_SERVER_IMPORT}";`];
  if (kind === "prisma") imports.push('import { prisma } from "@/lib/prisma";');
  if (kind === "drizzle") imports.push('import { db } from "@/lib/db";');
  const body = expression.trim().replace(/;\s*$/, "");
  const analyzed = params.map((param) => analyzeQueryParam(body, param));
  const paramList = analyzed.map(paramTypeAnnotation).join(", ");
  // No explicit Promise<{ data: unknown }> — let the query infer `data` (Option 5).
  const signature =
    analyzed.length === 0
      ? `export async function ${name}()`
      : `export async function ${name}(${paramList})`;
  // Coerce filter args so Supabase `.eq()` receives `string | undefined` (never objects / wide unions).
  const queryExpression = coerceSupabaseFilterArgs(body, analyzed);
  const queryBlock =
    kind === "supabase"
      ? [`    const { data, error } = await ${queryExpression};`, "    return { data, error };"]
      : [`    return await ${queryExpression};`];
  return sanitizeGeneratedTypeScript(
    [
      '"use server";',
      "",
      ...imports,
      "",
      `${signature} {`,
      "  try {",
      "    const supabase = await createClient();",
      "    const {",
      "      data: { user },",
      "    } = await supabase.auth.getUser();",
      "    if (!user) {",
      '      return { data: null, error: { message: "Unauthorized", details: "", hint: "", code: "401" } };',
      "    }",
      ...queryBlock,
      "  } catch (error) {",
      "    console.error(error);",
      // Same `{ data, error }` shape as success / unauthorized — keeps client assigns typecheck-safe.
      '    return { data: null, error: { message: "The request could not be completed.", details: "", hint: "", code: "500" } };',
      "  }",
      "}",
      "",
    ].join("\n"),
    "secure-query.ts"
  );
}

function scanClientQueries(file: SecurityScanFile): SecurityFinding[] {
  const filePath = normalizedPath(file.filePath);
  if (!isCodeFile(filePath) || ignoredPath(filePath) || !/\.(?:ts|tsx)$/.test(filePath)) return [];
  if (!hasUseClient(file.content)) return [];

  const masked = maskCodeComments(file.content);
  const findings: SecurityFinding[] = [];
  const seen = new Set<number>();

  for (const rule of CLIENT_PATTERNS) {
    const matcher = new RegExp(rule.pattern.source, "g");
    for (const match of masked.matchAll(matcher)) {
      const seed = match[0];
      const index = match.index ?? 0;
      if (!seed || seen.has(index)) continue;
      if (masked.slice(index, index + seed.length).trim().length === 0) continue;
      const end = extendClientQueryEnd(file.content, index, index + seed.length);
      if (end <= index) continue;
      seen.add(index);
      const original = file.content.slice(index, end);
      const expression = inlineSelectStringLiterals(original, file.content);
      const line = lineAt(file.content, index);
      const name = actionName(line);
      const params = extractQueryParams(expression);
      const importLine = secureQueryImport(name);
      const actionPath = serverActionFilePath(filePath);
      const call = clientActionCall(name, params, file.content, index);
      const action = serverAction(rule.kind, expression, name, params);
      const actionLines = action.split("\n").map((entry) => `+${entry}`).join("\n");
      const removed = original.split("\n").map((entry) => `-${entry}`).join("\n");
      const diff = [
        `--- a/${filePath}`,
        `+++ b/${filePath}`,
        `@@ -${line} +${line} @@`,
        `+${importLine}`,
        removed,
        `+${call}`,
        "--- /dev/null",
        `+++ b/${actionPath}`,
        "@@ -0,0 +1 @@",
        actionLines,
      ].join("\n");

      findings.push({
        filePath,
        severity: "HIGH",
        rule: "Insecure Client Query",
        category: "CLIENT_DB_EXPOSURE",
        line,
        message: `Client component runs a ${rule.kind} query. Move it behind a server action that checks supabase.auth.getUser().`,
        snippet: original.trim().slice(0, 180),
        remediation: { diff },
      });
    }
  }

  return findings;
}

function recordOfStrings(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  const record: Record<string, string> = {};
  for (const [key, entry] of entries) {
    if (typeof entry !== "string") return null;
    record[key] = entry;
  }
  return record;
}

function readPackageJson(content: string): { dependencies: Record<string, string>; devDependencies: Record<string, string> } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  return {
    dependencies: recordOfStrings(record.dependencies) ?? {},
    devDependencies: recordOfStrings(record.devDependencies) ?? {},
  };
}

function packageLine(content: string, name: string): number {
  const lines = content.split(/\r?\n/);
  const needle = `"${name}"`;
  const index = lines.findIndex((line) => line.includes(needle));
  return index === -1 ? 1 : index + 1;
}

function bumpedSpec(spec: string, safe: Semver): string {
  const trimmed = spec.trim();
  const prefix = trimmed.startsWith("^") || trimmed.startsWith("~") ? trimmed[0] : "";
  return `${prefix ?? ""}${formatVersion(safe)}`;
}

function updateCommand(name: string, current: Semver, safe: Semver): string {
  if (current[0] === safe[0]) return `npm update ${name}`;
  return `npm install ${name}@${formatVersion(safe)}`;
}

function dependencyFinding(
  filePath: string,
  content: string,
  name: string,
  spec: string,
  severity: SecuritySeverity,
  message: string,
  nextSpec: string,
  command: string
): SecurityFinding {
  const line = packageLine(content, name);
  const before = lineText(content, line);
  const after = before.includes(spec) ? before.replace(spec, nextSpec) : before;
  return {
    filePath,
    severity,
    rule: "Vulnerable Dependency",
    category: "VULNERABLE_DEPENDENCY",
    line,
    message,
    snippet: before.trim().slice(0, 180),
    remediation: {
      diff: unifiedLine(filePath, line, before, after),
      command,
    },
  };
}

function nextFloor(version: Semver): { safe: Semver; severity: SecuritySeverity; reason: string } | null {
  const floor = NEXT_FLOORS[version[0]];
  if (floor && compareVersion(version, floor) < 0) {
    return {
      safe: floor,
      severity: "HIGH",
      reason: `next ${formatVersion(version)} is below ${formatVersion(floor)}, the release that patches the middleware authorization bypass.`,
    };
  }
  if (version[0] < 12) {
    return {
      safe: [15, 2, 3],
      severity: "MEDIUM",
      reason: `next ${formatVersion(version)} is an outdated major susceptible to middleware bypass CVEs.`,
    };
  }
  return null;
}

function scanPackageJson(file: SecurityScanFile): SecurityFinding[] {
  const filePath = normalizedPath(file.filePath);
  if (baseName(filePath) !== "package.json" || ignoredPath(filePath)) return [];
  const manifest = readPackageJson(file.content);
  if (!manifest) return [];

  const findings: SecurityFinding[] = [];
  const packages = { ...manifest.dependencies, ...manifest.devDependencies };

  for (const [name, spec] of Object.entries(packages)) {
    const version = parseVersion(spec);
    if (name === "next" && version) {
      const floor = nextFloor(version);
      if (floor) {
        findings.push(
          dependencyFinding(
            filePath,
            file.content,
            name,
            spec,
            floor.severity,
            floor.reason,
            bumpedSpec(spec, floor.safe),
            updateCommand(name, version, floor.safe)
          )
        );
      }
    }

    const rule = DEPENDENCY_FLOORS.find((entry) => entry.name === name);
    if (rule && version && compareVersion(version, rule.safe) < 0) {
      findings.push(
        dependencyFinding(
          filePath,
          file.content,
          name,
          spec,
          rule.severity,
          rule.reason,
          bumpedSpec(spec, rule.safe),
          updateCommand(name, version, rule.safe)
        )
      );
    }

    const deprecated = DEPRECATED_PACKAGES.find((entry) => entry.name === name);
    if (deprecated) {
      const line = packageLine(file.content, name);
      const before = lineText(file.content, line);
      findings.push({
        filePath,
        severity: "MEDIUM",
        rule: "Vulnerable Dependency",
        category: "VULNERABLE_DEPENDENCY",
        line,
        message: deprecated.message,
        snippet: before.trim().slice(0, 180),
        remediation: {
          diff: unifiedLine(filePath, line, before, ""),
          command: deprecated.command,
        },
      });
    }
  }

  return findings;
}

function scanBloatedImports(file: SecurityScanFile): SecurityFinding[] {
  const filePath = normalizedPath(file.filePath);
  if (!isCodeFile(filePath) || ignoredPath(filePath) || isTestSourceFile(filePath)) return [];
  const masked = maskCodeComments(file.content);
  const findings: SecurityFinding[] = [];

  for (const rule of BLOAT_IMPORTS) {
    const matcher = new RegExp(rule.pattern.source, "g");
    for (const match of masked.matchAll(matcher)) {
      const statement = match[0];
      const index = match.index ?? 0;
      if (!statement) continue;
      const line = lineAt(file.content, index);
      const before = lineText(file.content, line);
      // Fixture strings in non-test files can still regex-match — only real import lines count.
      if (!/^\s*import\b/.test(before)) continue;
      findings.push({
        filePath,
        severity: "MEDIUM",
        rule: "Vulnerable Dependency",
        category: "VULNERABLE_DEPENDENCY",
        line,
        message: `Full-library import of ${rule.packageName} pulls the entire package into the bundle.`,
        snippet: before.trim().slice(0, 180),
        remediation: {
          diff: unifiedLine(filePath, line, before, rule.replacement),
          command: `Replace the ${rule.packageName} barrel import with a direct module path.`,
        },
      });
    }
  }

  return findings;
}

function dedupe(findings: SecurityFinding[]): SecurityFinding[] {
  const unique = new Map<string, SecurityFinding>();
  for (const finding of findings) {
    const key = [finding.category, finding.filePath, String(finding.line), finding.rule, finding.message].join("\0");
    if (!unique.has(key)) unique.set(key, finding);
  }
  const rank: Record<SecuritySeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
  return [...unique.values()].sort(
    (left, right) =>
      rank[left.severity] - rank[right.severity] ||
      left.filePath.localeCompare(right.filePath) ||
      left.line - right.line ||
      left.category.localeCompare(right.category)
  );
}

export function runSecuritySuiteScan(files: readonly SecurityScanFile[]): SecurityFinding[] {
  const findings = files.flatMap((file) => [
    ...scanSecrets(file),
    ...scanClientQueries(file),
    ...scanPackageJson(file),
    ...scanBloatedImports(file),
  ]);
  return dedupe(findings);
}

export type SecurityFixWrite = {
  filePath: string;
  content: string;
  /** Ensure this line exists in the file. Existing contents are kept. */
  appendLine?: string;
};

export type SecurityFixPlan = {
  title: string;
  summary: string;
  branchSlug: string;
  writes: SecurityFixWrite[];
};

type SourceRange = {
  start: number;
  end: number;
};

function isTypeScriptPatchPath(filePath: string): boolean {
  return /\.(?:ts|tsx|mts|cts)$/i.test(filePath.replace(/\\/g, "/"));
}

function isIdentifierChar(char: string | undefined): boolean {
  return typeof char === "string" && /[A-Za-z0-9_$]/.test(char);
}

/**
 * Collect `[start, end)` ranges of the TypeScript `any` keyword outside strings
 * and comments so identifiers like `company` are never touched.
 */
function findExplicitAnyRanges(source: string): SourceRange[] {
  const ranges: SourceRange[] = [];
  let index = 0;
  while (index < source.length) {
    const char: string = source[index] ?? "";
    const nextChar: string = source[index + 1] ?? "";

    if (char === "/" && nextChar === "/") {
      index += 2;
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (char === "/" && nextChar === "*") {
      index += 2;
      while (
        index < source.length &&
        !(source[index] === "*" && source[index + 1] === "/")
      ) {
        index += 1;
      }
      index = Math.min(source.length, index + 2);
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      const quote: "'" | '"' | "`" = char;
      index += 1;
      while (index < source.length) {
        const current: string = source[index] ?? "";
        if (current === "\\") {
          index += 2;
          continue;
        }
        if (quote === "`" && current === "$" && source[index + 1] === "{") {
          index += 2;
          let depth = 1;
          while (index < source.length && depth > 0) {
            const nested: string = source[index] ?? "";
            if (nested === "{") depth += 1;
            else if (nested === "}") depth -= 1;
            index += 1;
          }
          continue;
        }
        if (current === quote) {
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }

    if (
      source.startsWith("any", index) &&
      !isIdentifierChar(source[index - 1]) &&
      !isIdentifierChar(source[index + 3])
    ) {
      ranges.push({ start: index, end: index + 3 });
      index += 3;
      continue;
    }
    index += 1;
  }
  return ranges;
}

/**
 * Post-process generated TypeScript/TSX before it is saved or committed.
 * Walks the source like a light AST (skipping strings/comments), replaces every
 * explicit `any` keyword with `unknown` (`: any`, `as any`, generics, etc.).
 * Keeps patches compliant with `@typescript-eslint/no-explicit-any: "error"`.
 */
export function sanitizeGeneratedTypeScript(
  source: string,
  filePath: string = "generated.ts"
): string {
  void filePath;
  if (!source || !/\bany\b/.test(source)) return source;
  const ranges: readonly SourceRange[] = findExplicitAnyRanges(source);
  if (ranges.length === 0) return source;
  let out: string = source;
  for (let cursor = ranges.length - 1; cursor >= 0; cursor -= 1) {
    const range: SourceRange | undefined = ranges[cursor];
    if (!range) continue;
    out = `${out.slice(0, range.start)}unknown${out.slice(range.end)}`;
  }
  return out;
}

/** Sanitize TypeScript patch writes; leave non-TS payloads (e.g. `.env.example`) untouched. */
export function sanitizeSecurityFixWrites(
  writes: readonly SecurityFixWrite[]
): SecurityFixWrite[] {
  return writes.map((write: SecurityFixWrite): SecurityFixWrite => {
    if (!isTypeScriptPatchPath(write.filePath)) return write;
    const content: string = sanitizeGeneratedTypeScript(write.content, write.filePath);
    if (content === write.content) return write;
    return { ...write, content };
  });
}

function finalizeSecurityFixPlan(plan: SecurityFixPlan | null): SecurityFixPlan | null {
  if (!plan) return null;
  return { ...plan, writes: sanitizeSecurityFixWrites(plan.writes) };
}

function lineReplace(content: string, line: number, nextLine: string): string {
  const parts = content.split("\n");
  const current = parts[line - 1];
  if (current === undefined) return content;
  const carriage = current.endsWith("\r");
  parts[line - 1] = `${nextLine.replace(/\r$/, "")}${carriage ? "\r" : ""}`;
  return parts.join("\n");
}

function removePackage(content: string, name: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    return content;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return content;
  const record = parsed as Record<string, unknown>;
  for (const field of ["dependencies", "devDependencies"] as const) {
    const bag = record[field];
    if (!bag || typeof bag !== "object" || Array.isArray(bag) || !(name in bag)) continue;
    const next: Record<string, unknown> = { ...(bag as Record<string, unknown>) };
    delete next[name];
    record[field] = next;
  }
  return `${JSON.stringify(record, null, 2)}\n`;
}

export function mergeEnvExample(existing: string | null, line: string): string {
  const trimmed = line.trim();
  const key = trimmed.split("=")[0] ?? "";
  if (!existing?.trim()) return `${trimmed}\n`;
  const present = existing.split(/\r?\n/).some((entry) => {
    const head = entry.trim().replace(/^export\s+/, "");
    return head === trimmed || (key.length > 0 && head.startsWith(`${key}=`));
  });
  if (present) return existing.endsWith("\n") ? existing : `${existing}\n`;
  return existing.endsWith("\n") ? `${existing}${trimmed}\n` : `${existing}\n${trimmed}\n`;
}

export function mergeServerAction(existing: string | null, next: string): string {
  const sanitizedNext = sanitizeGeneratedTypeScript(next, "secure-query.ts");
  const normalized = sanitizedNext.endsWith("\n") ? sanitizedNext : `${sanitizedNext}\n`;
  if (!existing?.trim()) return normalized;
  const name = sanitizedNext.match(/export async function ([A-Za-z0-9_]+)/)?.[1];
  if (name && new RegExp(`function\\s+${name}\\b`).test(existing)) {
    return sanitizeGeneratedTypeScript(
      existing.endsWith("\n") ? existing : `${existing}\n`,
      "secure-query.ts"
    );
  }
  const imports = sanitizedNext
    .split("\n")
    .filter((entry) => entry.startsWith("import ") && !existing.includes(entry));
  const start = sanitizedNext.indexOf("export async function");
  if (start < 0) {
    return sanitizeGeneratedTypeScript(
      existing.endsWith("\n") ? existing : `${existing}\n`,
      "secure-query.ts"
    );
  }
  const fn = sanitizedNext.slice(start).trim();
  const importBlock = imports.length > 0 ? `${imports.join("\n")}\n` : "";
  return sanitizeGeneratedTypeScript(
    `${existing.replace(/\s*$/, "")}\n\n${importBlock}${fn}\n`,
    "secure-query.ts"
  );
}

function secretPlan(file: SecurityScanFile, line: number, summary: string): SecurityFixPlan | null {
  const filePath = normalizedPath(file.filePath);
  const masked = maskForScan(filePath, file.content);
  for (const rule of SECRET_RULES) {
    const matcher = new RegExp(rule.pattern.source, "g");
    for (const match of masked.matchAll(matcher)) {
      const secret = match[0];
      const index = match.index ?? 0;
      if (!secret || lineAt(file.content, index) !== line) continue;
      const originalLine = lineText(file.content, line);
      const envName = isEnvFile(filePath) ? envNameOnLine(originalLine, rule.envName) : rule.envName;
      const patchedLine = replaceLiteral(originalLine, secret, envName, filePath);
      const writes: SecurityFixWrite[] = [
        { filePath, content: lineReplace(file.content, line, patchedLine) },
      ];
      if (!isEnvFile(filePath)) {
        writes.push({
          filePath: ".env.example",
          content: `${envName}=\n`,
          appendLine: `${envName}=`,
        });
      }
      return {
        title: `fix: remove hardcoded secret from ${filePath}`,
        summary,
        branchSlug: "secret",
        writes,
      };
    }
  }
  return null;
}

/**
 * True when `line` falls anywhere in the matched query — from the `supabase`
 * seed through the last chained method (`.eq` / `.maybeSingle` / etc.).
 * Findings key off the start line; Open Fix PR often passes a later line in the
 * same multiline chain (`.from` / `.select`).
 */
function clientQuerySpanCoversLine(
  source: string,
  matchStart: number,
  matchEnd: number,
  line: number
): { startLine: number; endLine: number; end: number } | null {
  const end = extendClientQueryEnd(source, matchStart, matchEnd);
  if (end <= matchStart) return null;
  const startLine = lineAt(source, matchStart);
  const endLine = lineAt(source, end - 1);
  if (line < startLine || line > endLine) return null;
  return { startLine, endLine, end };
}

function clientPlan(
  file: SecurityScanFile,
  line: number,
  summary: string,
  layout?: SecurityFixLayout | null
): SecurityFixPlan | null {
  const filePath = normalizedPath(file.filePath);
  const resolved = layout ?? resolveSecurityFixLayout({ clientFilePath: filePath });
  const masked = maskCodeComments(file.content);
  for (const rule of CLIENT_PATTERNS) {
    const matcher = new RegExp(rule.pattern.source, "g");
    for (const match of masked.matchAll(matcher)) {
      const seed = match[0];
      const index = match.index ?? 0;
      if (!seed) continue;
      const span = clientQuerySpanCoversLine(file.content, index, index + seed.length, line);
      if (!span) continue;
      const original = file.content.slice(index, span.end);
      const expression = inlineSelectStringLiterals(original, file.content);
      const name = actionName(span.startLine);
      const params = extractQueryParams(expression);
      const actionPath = resolved.serverActionPath;
      const call = clientActionCall(name, params, file.content, index);
      const replaced = `${file.content.slice(0, index)}${call}${file.content.slice(span.end)}`;
      // Keep existing client imports (swr, react, etc.) and merge the new action import.
      const patched = ensureSecureQueryNamedImport(replaced, name, resolved.importModule);
      return {
        title: `fix: move client query in ${filePath} to a server action`,
        summary,
        branchSlug: "client-query",
        writes: [
          { filePath, content: patched },
          { filePath: actionPath, content: serverAction(rule.kind, expression, name, params) },
          ...supportingHelperWritesForLayout(resolved),
        ],
      };
    }
  }
  return null;
}

function dependencyPlan(file: SecurityScanFile, line: number, summary: string): SecurityFixPlan | null {
  const filePath = normalizedPath(file.filePath);
  if (baseName(filePath) === "package.json") {
    const manifest = readPackageJson(file.content);
    if (!manifest) return null;
    const packages = { ...manifest.dependencies, ...manifest.devDependencies };
    for (const [name, spec] of Object.entries(packages)) {
      if (packageLine(file.content, name) !== line) continue;
      const deprecated = DEPRECATED_PACKAGES.find((entry) => entry.name === name);
      if (deprecated && summary === deprecated.message) {
        return {
          title: `fix: remove deprecated ${name}`,
          summary,
          branchSlug: "dependency",
          writes: [{ filePath, content: removePackage(file.content, name) }],
        };
      }
      const version = parseVersion(spec);
      if (!version) continue;
      let safe: Semver | null = null;
      if (name === "next") {
        const floor = nextFloor(version);
        if (floor && summary === floor.reason) safe = floor.safe;
      }
      const rule = DEPENDENCY_FLOORS.find((entry) => entry.name === name);
      if (rule && summary === rule.reason) safe = rule.safe;
      if (!safe) continue;
      const before = lineText(file.content, line);
      const after = before.includes(spec) ? before.replace(spec, bumpedSpec(spec, safe)) : before;
      return {
        title: `fix: bump ${name} in ${filePath}`,
        summary,
        branchSlug: "dependency",
        writes: [{ filePath, content: lineReplace(file.content, line, after) }],
      };
    }
    return null;
  }

  if (isTestSourceFile(filePath)) return null;
  const masked = maskCodeComments(file.content);
  for (const rule of BLOAT_IMPORTS) {
    const matcher = new RegExp(rule.pattern.source, "g");
    for (const match of masked.matchAll(matcher)) {
      const index = match.index ?? 0;
      if (!match[0] || lineAt(file.content, index) !== line) continue;
      // Only rewrite a line that is itself an import statement — never a fixture string.
      const before = lineText(file.content, line);
      if (!/^\s*import\b/.test(before)) return null;
      return {
        title: `fix: replace full-library ${rule.packageName} import`,
        summary,
        branchSlug: "dependency",
        writes: [{ filePath, content: lineReplace(file.content, line, rule.replacement) }],
      };
    }
  }
  return null;
}

/**
 * Category priority for multi-finding batch apply (lower runs first as a group).
 * Within the same file + category, lines are applied highest-first.
 */
const BATCH_APPLY_CATEGORY_ORDER: Record<SecurityCategory, number> = {
  CLIENT_DB_EXPOSURE: 0,
  SECRET_LEAK: 1,
  VULNERABLE_DEPENDENCY: 2,
};

export type BatchApplyFindingRef = {
  filePath: string;
  line: number;
  category: string;
};

/**
 * Sort key for the PR / autonomous-heal batch loop: category, then file path,
 * then **descending line number** so a fix lower in the file cannot shift the
 * coordinates of remaining findings higher up.
 */
export function compareFindingsForBatchApply(
  left: BatchApplyFindingRef,
  right: BatchApplyFindingRef
): number {
  const leftRank =
    BATCH_APPLY_CATEGORY_ORDER[left.category as SecurityCategory] ?? 9;
  const rightRank =
    BATCH_APPLY_CATEGORY_ORDER[right.category as SecurityCategory] ?? 9;
  if (leftRank !== rightRank) return leftRank - rightRank;
  const pathDelta = normalizedPath(left.filePath).localeCompare(normalizedPath(right.filePath));
  if (pathDelta !== 0) return pathDelta;
  return right.line - left.line;
}

/** Stable ordering for applying multiple fixes without invalidating upper line coords. */
export function sortFindingsForBatchApply<T extends BatchApplyFindingRef>(
  findings: readonly T[]
): T[] {
  return [...findings].sort(compareFindingsForBatchApply);
}

/**
 * Next security finding to fix in `file` under bottom-up batch apply
 * (highest remaining line first within the preferred category order).
 */
export function pickNextSecurityFindingForBatch(
  file: SecurityScanFile
): SecurityFinding | null {
  const filePath = normalizedPath(file.filePath);
  const findings = runSecuritySuiteScan([file]).filter((item) => item.filePath === filePath);
  if (findings.length === 0) return null;
  return sortFindingsForBatchApply(findings)[0] ?? null;
}

/** Collapse whitespace/quotes so query snippets can be compared across edits. */
export function fingerprintSecurityQuery(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .replace(/["`]([^"'`]+)["`]/g, "'$1'")
    .trim()
    .toLowerCase()
    .slice(0, 240);
}

function clientQuerySpans(
  file: SecurityScanFile
): Array<{ startLine: number; endLine: number; start: number; end: number; fingerprint: string }> {
  const masked = maskCodeComments(file.content);
  const spans: Array<{
    startLine: number;
    endLine: number;
    start: number;
    end: number;
    fingerprint: string;
  }> = [];
  for (const rule of CLIENT_PATTERNS) {
    const matcher = new RegExp(rule.pattern.source, "g");
    for (const match of masked.matchAll(matcher)) {
      const seed = match[0];
      const index = match.index ?? 0;
      if (!seed) continue;
      const end = extendClientQueryEnd(file.content, index, index + seed.length);
      if (end <= index) continue;
      const startLine = lineAt(file.content, index);
      const endLine = lineAt(file.content, end - 1);
      spans.push({
        startLine,
        endLine,
        start: index,
        end,
        fingerprint: fingerprintSecurityQuery(file.content.slice(index, end)),
      });
    }
  }
  return spans;
}

export type SecurityFixRelocation =
  | { line: number; reason: "exact" | "span" | "fingerprint" | "nearest" }
  | null;

/**
 * Locate the live fix target when a UI/report line may have drifted after earlier
 * patches. Order: exact line → span cover → snippet fingerprint → nearest finding.
 */
export function relocateSecurityFixTarget(
  file: SecurityScanFile,
  category: SecurityCategory,
  requestedLine: number,
  hint?: { snippet?: string | null }
): SecurityFixRelocation {
  const filePath = normalizedPath(file.filePath);
  const findings = runSecuritySuiteScan([file]).filter(
    (item) => item.category === category && item.filePath === filePath
  );
  if (findings.length === 0) return null;

  if (category === "CLIENT_DB_EXPOSURE") {
    const spans = clientQuerySpans(file);
    const covering = spans.find(
      (span) => requestedLine >= span.startLine && requestedLine <= span.endLine
    );
    if (covering) {
      return {
        line: covering.startLine,
        reason: covering.startLine === requestedLine ? "exact" : "span",
      };
    }

    const hintFp = hint?.snippet ? fingerprintSecurityQuery(hint.snippet) : "";
    if (hintFp.length >= 12) {
      let best: { line: number; score: number } | null = null;
      for (const span of spans) {
        if (!span.fingerprint.includes(hintFp.slice(0, 48)) && !hintFp.includes(span.fingerprint.slice(0, 48))) {
          // Token overlap: shared supabase.from('table') prefix is enough.
          const hintFrom = /from\s*\(\s*'([^']+)'/.exec(hintFp)?.[1];
          const spanFrom = /from\s*\(\s*'([^']+)'/.exec(span.fingerprint)?.[1];
          if (!hintFrom || hintFrom !== spanFrom) continue;
        }
        const score =
          (span.fingerprint.includes(hintFp.slice(0, 64)) ? 100 : 0) +
          (hintFp.includes(span.fingerprint.slice(0, 64)) ? 80 : 0) -
          Math.abs(span.startLine - requestedLine);
        if (!best || score > best.score) best = { line: span.startLine, score };
      }
      if (best) return { line: best.line, reason: "fingerprint" };
    }

    // Nearest remaining leak by start-line distance (handles large shifts).
    const nearest = [...findings].sort(
      (left, right) =>
        Math.abs(left.line - requestedLine) - Math.abs(right.line - requestedLine) ||
        right.line - left.line
    )[0];
    return nearest ? { line: nearest.line, reason: "nearest" } : null;
  }

  const exact = findings.find((item) => item.line === requestedLine);
  if (exact) return { line: exact.line, reason: "exact" };

  const hintFp = hint?.snippet ? fingerprintSecurityQuery(hint.snippet) : "";
  if (hintFp.length >= 8) {
    const fingerprinted = findings.find(
      (item) => fingerprintSecurityQuery(item.snippet) === hintFp ||
        fingerprintSecurityQuery(item.snippet).includes(hintFp.slice(0, 40)) ||
        hintFp.includes(fingerprintSecurityQuery(item.snippet).slice(0, 40))
    );
    if (fingerprinted) return { line: fingerprinted.line, reason: "fingerprint" };
  }

  const nearest = [...findings].sort(
    (left, right) =>
      Math.abs(left.line - requestedLine) - Math.abs(right.line - requestedLine) ||
      right.line - left.line
  )[0];
  return nearest ? { line: nearest.line, reason: "nearest" } : null;
}

export type PlanSecurityFixHint = {
  snippet?: string | null;
};

/** Rebuild full file contents for one security finding. The caller must pass the current file text. */
export function planSecurityFix(
  file: SecurityScanFile,
  category: SecurityCategory,
  line: number,
  layout?: SecurityFixLayout | null,
  hint?: PlanSecurityFixHint
): SecurityFixPlan | null {
  const filePath = normalizedPath(file.filePath);
  const relocated = relocateSecurityFixTarget(file, category, line, hint);
  if (!relocated) return null;
  const effectiveLine = relocated.line;

  if (category === "CLIENT_DB_EXPOSURE") {
    const findings = runSecuritySuiteScan([file]).filter(
      (item) => item.category === category && item.filePath === filePath
    );
    const matched = findings.find((item) => item.line === effectiveLine);
    const summary =
      matched?.message ??
      findings[0]?.message ??
      "Client component runs a database query. Move it behind a server action that checks supabase.auth.getUser().";
    // Prefer the relocated start line; clientPlan also accepts any line in the span.
    // Sanitize strips any residual `: any` / `as any` before save/commit.
    return finalizeSecurityFixPlan(clientPlan(file, effectiveLine, summary, layout));
  }
  const finding = runSecuritySuiteScan([file]).find(
    (item) => item.category === category && item.line === effectiveLine && item.filePath === filePath
  );
  if (!finding) return null;
  if (category === "SECRET_LEAK") {
    return finalizeSecurityFixPlan(secretPlan(file, effectiveLine, finding.message));
  }
  return finalizeSecurityFixPlan(dependencyPlan(file, effectiveLine, finding.message));
}
