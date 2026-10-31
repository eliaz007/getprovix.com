import fs from "node:fs";
import path from "node:path";
import { missingErrorHandlingViolations } from "../src/lib/firewall-error-handling";
import { runSecuritySuiteScan } from "../src/lib/scanner/security-suite";

type IngestedFile = {
  filePath: string;
  extension: string;
  lineCount: number;
  charCount: number;
  imports: string[];
  rawContent: string;
};

type ReportFile = Omit<IngestedFile, "rawContent">;

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

type Violation = {
  filePath: string;
  severity: Severity;
  rule: string;
  message: string;
  line: number;
  category?: "SECRET_LEAK" | "CLIENT_DB_EXPOSURE" | "VULNERABLE_DEPENDENCY";
  snippet?: string;
  remediation?: {
    diff: string;
    command?: string;
    envExample?: string;
  };
};

type ImportStatement = {
  lines: string[];
  specifier: string;
  line: number;
};

type ModuleEdge = {
  to: string;
  line: number;
  /** Type-only edges stay in the orphan graph and are skipped for runtime cycles. */
  typeOnly: boolean;
};

type AuditReport = {
  timestamp: string;
  architectureScore: number;
  summary: {
    totalFiles: number;
    totalLines: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
  };
  violations: Violation[];
  files: ReportFile[];
};

