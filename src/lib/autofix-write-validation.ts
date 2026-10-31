import ts from "typescript";
import {
  isServerActionFilePath,
  missingSupportingHelperWrites,
  normalizeSupabaseFilterExpression,
  SUPABASE_SERVER_IMPORT,
} from "@/lib/scanner/security-suite";

export type AutofixWriteFile = {
  filePath: string;
  content: string;
};

export type AutofixValidationCode =
  | "empty"
  | "unsafe-path"
  | "binary"
  | "invalid-json"
  | "syntax"
  | "missing-use-server"
  | "missing-create-client-import"
  | "missing-get-user"
  | "missing-data-error"
  | "chained-query"
  | "missing-secure-query-import"
  | "missing-server-action-file"
  | "missing-support-file"
  | "missing-export"
  | "duplicate-user-binding"
  | "type-boundary"
  | "typecheck";

export type AutofixWriteValidation =
  | { ok: true }
  | { ok: false; code: AutofixValidationCode; message: string; filePath?: string };

const MAX_HEAL_ATTEMPTS = 3;

export type AutofixHealResult =
  | { ok: true; writes: AutofixWriteFile[]; attempts: number }
  | { ok: false; message: string; attempts: number };

function invalid(code: AutofixValidationCode, message: string, filePath?: string): AutofixWriteValidation {
  return filePath ? { ok: false, code, message, filePath } : { ok: false, code, message };
}

/** Real ESM/TS import only — not string literals inside tests or messages. */
const SECURE_QUERY_IMPORT_RE =
  /(?:^|[\n;])\s*import\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+[A-Za-z_$][\w$]*|[A-Za-z_$][\w$]*)\s+from\s+["']@\/app\/actions\/secure-query["']/;
const SECURE_QUERY_CALL_CHAIN_RE = /\bsecureQuery\d*\s*\([^)]*\)\s*\./;
const SERVER_ACTION_EXPORT_RE = /export\s+async\s+function\s+(secureQuery\d*)\s*\(/g;

function isActionPath(filePath: string): boolean {
  return isServerActionFilePath(filePath) || /app\/actions\/secure-query\.ts$/i.test(filePath);
}

function scriptKindFor(filePath: string): ts.ScriptKind | null {
  if (/\.tsx$/i.test(filePath)) return ts.ScriptKind.TSX;
  if (/\.ts$/i.test(filePath)) return ts.ScriptKind.TS;
  if (/\.jsx$/i.test(filePath)) return ts.ScriptKind.JSX;
  if (/\.js$/i.test(filePath)) return ts.ScriptKind.JS;
  return null;
}

function validateJson(filePath: string, content: string): AutofixWriteValidation {
  try {
    JSON.parse(content);
    return { ok: true };
  } catch (error) {
    return invalid(
      "invalid-json",
      `Generated ${filePath} is not valid JSON${
        error instanceof Error && error.message ? ` (${error.message})` : ""
      }. The pull request was not opened.`,
      filePath
    );
  }
}

function validateSyntax(filePath: string, content: string): AutofixWriteValidation {
  const kind = scriptKindFor(filePath);
  if (kind === null) return { ok: true };

  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, kind);
  const diagnostics = (
    sourceFile as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }
  ).parseDiagnostics;

  if (!diagnostics || diagnostics.length === 0) return { ok: true };

  const first = diagnostics[0];
  if (!first) return { ok: true };
  const detail = ts.flattenDiagnosticMessageText(first.messageText, "\n").trim();
  return invalid(
    "syntax",
    `Generated ${filePath} failed a syntax check${detail ? `: ${detail}` : ""}. The pull request was not opened.`,
    filePath
  );
}