const IGNORED_DIRECTORIES = new Set(["node_modules", ".next", ".git", "dist"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const FRAMEWORK_ENTRY_BASENAMES = new Set([
  "page.tsx",
  "page.ts",
  "layout.tsx",
  "layout.ts",
  "route.ts",
  "route.tsx",
  "loading.tsx",
  "loading.ts",
  "error.tsx",
  "error.ts",
  "middleware.ts",
  "middleware.tsx",
  "proxy.ts",
  "proxy.tsx",
]);
const SCORE_RULES: Record<Severity, { each: number; max?: number }> = {
  CRITICAL: { each: 20, max: 60 },
  HIGH: { each: 10, max: 30 },
  // 1.25 points each, with no ceiling: 48 bloated files score 40, and further files keep falling.
  MEDIUM: { each: 1.25 },
  LOW: { each: 0.5 },
};
const ORPHAN_CONFIG_BASENAMES = new Set([
  "next.config.ts",
  "tailwind.config.ts",
  "vitest.config.ts",
  "postcss.config.mjs",
  "next-env.d.ts",
  "robots.ts",
  "sitemap.ts",
  "not-found.tsx",
  "actions.ts",
]);
const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};
const BLOAT_LINE_LIMIT = 350;
const BLOAT_IMPORT_LIMIT = 15;
const SERVICE_CLIENT_NAME =
  /^(createServiceRoleClient|supabaseAdmin|adminClient|serviceRoleClient)$/;
const SERVICE_ROLE_MODULE =
  /(?:^|\/)(?:service-role|serviceRole|supabase-admin|supabase\/admin)(?:\.tsx?)?$/;
const SERVICE_KEY_TOKEN = /\b(SUPABASE_SERVICE_ROLE(?:_KEY)?|SERVICE_ROLE_KEY)\b/g;
const SERVICE_KEY_CALL = /\bcreateServiceRoleClient\s*\(/;
const RAW_SQL =
  /(?:^|[^.\w])sql\s*`|\b(?:db|postgres|pool|sql)\s*\.\s*(?:query|execute|unsafe|raw)\s*\(/;
const ENV_DOT = /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g;
const ENV_BRACKET = /process\.env\[\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]\s*\]/g;
const REEXPORT_FROM =
  /\bexport\s+(?:type\s+)?(?:\*|\{[\s\S]*?\})\s+from\s+['"]([^'"]+)['"]/g;

const projectRoot = process.cwd();
const targetDir = path.resolve(projectRoot, process.argv[2] ?? ".");
const snapshotPath = path.join(projectRoot, "scripts", "ingestion-snapshot.json");
const reportPath = path.join(projectRoot, "scripts", "audit-report.json");

function isHidden(name: string): boolean {
  return name.startsWith(".");
}

function toProjectPath(absolutePath: string): string {
  return path.relative(projectRoot, absolutePath).split(path.sep).join("/");
}

function countLines(content: string): number {
  if (content.length === 0) return 0;
  const lines = content.split(/\r?\n/);
  if (lines[lines.length - 1] === "") lines.pop();
  return lines.length;
}

function lineHasFromClause(line: string): boolean {
  return /\bfrom\s+['"][^'"]+['"]/.test(line);
}

function isSideEffectImport(trimmed: string): boolean {
  return /^import\s+['"][^'"]+['"]\s*;?\s*$/.test(trimmed);
}

function startsImportStatement(trimmed: string): boolean {
  return /^import\s/.test(trimmed) || /^import\{/.test(trimmed);
}

function isCommentLine(trimmed: string): boolean {
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/*")
  );
}

function specifierIn(text: string): string | null {
  const match = text.match(/\bfrom\s+['"]([^'"]+)['"]/);
  return match?.[1] ?? null;
}

function extractImportStatements(content: string): ImportStatement[] {
  const sourceLines = content.split(/\r?\n/);
  const statements: ImportStatement[] = [];
  let block: string[] | null = null;
  let blockStart = 1;

  const closeBlockIfComplete = () => {
    if (!block) return;
    const specifier = specifierIn(block.join("\n"));
    if (!specifier) return;
    statements.push({ lines: block, specifier, line: blockStart });
    block = null;
  };

  for (let index = 0; index < sourceLines.length; index += 1) {
    const line = sourceLines[index] ?? "";
    const lineNumber = index + 1;

    if (block) {
      block.push(line);
      closeBlockIfComplete();
      continue;
    }

    const trimmed = line.trim();
    if (isCommentLine(trimmed) || !startsImportStatement(trimmed)) continue;
    if (isSideEffectImport(trimmed)) continue;

    if (lineHasFromClause(line)) {
      const specifier = specifierIn(line);
      if (specifier) statements.push({ lines: [line], specifier, line: lineNumber });
      continue;
    }

    block = [line];
    blockStart = lineNumber;
  }

  return statements;
}

/** Collect every source line that belongs to an `import ... from ...` statement. */
function extractImportLines(content: string): string[] {
  return extractImportStatements(content).flatMap((statement) => statement.lines);
}

function collectSourceFiles(directory: string, found: string[]): void {
  const entries = fs.readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (isHidden(entry.name) || IGNORED_DIRECTORIES.has(entry.name)) continue;

    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      collectSourceFiles(absolutePath, found);
      continue;
    }

    if (!entry.isFile()) continue;

    const extension = path.extname(entry.name);
    if (SOURCE_EXTENSIONS.has(extension)) found.push(absolutePath);
  }
}

function ingestFile(absolutePath: string): IngestedFile {
  const rawContent = fs.readFileSync(absolutePath, "utf8");
  const extension = path.extname(absolutePath);

  return {
    filePath: toProjectPath(absolutePath),
    extension,
    lineCount: countLines(rawContent),
    charCount: rawContent.length,
    imports: extractImportLines(rawContent),
    rawContent,
  };
}

function codePortion(line: string): string {
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const previous = index > 0 ? line[index - 1] : "";
    if (char === "'" && !inDouble && !inTemplate && previous !== "\\") inSingle = !inSingle;
    else if (char === '"' && !inSingle && !inTemplate && previous !== "\\") inDouble = !inDouble;
    else if (char === "`" && !inSingle && !inDouble && previous !== "\\") inTemplate = !inTemplate;
    else if (char === "/" && line[index + 1] === "/" && !inSingle && !inDouble && !inTemplate) {
      return line.slice(0, index);
    }
  }

  return line;
}

function executableLines(content: string): Array<{ text: string; line: number }> {
  const lines = content.split(/\r?\n/);
  const executable: Array<{ text: string; line: number }> = [];
  let inBlock = false;

  for (let index = 0; index < lines.length; index += 1) {
    let text = lines[index] ?? "";

    if (inBlock) {
      const end = text.indexOf("*/");
      if (end === -1) continue;
      text = text.slice(end + 2);
      inBlock = false;
    }

    const start = text.indexOf("/*");
    if (start !== -1) {
      const end = text.indexOf("*/", start + 2);
      if (end === -1) {
        text = text.slice(0, start);
        inBlock = true;
      } else {
        text = text.slice(0, start) + text.slice(end + 2);
      }
    }

    executable.push({ text: codePortion(text), line: index + 1 });
  }

  return executable;
}

function hasDirective(content: string, directive: "use client" | "use server"): boolean {
  return executableLines(content).some(({ text }) => {
    const trimmed = text.trim();
    return (
      trimmed === `'${directive}'` ||
      trimmed === `"${directive}"` ||
      trimmed === `'${directive}';` ||
      trimmed === `"${directive}";`
    );
  });
}

function isRouteModule(filePath: string): boolean {
  return /(?:^|\/)route\.tsx?$/.test(filePath);
}

function isAppOrComponents(filePath: string): boolean {
  return filePath.split("/").some((part) => part === "app" || part === "components");
}

function isClientBoundary(file: IngestedFile): boolean {
  if (hasDirective(file.rawContent, "use client")) return true;
  if (hasDirective(file.rawContent, "use server") || isRouteModule(file.filePath)) return false;
  return isAppOrComponents(file.filePath);
}

function boundaryLabel(file: IngestedFile): string {
  if (hasDirective(file.rawContent, "use client")) return "Client component (`use client`)";
  return "Module in app/ or components/ that is not a server action or route";
}

function isTypeOnlyImport(statement: string): boolean {
  return /^\s*import\s+type\b/.test(statement);
}

/** `import type` and `import { type X }` bindings are erased and cannot cycle at runtime. */
function isPureTypeImport(statement: string): boolean {
  if (isTypeOnlyImport(statement)) return true;
  if (!/^\s*import\s+\{/.test(statement)) return false;
  const named = statement.match(/\{([\s\S]*)\}/);
  if (!named?.[1]) return false;
  const parts = named[1]
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every((part) => /^type\s+/.test(part));
}

function isPureTypeReexport(statement: string): boolean {
  if (/^\s*export\s+type\b/.test(statement)) return true;
  if (!/^\s*export\s+\{/.test(statement)) return false;
  const named = statement.match(/\{([\s\S]*)\}/);
  if (!named?.[1]) return false;
  const parts = named[1]
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every((part) => /^type\s+/.test(part));
}

function importedBindings(statement: string): Array<{ imported: string; local: string }> {
  if (isTypeOnlyImport(statement)) return [];

  const bindings: Array<{ imported: string; local: string }> = [];
  const namespace = statement.match(/^\s*import\s+\*\s+as\s+(\w+)\s+from\b/);
  if (namespace?.[1]) {
    bindings.push({ imported: "*", local: namespace[1] });
    return bindings;
  }

  const addNamed = (body: string) => {
    for (const part of body.split(",")) {
      const trimmed = part.trim();
      if (!trimmed || /^type\s+/.test(trimmed)) continue;
      const match = trimmed.match(/^(\w+)(?:\s+as\s+(\w+))?$/);
      if (!match?.[1]) continue;
      bindings.push({ imported: match[1], local: match[2] ?? match[1] });
    }
  };

  const withNamed = statement.match(/^\s*import\s+(?!type\b)(\w+)\s*,\s*\{([\s\S]*)\}\s*from\b/);
  const namedOnly = statement.match(/^\s*import\s+\{([\s\S]*)\}\s*from\b/);
  const defaultOnly = statement.match(/^\s*import\s+(?!type\b)(\w+)\s+from\b/);

  if (withNamed?.[1] && withNamed[2] !== undefined) {
    bindings.push({ imported: withNamed[1], local: withNamed[1] });
    addNamed(withNamed[2]);
  } else if (namedOnly?.[1]) {
    addNamed(namedOnly[1]);
  } else if (defaultOnly?.[1]) {
    bindings.push({ imported: defaultOnly[1], local: defaultOnly[1] });
  }

  return bindings;
}

function isAdminOrServiceImport(statement: string, specifier: string): boolean {
  if (isTypeOnlyImport(statement)) return false;
  const bindings = importedBindings(statement);
  const importsServiceClient = bindings.some(
    (binding) => SERVICE_CLIENT_NAME.test(binding.imported) || SERVICE_CLIENT_NAME.test(binding.local)
  );
  if (importsServiceClient) return true;
  if (SERVICE_ROLE_MODULE.test(specifier) && bindings.length > 0) return true;

  if (specifier !== "@supabase/supabase-js") return false;
  return bindings.some((binding) => binding.imported === "createClient" || binding.imported === "*");
}

function isUnsafeEnvName(name: string): boolean {
  if (!name.startsWith("NEXT_PUBLIC_")) return true;
  return /SERVICE_ROLE|SECRET|PRIVATE_KEY/.test(name);
}

function boundaryViolations(file: IngestedFile): Violation[] {
  if (!isClientBoundary(file)) return [];

  const violations: Violation[] = [];
  const seen = new Set<string>();
  const label = boundaryLabel(file);
  const statements = extractImportStatements(file.rawContent);

  for (const statement of statements) {
    if (!isAdminOrServiceImport(statementText(statement), statement.specifier)) continue;
    const key = `import:${statement.specifier}:${statement.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    violations.push({
      filePath: file.filePath,
      severity: "CRITICAL",
      rule: "Boundary Violation",
      line: statement.line,
      message: `${label} directly imports an admin/service-role client from \`${statement.specifier}\`.`,
    });
  }

  for (const entry of executableLines(file.rawContent)) {
    ENV_DOT.lastIndex = 0;
    ENV_BRACKET.lastIndex = 0;
    const names = [
      ...entry.text.matchAll(ENV_DOT),
      ...entry.text.matchAll(ENV_BRACKET),
    ];

    for (const match of names) {
      const name = match[1];
      if (!name || !isUnsafeEnvName(name)) continue;
      const key = `env:${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const reason = name.startsWith("NEXT_PUBLIC_")
        ? "which publishes a secret or service key to the browser"
        : "which does not start with NEXT_PUBLIC_";
      violations.push({
        filePath: file.filePath,
        severity: "CRITICAL",
        rule: "Boundary Violation",
        line: entry.line,
        message: `${label} reads \`process.env.${name}\`, ${reason}.`,
      });
    }

    SERVICE_KEY_TOKEN.lastIndex = 0;
    for (const serviceKey of entry.text.matchAll(SERVICE_KEY_TOKEN)) {
      const token = serviceKey[1];
      if (!token) continue;
      const key = `service:${token}`;
      if (seen.has(key)) continue;
      seen.add(key);
      violations.push({
        filePath: file.filePath,
        severity: "CRITICAL",
        rule: "Boundary Violation",
        line: entry.line,
        message: `${label} executes a service-key operation (\`${token}\`).`,
      });
    }

    if (SERVICE_KEY_CALL.test(entry.text)) {
      const key = "service-call";
      if (!seen.has(key)) {
        seen.add(key);
        violations.push({
          filePath: file.filePath,
          severity: "CRITICAL",
          rule: "Boundary Violation",
          line: entry.line,
          message: `${label} executes a service-key operation (\`createServiceRoleClient\`).`,
        });
      }
    }

    if (RAW_SQL.test(entry.text)) {
      const key = "sql";
      if (!seen.has(key)) {
        seen.add(key);
        violations.push({
          filePath: file.filePath,
          severity: "CRITICAL",
          rule: "Boundary Violation",
          line: entry.line,
          message: `${label} executes raw SQL.`,
        });
      }
    }
  }

  return violations;
}