function validateServerAction(filePath: string, content: string): AutofixWriteValidation {
  if (!isServerActionFilePath(filePath) && !/app\/actions\/secure-query\.ts$/i.test(filePath)) {
    return { ok: true };
  }

  if (!/["']use server["']/.test(content)) {
    return invalid(
      "missing-use-server",
      `Generated ${filePath} is missing the "use server" directive. The pull request was not opened.`,
      filePath
    );
  }
  if (!/from\s+["']@\/utils\/supabase\/server["']/.test(content)) {
    return invalid(
      "missing-create-client-import",
      `Generated ${filePath} is missing the createClient import. The pull request was not opened.`,
      filePath
    );
  }
  if (!/\.auth\.getUser\s*\(/.test(content)) {
    return invalid(
      "missing-get-user",
      `Generated ${filePath} does not call supabase.auth.getUser(). The pull request was not opened.`,
      filePath
    );
  }
  if (/supabase\s*\.\s*from\s*\(/.test(content)) {
    if (
      !/const\s+\{\s*data\s*,\s*error\s*\}\s*=\s*await/.test(content) ||
      !/return\s+\{\s*data\s*,\s*error\s*\}/.test(content)
    ) {
      return invalid(
        "missing-data-error",
        `Generated ${filePath} does not await the query and return { data, error }. The pull request was not opened.`,
        filePath
      );
    }
  }

  // `{ ok: false, message }` breaks callers that assign `result.data` (TS2322 / CI red).
  if (/return\s+\{\s*ok\s*:\s*false\b/.test(content)) {
    return invalid(
      "missing-data-error",
      `Generated ${filePath} returns { ok: false } instead of { data, error }. The pull request was not opened.`,
      filePath
    );
  }

  return { ok: true };
}

function validateClientPatch(filePath: string, content: string): AutofixWriteValidation {
  if (isServerActionFilePath(filePath) || /app\/actions\/secure-query\.ts$/i.test(filePath)) {
    return { ok: true };
  }
  if (!SECURE_QUERY_IMPORT_RE.test(content) && !/\bsecureQuery\d*\s*\(/.test(content)) {
    return { ok: true };
  }

  if (SECURE_QUERY_CALL_CHAIN_RE.test(content)) {
    return invalid(
      "chained-query",
      `Generated ${filePath} still chains query methods onto the server action call. The pull request was not opened.`,
      filePath
    );
  }

  if (/\bsecureQuery\d*\s*\(/.test(content) && !SECURE_QUERY_IMPORT_RE.test(content)) {
    return invalid(
      "missing-secure-query-import",
      `Generated ${filePath} calls a secureQuery action without importing "@/app/actions/secure-query". The pull request was not opened.`,
      filePath
    );
  }

  return { ok: true };
}

const LOOSE_SCALAR_PARAM =
  /(?:^|,)\s*(user|[A-Za-z_$][\w$]*)\s*:\s*string(?:\s*\|\s*(?:number|boolean|null|undefined))*\s*(?=,|\))/g;

function validateActionTypeBoundaries(filePath: string, content: string): AutofixWriteValidation {
  if (!isActionPath(filePath)) return { ok: true };

  for (const match of content.matchAll(
    /export\s+async\s+function\s+(secureQuery\d*)\s*\(([^)]*)\)\s*\{([\s\S]*?)(?=\nexport\s+async\s+function\s+secureQuery|\n*$)/g
  )) {
    const name = match[1] ?? "secureQuery";
    const params = match[2] ?? "";
    const body = match[3] ?? "";
    if (/\buser\s*:/.test(params) && /data\s*:\s*\{\s*user\s*\}/.test(body)) {
      return invalid(
        "duplicate-user-binding",
        `Generated ${filePath} reuses the identifier "user" as both a ${name}() parameter and the getUser() binding. The pull request was not opened.`,
        filePath
      );
    }
    for (const paramMatch of params.matchAll(LOOSE_SCALAR_PARAM)) {
      const param = paramMatch[1];
      if (!param) continue;
      const propertyAccess = new RegExp(`\\b${param}\\s*\\.\\s*[A-Za-z_$]`);
      if (propertyAccess.test(body)) {
        return invalid(
          "type-boundary",
          `Generated ${filePath} treats ${name}() parameter "${param}" as a scalar, but the query reads a property from it. The pull request was not opened.`,
          filePath
        );
      }
    }
  }

  return { ok: true };
}

const SUPABASE_SERVER_STUB = `type AuthUser = { id: string };
type PostgrestError = {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
};
type ThenableQuery = {
  select(columns?: string): ThenableQuery;
  insert(values: unknown): ThenableQuery;
  update(values: unknown): ThenableQuery;
  delete(): ThenableQuery;
  upsert(values: unknown): ThenableQuery;
  eq(column: string, value: string | undefined): ThenableQuery;
  neq(column: string, value: string | undefined): ThenableQuery;
  gt(column: string, value: string | undefined): ThenableQuery;
  gte(column: string, value: string | undefined): ThenableQuery;
  lt(column: string, value: string | undefined): ThenableQuery;
  lte(column: string, value: string | undefined): ThenableQuery;
  like(column: string, value: string | undefined): ThenableQuery;
  ilike(column: string, value: string | undefined): ThenableQuery;
  in(column: string, values: readonly string[]): ThenableQuery;
  is(column: string, value: boolean | null): ThenableQuery;
  not(column: string, operator: string, value: unknown): ThenableQuery;
  or(filters: string): ThenableQuery;
  order(column: string, options?: { ascending?: boolean }): ThenableQuery;
  limit(count: number | undefined): ThenableQuery;
  range(from: number | undefined, to?: number | undefined): ThenableQuery;
  maybeSingle(): ThenableQuery;
  single(): ThenableQuery;
  then: Promise<{ data: unknown; error: PostgrestError | null }>["then"];
};
declare function createClient(): Promise<{
  auth: {
    getUser(): Promise<{ data: { user: AuthUser | null }; error: PostgrestError | null }>;
    getSession(): Promise<{
      data: { session: { user: AuthUser | null; access_token?: string } | null };
      error: PostgrestError | null;
    }>;
    refreshSession(): Promise<{
      data: { session: { user: AuthUser | null; access_token?: string } | null };
      error: PostgrestError | null;
    }>;
  };
  from(table: string): ThenableQuery;
}>;
`;

function collectActionSignatures(content: string): Map<string, string[]> {
  const signatures = new Map<string, string[]>();
  for (const match of content.matchAll(/export\s+async\s+function\s+(secureQuery\d*)\s*\(([^)]*)\)/g)) {
    const name = match[1];
    if (!name) continue;
    const params = (match[2] ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => part.split(":")[0]?.trim() ?? "")
      .filter(Boolean);
    signatures.set(name, params);
  }
  return signatures;
}

function validateClientActionCallBoundaries(writes: readonly AutofixWriteFile[]): AutofixWriteValidation {
  const signatures = new Map<string, string[]>();
  for (const write of writes) {
    if (!isActionPath(write.filePath)) continue;
    for (const [name, params] of collectActionSignatures(write.content)) {
      signatures.set(name, params);
    }
  }
  if (signatures.size === 0) return { ok: true };

  for (const write of writes) {
    if (isActionPath(write.filePath)) continue;
    for (const match of write.content.matchAll(/\b(secureQuery\d*)\s*\(([^)]*)\)/g)) {
      const name = match[1];
      if (!name || !signatures.has(name)) continue;
      const args = (match[2] ?? "").trim();
      const params = signatures.get(name) ?? [];
      if (params.length === 0 && args.length > 0) {
        return invalid(
          "type-boundary",
          `Generated ${write.filePath} calls ${name}(${args}) but the server action takes no parameters. The pull request was not opened.`,
          write.filePath
        );
      }
      if (params.includes("user") || /\buser(?:\.id)?\b/.test(args)) {
        if (params.includes("user") || (params.length === 0 && /\buser\b/.test(args))) {
          return invalid(
            "type-boundary",
            `Generated ${write.filePath} passes a User/auth value into ${name}() across the server boundary. The pull request was not opened.`,
            write.filePath
          );
        }
      }
    }
  }

  return { ok: true };
}

function validateInMemoryTypecheck(writes: readonly AutofixWriteFile[]): AutofixWriteValidation {
  const actionWrites = writes.filter((write) => isActionPath(write.filePath));
  if (actionWrites.length === 0) return { ok: true };

  // Flatten action(s) + stubs into one file so the check never depends on disk imports.
  const body = actionWrites
    .map((write) =>
      write.content
        .replace(/["']use server["'];?\s*/g, "")
        .replace(/import\s+\{[^}]*\}\s+from\s+["']@\/utils\/supabase\/server["'];?\s*/g, "")
        .replace(/import\s+\{[^}]*\}\s+from\s+["']@\/lib\/prisma["'];?\s*/g, "")
        .replace(/import\s+\{[^}]*\}\s+from\s+["']@\/lib\/db["'];?\s*/g, "")
        .trim()
    )
    .join("\n\n");

  const source = `${SUPABASE_SERVER_STUB}\n${body}\n`;
  const virtualName = "secure-query.check.ts";
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    lib: ["es2022"],
  };

  const baseHost = ts.createCompilerHost(options, true);
  const sourceFile = ts.createSourceFile(virtualName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const host: ts.CompilerHost = {
    ...baseHost,
    fileExists: (path) => path === virtualName || baseHost.fileExists(path),
    readFile: (path) => (path === virtualName ? source : baseHost.readFile(path)),
    getSourceFile: (path, languageVersion, onError, shouldCreateNewSourceFile) => {
      if (path === virtualName) return sourceFile;
      return baseHost.getSourceFile(path, languageVersion, onError, shouldCreateNewSourceFile);
    },
    getCurrentDirectory: () => baseHost.getCurrentDirectory(),
  };

  const program = ts.createProgram({ rootNames: [virtualName], options, host });
  const diagnostics = [...program.getSyntacticDiagnostics(sourceFile), ...program.getSemanticDiagnostics(sourceFile)];
  if (diagnostics.length === 0) return { ok: true };

  const first = diagnostics[0];
  if (!first) return { ok: true };
  const detail = ts.flattenDiagnosticMessageText(first.messageText, "\n").trim();
  const code =
    /Duplicate identifier/i.test(detail)
      ? "duplicate-user-binding"
      : /not assignable|does not exist on type|Argument of type/i.test(detail)
        ? "type-boundary"
        : "typecheck";

  return invalid(
    code,
    `Generated ${actionWrites[0]?.filePath ?? "patch"} failed an in-memory TypeScript check${
      detail ? `: ${detail}` : ""
    }. The pull request was not opened.`,
    actionWrites[0]?.filePath
  );
}

function validateCrossFile(writes: readonly AutofixWriteFile[]): AutofixWriteValidation {
  const byPath = new Map(writes.map((write) => [write.filePath.replace(/\\/g, "/"), write.content]));
  const actionPaths = [...byPath.keys()].filter(
    (path) => isServerActionFilePath(path) || /app\/actions\/secure-query\.ts$/i.test(path)
  );
  const actionExports = new Set<string>();
  for (const path of actionPaths) {
    const content = byPath.get(path) ?? "";
    for (const match of content.matchAll(SERVER_ACTION_EXPORT_RE)) {
      if (match[1]) actionExports.add(match[1]);
    }
  }

  const sourceWrites = writes.filter((write) => /\.(?:ts|tsx|js|jsx)$/i.test(write.filePath));
  // Incomplete security patches are usually a single client write that imports
  // secure-query without shipping the action. Architecture module splits keep an
  // existing import across several files and must not require re-committing the action.
  const requireActionInCommit = actionPaths.length === 0 && sourceWrites.length === 1;

  for (const write of writes) {
    if (!SECURE_QUERY_IMPORT_RE.test(write.content)) continue;
    if (requireActionInCommit) {
      return invalid(
        "missing-server-action-file",
        `Generated ${write.filePath} imports "@/app/actions/secure-query", but the server action file was not included in the commit. The pull request was not opened.`,
        write.filePath
      );
    }
    if (actionPaths.length === 0) continue;
    for (const match of write.content.matchAll(/\b(secureQuery\d*)\s*\(/g)) {
      const name = match[1];
      if (!name) continue;
      if (actionExports.size > 0 && !actionExports.has(name)) {
        return invalid(
          "missing-export",
          `Generated ${write.filePath} calls ${name}(), but that export is missing from the server action file. The pull request was not opened.`,
          write.filePath
        );
      }
    }
  }

  const missingHelpers = missingSupportingHelperWrites(writes);
  if (missingHelpers.length > 0) {
    const helper = missingHelpers[0]!;
    return invalid(
      "missing-support-file",
      `Generated patch imports a helper that is not in the commit (${helper.filePath}). The pull request was not opened.`,
      helper.filePath
    );
  }

  return { ok: true };
}

/** In-memory dry-run before any GitHub tree/commit/PR writes. */
export function validateAutofixWrites(writes: readonly AutofixWriteFile[]): AutofixWriteValidation {
  if (writes.length === 0) {
    return invalid("empty", "The fix produced no files to commit. The pull request was not opened.");
  }

  for (const write of writes) {
    const path = write.filePath.replace(/\\/g, "/");
    if (!path || path.includes("..")) {
      return invalid(
        "unsafe-path",
        `Generated path ${write.filePath} is outside the repository. The pull request was not opened.`,
        write.filePath
      );
    }
    if (write.content.includes("\u0000")) {
      return invalid(
        "binary",
        `Generated ${write.filePath} contains binary data. The pull request was not opened.`,
        write.filePath
      );
    }

    if (/\.json$/i.test(path)) {
      const json = validateJson(path, write.content);
      if (!json.ok) return json;
      continue;
    }

    if (/^\.env(?:\.|$)/i.test(path.split("/").pop() ?? "")) {
      continue;
    }

    const syntax = validateSyntax(path, write.content);
    if (!syntax.ok) return syntax;

    const action = validateServerAction(path, write.content);
    if (!action.ok) return action;

    const boundaries = validateActionTypeBoundaries(path, write.content);
    if (!boundaries.ok) return boundaries;

    const client = validateClientPatch(path, write.content);
    if (!client.ok) return client;
  }

  const cross = validateCrossFile(writes);
  if (!cross.ok) return cross;
  const callBoundaries = validateClientActionCallBoundaries(writes);
  if (!callBoundaries.ok) return callBoundaries;
  return validateInMemoryTypecheck(writes);
}

function skipString(source: string, start: number): number {
  const quote = source[start];
  if (quote !== '"' && quote !== "'" && quote !== "`") return start;
  let index = start + 1;
  while (index < source.length) {
    const char = source[index];
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === quote) return index + 1;
    index += 1;
  }
  return source.length;
}

function skipParens(source: string, openIndex: number): number {
  if (source[openIndex] !== "(") return openIndex;
  let depth = 0;
  let index = openIndex;
  while (index < source.length) {
    const char = source[index];
    if (char === '"' || char === "'" || char === "`") {
      index = skipString(source, index);
      continue;
    }
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
    index += 1;
  }
  return source.length;
}

function stripSecureQueryChains(content: string): string {
  const pattern = /\bsecureQuery\d*\s*\(/g;
  let output = "";
  let last = 0;
  for (const match of content.matchAll(pattern)) {
    const open = match.index + match[0].length - 1;
    const callEnd = skipParens(content, open);
    let cursor = callEnd;
    let chained = false;
    while (true) {
      const chain = /^\s*\.\s*[A-Za-z_$][\w$]*\s*\(/.exec(content.slice(cursor));
      if (!chain) break;
      chained = true;
      cursor = skipParens(content, cursor + chain[0].length - 1);
    }
    output += content.slice(last, callEnd);
    last = chained ? cursor : callEnd;
  }
  output += content.slice(last);
  return output;
}

function ensureSecureQueryImport(content: string): string {
  if (SECURE_QUERY_IMPORT_RE.test(content)) return content;
  const names = [...content.matchAll(/\b(secureQuery\d*)\s*\(/g)].map((match) => match[1]).filter((name): name is string => Boolean(name));
  const unique = [...new Set(names)];
  if (unique.length === 0) return content;
  const line = `import { ${unique.join(", ")} } from "@/app/actions/secure-query";`;
  const lines = content.split("\n");
  let insertAt = 0;
  for (let cursor = 0; cursor < Math.min(lines.length, 20); cursor += 1) {
    if (/['"]use client['"]/.test(lines[cursor] ?? "")) {
      insertAt = cursor + 1;
      break;
    }
  }
  lines.splice(insertAt, 0, line);
  return lines.join("\n");
}

function ensureUseServer(content: string): string {
  if (/["']use server["']/.test(content)) return content;
  return `"use server";\n\n${content.replace(/^\uFEFF/, "")}`;
}

function ensureCreateClientImport(content: string): string {
  const importPattern = new RegExp(
    `from\\s+["']${SUPABASE_SERVER_IMPORT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`
  );
  if (importPattern.test(content)) return content;
  const line = `import { createClient } from "${SUPABASE_SERVER_IMPORT}";`;
  const useServer = content.match(/['"]use server['"];?\s*/);
  if (useServer?.index === undefined) return `${line}\n${content}`;
  const insertAt = useServer.index + useServer[0].length;
  const gap = content[insertAt] === "\n" ? "" : "\n";
  return `${content.slice(0, insertAt)}${gap}${line}\n${content.slice(insertAt)}`;
}

function repairMissingSupportFiles(writes: readonly AutofixWriteFile[]): AutofixWriteFile[] {
  const missing = missingSupportingHelperWrites(writes);
  if (missing.length === 0) return writes.map((write) => ({ ...write }));
  const byPath = new Set(writes.map((write) => write.filePath.replace(/\\/g, "/")));
  const extras = missing.filter((helper) => !byPath.has(helper.filePath.replace(/\\/g, "/")));
  return [...writes.map((write) => ({ ...write })), ...extras];
}

const AUTH_BLOCK = [
  "  const {",
  "    data: { user },",
  "  } = await supabase.auth.getUser();",
  "  if (!user) {",
  '    return { data: null, error: { message: "Unauthorized", details: "", hint: "", code: "401" } };',
  "  }",
].join("\n");

function ensureGetUser(content: string): string {
  if (/\.auth\.getUser\s*\(/.test(content)) return content;
  const call = content.match(/^[ \t]*const supabase = await createClient\(\);.*$/m);
  if (call && call.index !== undefined) {
    const insertAt = call.index + call[0].length;
    return `${content.slice(0, insertAt)}\n${AUTH_BLOCK}${content.slice(insertAt)}`;
  }
  const signature = content.match(/export\s+async\s+function\s+secureQuery\d*\s*\([^)]*\)\s*\{/);
  if (!signature || signature.index === undefined) return content;
  const insertAt = signature.index + signature[0].length;
  const setup = `\n  const supabase = await createClient();\n${AUTH_BLOCK}`;
  return `${content.slice(0, insertAt)}${setup}${content.slice(insertAt)}`;
}

function rewriteSupabaseReturn(content: string): string {
  if (!/supabase\s*\.\s*from\s*\(/.test(content)) return content;
  if (/const\s+\{\s*data\s*,\s*error\s*\}\s*=\s*await/.test(content) && /return\s+\{\s*data\s*,\s*error\s*\}/.test(content)) {
    return content;
  }
  const pattern = /return\s+(?:await\s+)?supabase\s*\.\s*from\s*\(/g;
  let output = "";
  let last = 0;
  for (const match of content.matchAll(pattern)) {
    const fromOpen = match.index + match[0].lastIndexOf("(");
    let cursor = skipParens(content, fromOpen);
    while (true) {
      const chain = /^\s*\.\s*[A-Za-z_$][\w$]*\s*\(/.exec(content.slice(cursor));
      if (!chain) break;
      cursor = skipParens(content, cursor + chain[0].length - 1);
    }
    if (content[cursor] === ";") cursor += 1;
    const expression = content.slice(match.index + match[0].search(/supabase/), cursor).replace(/;\s*$/, "");
    const indent = /\n?([ \t]*)$/.exec(content.slice(0, match.index))?.[1] ?? "";
    output += content.slice(last, match.index);
    output += `${indent}const { data, error } = await ${expression};\n${indent}return { data, error };`;
    last = cursor;
  }
  output += content.slice(last);
  return output;
}

/** Drop auth-bound `user` params that collide with getUser() and break property access. */
function stripConflictingUserParams(content: string): { content: string; removed: string[] } {
  const removed: string[] = [];
  const next = content.replace(
    /export\s+async\s+function\s+(secureQuery\d*)\s*\(([^)]*)\)/g,
    (full, name: string, params: string) => {
      if (!/\buser\s*:/.test(params)) return full;
      removed.push(name);
      const cleaned = params
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0 && !/^user\s*:/.test(part))
        .join(", ");
      return `export async function ${name}(${cleaned})`;
    }
  );
  return { content: next, removed };
}

function dropAuthUserCallArgs(content: string, actionNames: readonly string[]): string {
  if (actionNames.length === 0) return content;
  let next = content;
  for (const name of actionNames) {
    next = next.replace(new RegExp(`\\b${name}\\s*\\(\\s*user(?:\\.id)?\\s*\\)`, "g"), `${name}()`);
  }
  return next;
}

/** Old generator turned `.eq("id", profile.id)` into `String(profile).id` — undo that. */
function repairMangledStringCoercion(content: string): string {
  return content.replace(
    /(\b[A-Za-z_$][\w$]*)\s*==\s*null\s*\?\s*undefined\s*:\s*String\(\1\)((?:\s*\.\s*[A-Za-z_$][\w$]*)+)/g,
    (_full, root: string, chain: string) => {
      const props = [...chain.matchAll(/[A-Za-z_$][\w$]*/g)].map((match) => match[0] ?? "").filter(Boolean);
      if (props.length === 0) return `${root} == null ? undefined : String(${root})`;
      const optional = `${root}${props.map((prop) => `?.${prop}`).join("")}`;
      const solid = `${root}${props.map((prop) => `.${prop}`).join("")}`;
      return `${optional} == null ? undefined : String(${solid})`;
    }
  );
}

function inferObjectTypeFromPaths(paths: string[][]): string {
  type Nested = { [key: string]: Nested | "string" };
  const root: Nested = {};
  for (const path of paths) {
    let node = root;
    for (let index = 0; index < path.length; index += 1) {
      const key = path[index];
      if (!key) continue;
      if (index === path.length - 1) {
        if (typeof node[key] !== "object") node[key] = "string";
      } else {
        if (!node[key] || node[key] === "string") node[key] = {};
        node = node[key] as Nested;
      }
    }
  }
  const render = (node: Nested): string =>
    `{ ${Object.entries(node)
      .map(([key, value]) => (value === "string" ? `${key}: string` : `${key}: ${render(value)}`))
      .join("; ")} }`;
  return render(root);
}

/**
 * Retype scalar params that are clearly objects/arrays in the query body, and
 * coerce bare `.eq()` args so Supabase receives `string | undefined`.
 */
function repairActionParamTypesAndFilters(content: string): string {
  return content.replace(
    /export\s+async\s+function\s+(secureQuery\d*)\s*\(([^)]*)\)\s*\{([\s\S]*?)(?=\nexport\s+async\s+function\s+secureQuery|\n*$)/g,
    (full, name: string, params: string, body: string) => {
      // Unmangle `String(param).prop` before inferring types from property access.
      const nextBodySeed = repairMangledStringCoercion(body);
      if (!params.trim()) {
        const nextBody = normalizeSupabaseFilterExpression(nextBodySeed);
        if (nextBody === body) return full;
        return `export async function ${name}() {${nextBody}`;
      }
      const parts = params.split(",").map((part) => part.trim()).filter(Boolean);
      const nextParts = parts.map((part) => {
        const match = /^([A-Za-z_$][\w$]*)\s*:\s*(.+)$/.exec(part);
        if (!match) return part;
        const paramName = match[1] ?? "";
        const type = match[2]?.trim() ?? "";
        if (!paramName) return part;

        const propPaths = [
          ...nextBodySeed.matchAll(
            new RegExp(`\\b${paramName}\\s*((?:\\?\\.\\s*[A-Za-z_$][\\w$]*|\\.\\s*[A-Za-z_$][\\w$]*)+)`, "g")
          ),
        ]
          .map((entry) =>
            [...(entry[1] ?? "").matchAll(/[A-Za-z_$][\w$]*/g)].map((token) => token[0] ?? "").filter(Boolean)
          )
          .filter((path) => path.length > 0);
        if (propPaths.length > 0) {
          return `${paramName}: ${inferObjectTypeFromPaths(propPaths)} | undefined`;
        }

        if (
          new RegExp(`\\.\\s*in\\s*\\(\\s*(['\`"][^'\`"]+['\`"])\\s*,\\s*${paramName}\\b`).test(nextBodySeed) &&
          !/string\s*\[\]|readonly\s+string\s*\[\]/.test(type)
        ) {
          return `${paramName}: readonly string[] | undefined`;
        }

        const usedInIsDirect = new RegExp(
          `\\.\\s*is\\s*\\(\\s*(['\`"][^'\`"]+['\`"])\\s*,\\s*${paramName}\\b`
        ).test(nextBodySeed);
        const looksBoolean =
          /^(?:is|has|can|should)[A-Z_][\w$]*$/.test(paramName) ||
          /^(?:active|enabled|disabled|visible|published|verified|deleted|open|closed)$/i.test(
            paramName
          );
        const usedInEqAsBool =
          looksBoolean &&
          new RegExp(`\\.\\s*eq\\s*\\(\\s*(['\`"][^'\`"]+['\`"])\\s*,\\s*${paramName}\\b`).test(
            nextBodySeed
          );
        if (usedInIsDirect || usedInEqAsBool) {
          return `${paramName}: boolean | null | undefined`;
        }

        if (/string\s*\|\s*number\s*\|\s*boolean\s*\|\s*null/.test(type)) {
          return `${paramName}: string | undefined`;
        }
        return part;
      });

      // Shared normalizer handles bool/null→`.is`, number literals, and string coercion.
      const nextBody = normalizeSupabaseFilterExpression(nextBodySeed);

      return `export async function ${name}(${nextParts.join(", ")}) {${nextBody}`;
    }
  );
}

function repairUnauthorizedErrorShape(content: string): string {
  return content.replace(
    /return\s*\{\s*data\s*:\s*null\s*,\s*error\s*:\s*\{\s*message\s*:\s*["']Unauthorized["']\s*\}\s*\}/g,
    'return { data: null, error: { message: "Unauthorized", details: "", hint: "", code: "401" } }'
  );
}

function repairOkFalseCatchReturn(content: string): string {
  return content.replace(
    /return\s+\{\s*ok\s*:\s*false\s*,\s*message\s*:\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\s*\}\s*;/g,
    'return { data: null, error: { message: $1, details: "", hint: "", code: "500" } };'
  );
}

function repairActionFile(content: string): string {
  const stripped = stripConflictingUserParams(content).content;
  const typed = repairActionParamTypesAndFilters(stripped);
  const shaped = repairUnauthorizedErrorShape(typed);
  const consistent = repairOkFalseCatchReturn(shaped);
  return rewriteSupabaseReturn(ensureGetUser(ensureCreateClientImport(ensureUseServer(consistent))));
}

function repairClientFile(content: string, removedUserParams: readonly string[] = []): string {
  return ensureSecureQueryImport(dropAuthUserCallArgs(stripSecureQueryChains(content), removedUserParams));
}

const REPAIRABLE = new Set<AutofixValidationCode>([
  "missing-use-server",
  "missing-create-client-import",
  "missing-get-user",
  "missing-data-error",
  "chained-query",
  "missing-secure-query-import",
  "missing-support-file",
  "duplicate-user-binding",
  "type-boundary",
  "typecheck",
]);

/**
 * Template patches are deterministic, so a failed check is repaired in place
 * from the validator code instead of being sent back to a model.
 */
export function repairAutofixWrites(
  writes: readonly AutofixWriteFile[],
  failure: Extract<AutofixWriteValidation, { ok: false }>
): AutofixWriteFile[] {
  if (!REPAIRABLE.has(failure.code)) return writes.map((write) => ({ ...write }));

  if (failure.code === "missing-support-file") {
    return repairMissingSupportFiles(writes);
  }

  const removedUserParams: string[] = [];
  const withActions = writes.map((write) => {
    const path = write.filePath.replace(/\\/g, "/");
    if (!isActionPath(path)) return write;
    const stripped = stripConflictingUserParams(write.content);
    removedUserParams.push(...stripped.removed);
    return { ...write, content: repairActionFile(stripped.content) };
  });

  const repaired = withActions.map((write) => {
    const path = write.filePath.replace(/\\/g, "/");
    if (isActionPath(path)) return write;
    if (/\.(?:ts|tsx|js|jsx)$/i.test(path)) {
      return { ...write, content: repairClientFile(write.content, removedUserParams) };
    }
    return { ...write };
  });

  return repairMissingSupportFiles(repaired);
}

/** Validate, repair, and re-check. Stops at the first clean pass, or after 3 failures. */
export function healAutofixWrites(
  writes: readonly AutofixWriteFile[],
  maxAttempts = MAX_HEAL_ATTEMPTS
): AutofixHealResult {
  let current = writes.map((write) => ({ ...write }));
  let lastMessage = "The generated fix failed validation. The pull request was not opened.";
  const limit = Math.max(1, maxAttempts);

  for (let attempt = 1; attempt <= limit; attempt += 1) {
    const validation = validateAutofixWrites(current);
    if (validation.ok) return { ok: true, writes: current, attempts: attempt };
    lastMessage = validation.message;
    if (attempt === limit) break;
    current = repairAutofixWrites(current, validation);
  }

  return { ok: false, message: lastMessage, attempts: limit };
}

/**
 * Heal template patches, then run `npx tsc --noEmit` on the bundled payload.
 * A TypeScript failure reverts temp/workDir file changes and aborts the PR.
 */
export async function finalizeAutofixWrites(
  writes: readonly AutofixWriteFile[],
  options?: { maxAttempts?: number; workDir?: string }
): Promise<AutofixHealResult> {
  const healed = healAutofixWrites(writes, options?.maxAttempts);
  if (!healed.ok) return healed;

  try {
    const { assertAutofixTscPreflightPasses } = await import("@/lib/autofix-tsc-preflight");
    await assertAutofixTscPreflightPasses(healed.writes, { workDir: options?.workDir });
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Pre-flight `npx tsc --noEmit` failed. The pull request was not opened.",
      attempts: healed.attempts,
    };
  }
  return healed;
}