function statementText(statement: ImportStatement): string {
  return statement.lines.join("\n");
}

function bloatViolations(file: IngestedFile, statements: ImportStatement[]): Violation[] {
  const distinct: ImportStatement[] = [];
  const seen = new Set<string>();
  for (const statement of statements) {
    if (seen.has(statement.specifier)) continue;
    seen.add(statement.specifier);
    distinct.push(statement);
  }

  const tooLong = file.lineCount > BLOAT_LINE_LIMIT;
  const tooManyImports = distinct.length > BLOAT_IMPORT_LIMIT;
  if (!tooLong && !tooManyImports) return [];

  const reasons: string[] = [];
  if (tooLong) {
    reasons.push(`${file.lineCount.toLocaleString("en-US")} lines (limit ${BLOAT_LINE_LIMIT})`);
  }
  if (tooManyImports) {
    reasons.push(`${distinct.length} distinct imports (limit ${BLOAT_IMPORT_LIMIT})`);
  }

  const overflow = distinct[BLOAT_IMPORT_LIMIT];
  const line = !tooLong && overflow ? overflow.line : 1;

  return [
    {
      filePath: file.filePath,
      severity: "MEDIUM",
      rule: "Architectural Bloat",
      line,
      message: `Architectural bloat: ${reasons.join("; ")}.`,
    },
  ];
}

function lookupKnown(candidate: string, knownByLower: Map<string, string>): string | null {
  return knownByLower.get(candidate.toLowerCase()) ?? null;
}

function resolveSpecifier(
  fromFile: string,
  specifier: string,
  knownByLower: Map<string, string>
): string | null {
  let absoluteBase: string;
  if (specifier.startsWith("@/")) {
    absoluteBase = path.join(projectRoot, "src", specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    absoluteBase = path.resolve(projectRoot, path.dirname(fromFile), specifier);
  } else {
    return null;
  }

  const withoutJs = absoluteBase.replace(/\.js$/, "");
  const bases = withoutJs === absoluteBase ? [absoluteBase] : [absoluteBase, withoutJs];
  const candidates: string[] = [];
  for (const base of bases) {
    candidates.push(
      base,
      `${base}.ts`,
      `${base}.tsx`,
      `${base}.js`,
      `${base}.jsx`,
      path.join(base, "index.ts"),
      path.join(base, "index.tsx"),
      path.join(base, "index.js"),
      path.join(base, "index.jsx")
    );
  }

  for (const candidate of candidates) {
    const resolved = lookupKnown(toProjectPath(candidate), knownByLower);
    if (resolved) return resolved;
  }

  return null;
}

function sourceForMatching(content: string): string {
  const noBlock = content.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "));
  return noBlock
    .split(/\r?\n/)
    .map((line) => codePortion(line))
    .join("\n");
}

function reexportEdges(
  content: string
): Array<{ specifier: string; line: number; typeOnly: boolean }> {
  const source = sourceForMatching(content);
  const edges: Array<{ specifier: string; line: number; typeOnly: boolean }> = [];
  const pattern = new RegExp(REEXPORT_FROM.source, "g");

  for (const match of source.matchAll(pattern)) {
    const specifier = match[1];
    if (!specifier || match.index === undefined) continue;
    const line = source.slice(0, match.index).split("\n").length;
    edges.push({
      specifier,
      line,
      typeOnly: isPureTypeReexport(match[0] ?? ""),
    });
  }

  return edges;
}

function buildGraph(
  files: IngestedFile[],
  statementsByFile: Map<string, ImportStatement[]>,
  knownByLower: Map<string, string>
): Map<string, ModuleEdge[]> {
  const graph = new Map<string, ModuleEdge[]>();

  for (const file of files) {
    const edges = new Map<string, { line: number; typeOnly: boolean }>();
    const remember = (specifier: string, line: number, typeOnly: boolean) => {
      const resolved = resolveSpecifier(file.filePath, specifier, knownByLower);
      if (!resolved || resolved === file.filePath) return;
      const previous = edges.get(resolved);
      if (!previous) {
        edges.set(resolved, { line, typeOnly });
        return;
      }
      edges.set(resolved, {
        line: line < previous.line ? line : previous.line,
        typeOnly: previous.typeOnly && typeOnly,
      });
    };

    for (const statement of statementsByFile.get(file.filePath) ?? []) {
      remember(
        statement.specifier,
        statement.line,
        isPureTypeImport(statementText(statement))
      );
    }
    for (const edge of reexportEdges(file.rawContent)) {
      remember(edge.specifier, edge.line, edge.typeOnly);
    }

    graph.set(
      file.filePath,
      [...edges.entries()]
        .map(([to, edge]) => ({ to, line: edge.line, typeOnly: edge.typeOnly }))
        .sort((left, right) => left.to.localeCompare(right.to))
    );
  }

  return graph;
}

function canonicalCycle(cycle: string[]): string {
  const body = cycle.slice(0, -1);
  let start = 0;
  for (let index = 1; index < body.length; index += 1) {
    if ((body[index] ?? "") < (body[start] ?? "")) start = index;
  }
  const rotated = body.slice(start).concat(body.slice(0, start));
  return [...rotated, rotated[0] ?? ""].join(" -> ");
}

function cycleViolations(graph: Map<string, ModuleEdge[]>): Violation[] {
  const violations: Violation[] = [];
  const seen = new Set<string>();
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  const dfs = (node: string) => {
    visiting.add(node);
    stack.push(node);

    for (const edge of graph.get(node) ?? []) {
      if (edge.typeOnly) continue;
      if (!visiting.has(edge.to)) {
        if (!visited.has(edge.to)) dfs(edge.to);
        continue;
      }

      const start = stack.indexOf(edge.to);
      if (start === -1) continue;
      const cycle = stack.slice(start).concat(edge.to);
      const description = canonicalCycle(cycle);
      if (seen.has(description)) continue;
      seen.add(description);

      const cycleNodes = description.split(" -> ");
      const origin = cycleNodes[0] ?? edge.to;
      const next = cycleNodes[1] ?? origin;
      const originLine = (graph.get(origin) ?? []).find((item) => item.to === next)?.line ?? edge.line;
      violations.push({
        filePath: origin,
        severity: "HIGH",
        rule: "Circular Dependency",
        line: originLine,
        message: `Circular import: ${description}`,
      });
    }

    stack.pop();
    visiting.delete(node);
    visited.add(node);
  };

  for (const node of [...graph.keys()].sort()) {
    if (!visited.has(node)) dfs(node);
  }

  return violations;
}

function isTestModule(filePath: string): boolean {
  const base = filePath.split("/").pop() ?? filePath;
  return (
    filePath.split("/").includes("__tests__") ||
    base.endsWith(".test.ts") ||
    base.endsWith(".test.tsx") ||
    base.endsWith(".spec.ts")
  );
}

function isOrphanExcluded(filePath: string): boolean {
  if (filePath === "scripts" || filePath.startsWith("scripts/")) return true;
  if (isTestModule(filePath)) return true;
  const base = filePath.split("/").pop() ?? filePath;
  return FRAMEWORK_ENTRY_BASENAMES.has(base) || ORPHAN_CONFIG_BASENAMES.has(base);
}

function orphanViolations(files: IngestedFile[], graph: Map<string, ModuleEdge[]>): Violation[] {
  const imported = new Set<string>();
  for (const [from, edges] of graph) {
    for (const edge of edges) {
      if (edge.to !== from) imported.add(edge.to);
    }
  }

  return files
    .filter((file) => !imported.has(file.filePath) && !isOrphanExcluded(file.filePath))
    .map((file) => ({
      filePath: file.filePath,
      severity: "LOW" as const,
      rule: "Dead Weight / Orphaned Code",
      line: 1,
      message: "No other scanned file imports this module.",
    }));
}

function dedupeAndSort(violations: Violation[]): Violation[] {
  const unique = new Map<string, Violation>();
  for (const violation of violations) {
    const key = [
      violation.severity,
      violation.rule,
      violation.filePath,
      String(violation.line),
      violation.message,
    ].join("\0");
    if (!unique.has(key)) unique.set(key, violation);
  }

  return [...unique.values()].sort(
    (left, right) =>
      SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] ||
      left.filePath.localeCompare(right.filePath) ||
      left.line - right.line ||
      left.rule.localeCompare(right.rule) ||
      left.message.localeCompare(right.message)
  );
}

function architectureScore(violations: Violation[]): number {
  const deduction = (Object.keys(SCORE_RULES) as Severity[]).reduce((sum, severity) => {
    const rule = SCORE_RULES[severity];
    const count = violations.filter((violation) => violation.severity === severity).length;
    const raw = count * rule.each;
    return sum + (rule.max === undefined ? raw : Math.min(rule.max, raw));
  }, 0);

  return Math.max(0, Math.round(100 - deduction));
}

function buildReport(files: IngestedFile[], violations: Violation[]): AuditReport {
  const count = (severity: Severity) =>
    violations.filter((violation) => violation.severity === severity).length;

  return {
    timestamp: new Date().toISOString(),
    architectureScore: architectureScore(violations),
    summary: {
      totalFiles: files.length,
      totalLines: files.reduce((sum, file) => sum + file.lineCount, 0),
      criticalCount: count("CRITICAL"),
      highCount: count("HIGH"),
      mediumCount: count("MEDIUM"),
      lowCount: count("LOW"),
    },
    violations,
    files: files.map((file) => ({
      filePath: file.filePath,
      extension: file.extension,
      lineCount: file.lineCount,
      charCount: file.charCount,
      imports: file.imports,
    })),
  };
}

function audit(files: IngestedFile[], includeOrphans = true): Violation[] {
  const knownByLower = new Map(files.map((file) => [file.filePath.toLowerCase(), file.filePath]));
  const statementsByFile = new Map(
    files.map((file) => [file.filePath, extractImportStatements(file.rawContent)])
  );
  const graph = buildGraph(files, statementsByFile, knownByLower);
  const violations = files.flatMap((file) => [
    ...boundaryViolations(file),
    ...bloatViolations(file, statementsByFile.get(file.filePath) ?? []),
    ...missingErrorHandlingViolations(file.filePath, file.rawContent),
  ]);

  violations.push(...cycleViolations(graph));
  if (includeOrphans) violations.push(...orphanViolations(files, graph));
  return dedupeAndSort(violations);
}

export type SourceTextFile = {
  filePath: string;
  content: string;
};

function ingestSourceText(source: SourceTextFile): IngestedFile {
  const filePath = source.filePath.split("\\").join("/");
  return {
    filePath,
    extension: path.posix.extname(filePath),
    lineCount: countLines(source.content),
    charCount: source.content.length,
    imports: extractImportLines(source.content),
    rawContent: source.content,
  };
}

/** Run the firewall rules on source text that was not read from the local disk. */
export function analyzeSourceTexts(
  sources: SourceTextFile[],
  options?: { includeOrphans?: boolean; companionFiles?: SourceTextFile[] }
): AuditReport {
  const files = sources
    .map(ingestSourceText)
    .sort((left, right) => left.filePath.localeCompare(right.filePath));
  const violations = audit(files, options?.includeOrphans !== false);
  const security = runSecuritySuiteScan([
    ...sources.map((source) => ({ filePath: source.filePath, content: source.content })),
    ...(options?.companionFiles ?? []).map((source) => ({
      filePath: source.filePath,
      content: source.content,
    })),
  ]);
  violations.push(
    ...security.map((finding) => ({
      filePath: finding.filePath,
      severity: finding.severity,
      rule: finding.rule,
      message: finding.message,
      line: finding.line,
      category: finding.category,
      snippet: finding.snippet,
      remediation: finding.remediation,
    }))
  );
  return buildReport(files, dedupeAndSort(violations));
}

function printDashboard(files: IngestedFile[], report: AuditReport): void {
  const divider = "-".repeat(78);
  const largest = [...files]
    .sort((left, right) => right.lineCount - left.lineCount || left.filePath.localeCompare(right.filePath))
    .slice(0, 5);
  const labelWidth = 36;

  console.log("");
  console.log("Architecture Firewall");
  console.log(divider);
  console.log(
    `${"Architecture Health Score (0-100)".padEnd(labelWidth)}${report.architectureScore}`
  );
  console.log("");
  console.log("Summary");
  console.log(divider);
  console.log(`${"Files scanned".padEnd(labelWidth)}${report.summary.totalFiles.toLocaleString("en-US")}`);
  console.log(
    `${"Total lines of code".padEnd(labelWidth)}${report.summary.totalLines.toLocaleString("en-US")}`
  );
  console.log(`${"CRITICAL".padEnd(labelWidth)}${report.summary.criticalCount.toLocaleString("en-US")}`);
  console.log(`${"HIGH".padEnd(labelWidth)}${report.summary.highCount.toLocaleString("en-US")}`);
  console.log(`${"MEDIUM".padEnd(labelWidth)}${report.summary.mediumCount.toLocaleString("en-US")}`);
  console.log(`${"LOW".padEnd(labelWidth)}${report.summary.lowCount.toLocaleString("en-US")}`);
  console.log("");
  console.log("Violations");
  console.log(divider);

  if (report.violations.length === 0) {
    console.log("No violations.");
  } else {
    for (const violation of report.violations) {
      console.log(`[${violation.severity}] ${violation.rule}`);
      console.log(`  ${violation.filePath}:${violation.line} — ${violation.message}`);
    }
  }

  console.log("");
  console.log("Top 5 largest files by line count");
  console.log(divider);
  console.log(`${"Lines".padStart(8)}  Path`);
  if (largest.length === 0) {
    console.log("         (no .ts or .tsx files found)");
  } else {
    for (const file of largest) {
      console.log(`${file.lineCount.toLocaleString("en-US").padStart(8)}  ${file.filePath}`);
    }
  }

  console.log(divider);
  console.log(`Snapshot written to ${toProjectPath(snapshotPath)}`);
  console.log(`Audit report written to ${toProjectPath(reportPath)}`);
  console.log("");
}

function main(): void {
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    console.error(`Target directory does not exist: ${targetDir}`);
    process.exit(1);
  }

  const absolutePaths: string[] = [];
  collectSourceFiles(targetDir, absolutePaths);

  const files = absolutePaths
    .map(ingestFile)
    .sort((left, right) => left.filePath.localeCompare(right.filePath));
  const violations = audit(files);
  const report = buildReport(files, violations);

  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  fs.writeFileSync(snapshotPath, `${JSON.stringify(files, null, 2)}\n`, "utf8");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  printDashboard(files, report);
}

const invokedDirectly = (process.argv[1] ?? "").replace(/\\/g, "/").includes("scripts/ingest-engine.");
if (invokedDirectly) main();
