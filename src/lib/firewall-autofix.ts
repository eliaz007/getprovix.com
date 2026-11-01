import path from "node:path";
import type { FirewallAutofixModule } from "@/lib/firewall-contract";
import { applyErrorHandling } from "@/lib/firewall-error-handling";

type Block = {
  name: string;
  exported: boolean;
  isDefault: boolean;
  isType: boolean;
  start: number;
  end: number;
};

type ExportBinding = {
  name: string;
  kind: "value" | "type" | "default";
};

export type AutofixWrite = {
  filePath: string;
  content: string;
};

export type AutofixResult = {
  ok: true;
  filePath: string;
  summary: string;
  diff: string;
  modules: FirewallAutofixModule[];
  canOpenPullRequest: boolean;
};

export type AutofixPlan = AutofixResult & {
  writes: AutofixWrite[];
};

const DECL =
  /^(export\s+default\s+(?:async\s+)?function(?:\s+([A-Za-z0-9_]+))?|export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)|export\s+(?:const|let|var|class|type|interface|enum)\s+([A-Za-z0-9_]+)|(?:async\s+)?function\s+([A-Za-z0-9_]+)|class\s+([A-Za-z0-9_]+)|(?:const|let|var)\s+([A-Za-z0-9_]+)|(?:export\s+)?interface\s+([A-Za-z0-9_]+)|(?:export\s+)?type\s+([A-Za-z0-9_]+))/;

export function buildAutofix(filePath: string, content: string): AutofixResult {
  const plan = planAutofix(filePath, content);
  return {
    ok: plan.ok,
    filePath: plan.filePath,
    summary: plan.summary,
    diff: plan.diff,
    modules: plan.modules,
    canOpenPullRequest: plan.canOpenPullRequest,
  };
}

/** Vitest/Jest specs share closures across helpers — module splits break them. */
export function isTestSourcePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const base = normalized.split("/").pop() ?? normalized;
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(base)) return true;
  return normalized.split("/").some((part) => part === "__tests__" || part === "__mocks__" || part === "tests");
}

/** Leaks / Open Fix: skip findings we refuse to auto-fix (tests / fixtures). */
export function isActionableSecurityFinding(violation: {
  filePath: string;
  category?: string | null;
}): boolean {
  // Open Fix refuses every security category on test paths — don't leave them cluttering Leaks.
  if (isTestSourcePath(violation.filePath)) return false;
  return true;
}

/** Open Fix returned a deliberate refuse — hide the row, don't paint a red error. */
export function isExpectedAutofixRefuse(message: string): boolean {
  return (
    /Test files cannot be auto-split/i.test(message) ||
    /Test files and scanner fixtures are not auto-fixed/i.test(message) ||
    /no safe autofix/i.test(message) ||
    /no safe security fix/i.test(message) ||
    /This file has no safe autofix/i.test(message) ||
    /This finding has no safe security fix/i.test(message) ||
    /failed a syntax check/i.test(message)
  );
}

/**
 * Violations is actionable-only: Architectural Bloat on real app modules can
 * Open Fix (gated by tsc preflight). Tests / orphans / cycles stay hidden.
 */
export function isActionableArchitectureViolation(violation: {
  filePath: string;
  rule: string;
}): boolean {
  if (violation.rule !== "Architectural Bloat") return false;
  if (isTestSourcePath(violation.filePath)) return false;
  return true;
}

/** Suite-style source (even without a .test.ts name) must not be auto-split. */
export function isTestSuiteSource(content: string): boolean {
  if (/\bfrom\s+["'](?:vitest|@jest\/globals|jest)["']/.test(content)) return true;
  if (/\b(?:describe|it|test)\s*\(/.test(content) && /\b(?:expect)\s*\(/.test(content)) return true;
  return false;
}

function refusedPlan(filePath: string, summary: string): AutofixPlan {
  return {
    ok: true,
    filePath,
    summary,
    diff: emptyDiff(filePath),
    modules: [],
    canOpenPullRequest: false,
    writes: [],
  };
}

export function planAutofix(filePath: string, content: string): AutofixPlan {
  const normalized = filePath.replace(/\\/g, "/");
  if (isTestSourcePath(normalized) || isTestSuiteSource(content)) {
    return refusedPlan(
      normalized,
      "Test files are not split into modules. Shared helpers and closures would break typecheck and CI."
    );
  }
  const handled = applyErrorHandling(normalized, content);
  if (handled) {
    const next = handled.endsWith("\n") ? handled : `${handled}\n`;
    return {
      ok: true,
      filePath: normalized,
      summary: "Wrapped unhandled async database and fetch calls in try/catch with an error response.",
      diff: capDiff(fileDiff(normalized, content.split(/\r?\n/), next.split(/\r?\n/))),
      modules: [],
      canOpenPullRequest: true,
      writes: [{ filePath: normalized, content: next }],
    };
  }
  const lines = content.split(/\r?\n/);
  const blocks = topLevelBlocks(lines, lineStartDepths(content));
  if (blocks.length < 2) {
    return refusedPlan(normalized, "No safe top-level split. The file stays one unit, so the diff is empty.");
  }

  const directive = lines.find((line) => /^\s*['"]use (?:client|server)['"];?\s*$/.test(line)) ?? "";
  const preamble = lines.slice(0, blocks[0]?.start ?? 0).filter((line) => line.trim() !== directive.trim());
  const modules = blocks.map((block, index) =>
    renderModule(normalized, lines, block, index, directive, preamble, blocks)
  );

  if (moduleSplitLeavesUnresolvedRefs(modules, blocks)) {
    return refusedPlan(
      normalized,
      "No safe module split: helpers share bindings across closures. Leave the file as one unit."
    );
  }

  const barrel = renderBarrel(normalized, directive, modules);
  const diff = capDiff(
    [
      fileDiff(normalized, lines, barrel.split(/\r?\n/)),
      ...modules.map((mod) => newFileDiff(mod.filePath, mod.content)),
    ].join("\n")
  );

  const writes = [
    { filePath: normalized, content: barrel.endsWith("\n") ? barrel : `${barrel}\n` },
    ...modules.map((mod) => ({ filePath: mod.filePath, content: mod.content })),
  ].filter((file) => safeWritePath(file.filePath));

  return {
    ok: true,
    filePath: normalized,
    summary: `Split ${normalized} into ${modules.length} modules and a barrel file.`,
    diff,
    modules: modules.map(({ filePath: modulePath, exportName, lineCount }) => ({
      filePath: modulePath,
      exportName,
      lineCount,
    })),
    canOpenPullRequest: writes.length > 1,
    writes,
  };
}

/**
 * After a mechanical split, every sibling binding referenced in a module body
 * must be imported. Missing imports are exactly the TS2552 failures Open Fix
 * shipped in broken architecture PRs.
 */
function moduleSplitLeavesUnresolvedRefs(
  modules: Array<{ content: string }>,
  blocks: Block[]
): boolean {
  const siblingNames = blocks
    .map((block) => block.name)
    .filter((name) => name !== "default" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name));

  for (const mod of modules) {
    const defines = new Set(
      collectModuleExports(mod.content)
        .map((binding) => binding.name)
        .filter((name) => name !== "default")
    );
    const code = stripImportLines(mod.content);
    for (const name of siblingNames) {
      if (defines.has(name)) continue;
      if (!new RegExp(`\\b${name}\\b`).test(code)) continue;
      const imported =
        new RegExp(
          `import\\s+(?:type\\s+)?(?:\\{[^;]*\\b${name}\\b[^;]*\\}|${name})\\s+from\\s+["'][^"']+["']`
        ).test(mod.content) ||
        new RegExp(`import\\s+(?:type\\s+)?\\*\\s+as\\s+\\w+\\s+from\\s+["'][^"']+["']`).test(mod.content);
      if (!imported) return true;
    }
  }
  return false;
}

function stripImportLines(content: string): string {
  return content
    .split(/\r?\n/)
    .filter((line) => !/^\s*import\b/.test(line))
    .join("\n");
}

function safeWritePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("\0")) return false;
  return !normalized.split("/").some((part) => part === "" || part === "." || part === "..");
}

function lineStartDepths(content: string): number[] {
  const depths = [0];
  let brace = 0;
  let mode: "code" | "line" | "block" | "sq" | "dq" | "tpl" = "code";
  let escape = false;
  const interp: number[] = [];

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1] ?? "";
    if (char === "\n") {
      if (mode === "line") mode = "code";
      depths.push(brace);
      escape = false;
      continue;
    }
    if (mode === "line") continue;
    if (mode === "block") {
      if (char === "*" && next === "/") {
        mode = "code";
        index += 1;
      }
      continue;
    }
    if (mode === "sq" || mode === "dq" || mode === "tpl") {
      if (escape) {
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if ((mode === "sq" && char === "'") || (mode === "dq" && char === '"') || (mode === "tpl" && char === "`")) {
        mode = "code";
        continue;
      }
      if (mode === "tpl" && char === "$" && next === "{") {
        mode = "code";
        interp.push(brace);
        brace += 1;
        index += 1;
      }
      continue;
    }
    if (char === "/" && next === "/") {
      mode = "line";
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      mode = "block";
      index += 1;
      continue;
    }
    if (char === "'") mode = "sq";
    else if (char === '"') mode = "dq";
    else if (char === "`") mode = "tpl";
    else if (char === "{") brace += 1;
    else if (char === "}") {
      brace = Math.max(0, brace - 1);
      if (interp.length > 0 && brace === interp[interp.length - 1]) {
        interp.pop();
        mode = "tpl";
      }
    }
  }

  return depths;
}

function topLevelBlocks(lines: string[], depths: number[]): Block[] {
  const starts: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if ((depths[index] ?? 0) !== 0) continue;
    if (DECL.test(lines[index]?.trim() ?? "")) starts.push(index);
  }

  const startsWithDocs = starts.map((start, index) => {
    const previous = index === 0 ? -1 : starts[index - 1] ?? -1;
    let cursor = start - 1;
    while (cursor > previous && (lines[cursor]?.trim() ?? "") === "") cursor -= 1;
    const commentLine = lines[cursor] ?? "";
    if (/^\s*\/\*\*[\s\S]*\*\/\s*$/.test(commentLine)) return cursor;
    if (!/^\s*\*\/\s*$/.test(commentLine)) return start;
    const commentEnd = cursor;
    while (cursor > previous && !/^\s*\/\*\*/.test(lines[cursor] ?? "")) cursor -= 1;
    if (cursor <= previous || !/^\s*\/\*\*/.test(lines[cursor] ?? "")) return start;
    return commentEnd > cursor ? cursor : start;
  });

  return startsWithDocs.map((start, index) => {
    const next = startsWithDocs[index + 1] ?? lines.length;
    const end = next - 1;
    const match = DECL.exec(lines[starts[index] ?? start]?.trim() ?? "");
    const name = match?.slice(2).find((part) => part) ?? (match?.[1]?.startsWith("export default") ? "default" : `part${index + 1}`);
    const raw = (lines[starts[index] ?? start] ?? "").trim();
    return {
      name,
      exported: /^export\b/.test(raw),
      isDefault: /^export\s+default\b/.test(raw),
      isType: /^(?:export\s+)?(?:type|interface)\b/.test(raw),
      start,
      end,
    };
  });
}

function renderModule(
  sourcePath: string,
  lines: string[],
  block: Block,
  index: number,
  directive: string,
  preamble: string[],
  blocks: Block[]
): { filePath: string; exportName: string; lineCount: number; content: string; slug: string } {
  const slug = uniqueSlug(block.name, index, blocks);
  const modulePath = siblingModulePath(sourcePath, slug);
  const body = lines.slice(block.start, block.end + 1).join("\n");
  const localImports = blocks
    .filter((other) => other !== block && other.name !== "default" && new RegExp(`\\b${other.name}\\b`).test(body))
    .map((other) => {
      const otherSlug = uniqueSlug(other.name, blocks.indexOf(other), blocks);
      const spec = `./${otherSlug}`;
      if (other.isType) return `import type { ${other.name} } from "${spec}";`;
      if (other.isDefault) {
        const local = other.name === "default" ? "importedDefault" : other.name;
        return `import ${local} from "${spec}";`;
      }
      return `import { ${other.name} } from "${spec}";`;
    });
  const header = [directive, ...preamble, ...localImports].filter((line) => line.trim().length > 0);
  const typedBody = annotateUntypedCallbacks(ensureExported(body, block), arrayElementTypes(blocks, lines));
  const content = [...header, header.length > 0 ? "" : "", typedBody].filter((line, lineIndex, all) => !(line === "" && all[lineIndex - 1] === "")).join("\n").trim() + "\n";
  const exported = collectModuleExports(content);
  const exportName = exported.find((binding) => binding.kind !== "default")?.name ?? exported[0]?.name ?? block.name;
  return {
    filePath: modulePath,
    exportName,
    lineCount: content.split(/\r?\n/).length,
    content,
    slug,
  };
}

function ensureExported(body: string, block: Block): string {
  if (block.exported) return body;
  return `export ${body}`;
}

function arrayElementTypes(blocks: Block[], lines: string[]): Map<string, string> {
  const types = new Map<string, string>();
  for (const block of blocks) {
    const text = lines.slice(block.start, block.end + 1).join("\n");
    if (block.isType) {
      for (const [property, propertyType] of objectProperties(text)) {
        const element = arrayElement(propertyType);
        if (element) types.set(property, element);
      }
      continue;
    }
    const declared = constTypeAnnotation(text);
    const element = declared ? arrayElement(declared) : null;
    if (element) types.set(block.name, element);
  }
  return types;
}

function objectProperties(typeText: string): Array<[string, string]> {
  const body = objectBody(typeText);
  const properties: Array<[string, string]> = [];
  let depth = 0;
  let current = "";
  for (const char of body) {
    if (char === "{" || char === "(" || char === "<") depth += 1;
    if ((char === "}" || char === ")" || char === ">") && depth > 0) depth -= 1;
    if ((char === ";" || char === "\n") && depth === 0) {
      const property = propertyDeclaration(current);
      if (property) properties.push(property);
      current = "";
      continue;
    }
    current += char;
  }
  const tail = propertyDeclaration(current);
  if (tail) properties.push(tail);
  return properties;
}

function objectBody(typeText: string): string {
  const start = typeText.indexOf("{");
  if (start < 0) return "";
  let depth = 0;
  for (let index = start; index < typeText.length; index += 1) {
    const char = typeText[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return typeText.slice(start + 1, index);
    }
  }
  return "";
}

function propertyDeclaration(fragment: string): [string, string] | null {
  const match = fragment.trim().match(/^(?:readonly\s+)?([A-Za-z_][A-Za-z0-9_]*)\??\s*:\s*([\s\S]+)$/);
  if (!match?.[1] || !match[2]) return null;
  return [match[1], match[2].trim().replace(/;$/, "")];
}

function constTypeAnnotation(text: string): string | null {
  const match = text.match(/^(?:export\s+)?(?:const|let|var)\s+[A-Za-z_][A-Za-z0-9_]*\s*:\s*([\s\S]*?)\s*=/);
  return match?.[1]?.trim() ?? null;
}

function arrayElement(typeText: string): string | null {
  let text = typeText.trim().replace(/;$/, "");
  text = text.replace(/\s*\|\s*(?:null|undefined)\b/g, "").trim();
  const generic = text.match(/^(?:Readonly)?Array\s*<([\s\S]+)>$/);
  if (generic?.[1]) return generic[1].trim();
  if (text.endsWith("[]")) return text.slice(0, -2).trim();
  return null;
}

function annotateUntypedCallbacks(body: string, elementTypes: Map<string, string>): string {
  return body.replace(
    /(?:(\([A-Za-z_][A-Za-z0-9_]*\s*\?\?\s*\[[^\]]*\]\))|([A-Za-z_][A-Za-z0-9_]*))\.(map|forEach|filter|flatMap|find|some|every)\(\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?!:)(\s*,\s*([A-Za-z_][A-Za-z0-9_]*))?\s*\)\s*=>/g,
    (full, parenthesized: string | undefined, identifier: string | undefined, method: string, param: string, indexPart: string | undefined, indexName: string | undefined) => {
      const sourceName = identifier ?? parenthesized?.match(/\(([A-Za-z_][A-Za-z0-9_]*)/)?.[1] ?? "";
      const known = sourceName ? elementTypes.get(sourceName) : undefined;
      const element = explicitElementType(known, sourceName, Boolean(parenthesized));
      if (!element) return full;
      const indexTyped = indexName ? `, ${indexName}: number` : indexPart ?? "";
      const receiver = parenthesized ?? identifier;
      return `${receiver}.${method}((${param}: ${element}${indexTyped}) =>`;
    }
  );
}

function explicitElementType(known: string | undefined, sourceName: string, nullableArray: boolean): string {
  if (known && known.length <= 160 && !known.includes("\n")) return known;
  if (!sourceName) return "";
  if (nullableArray) return `NonNullable<typeof ${sourceName}>[number]`;
  return `(typeof ${sourceName})[number]`;
}

function uniqueSlug(name: string, index: number, blocks: Block[]): string {
  const base = name === "default" ? "default-export" : name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || `part-${index + 1}`;
  const taken = blocks.slice(0, index).some((block) => {
    const previous = block.name === "default" ? "default-export" : block.name.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase();
    return previous === base;
  });
  return taken ? `${base}-${index + 1}` : base;
}

function sourceExtension(sourcePath: string): string {
  if (sourcePath.endsWith(".tsx")) return ".tsx";
  if (sourcePath.endsWith(".jsx")) return ".jsx";
  if (sourcePath.endsWith(".js")) return ".js";
  return ".ts";
}

function siblingModulePath(sourcePath: string, slug: string): string {
  const directory = path.posix.dirname(sourcePath);
  const base = path.posix.basename(sourcePath).replace(/\.(tsx|ts|jsx|js)$/, "");
  return path.posix.join(directory, base, `${slug}${sourceExtension(sourcePath)}`);
}

function renderBarrel(
  sourcePath: string,
  directive: string,
  modules: Array<{ slug: string; content: string }>
): string {
  const lines = [directive.trim()].filter(Boolean);
  const folder = path.posix.basename(sourcePath).replace(/\.(tsx|ts|jsx|js)$/, "");
  const seen = new Set<string>();
  for (const mod of modules) {
    const spec = `./${folder}/${mod.slug}`;
    for (const binding of collectModuleExports(mod.content)) {
      const key = binding.kind === "default" ? "default" : binding.name;
      if (seen.has(key)) continue;
      seen.add(key);
      if (binding.kind === "default") {
        lines.push(`export { default } from "${spec}";`);
      } else if (binding.kind === "type") {
        lines.push(`export type { ${binding.name} } from "${spec}";`);
      } else {
        lines.push(`export { ${binding.name} } from "${spec}";`);
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

function collectModuleExports(content: string): ExportBinding[] {
  const lines = content.split(/\r?\n/);
  const depths = lineStartDepths(content);
  const found: ExportBinding[] = [];
  const seen = new Set<string>();
  const add = (name: string, kind: ExportBinding["kind"]) => {
    if (!/^[A-Za-z0-9_]+$/.test(name)) return;
    const key = `${kind}:${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ name, kind });
  };

  for (let index = 0; index < lines.length; index += 1) {
    if ((depths[index] ?? 0) !== 0) continue;
    const statement = exportStatement(lines, index);
    if (!statement) continue;
    if (/^export\s+default\b/.test(statement)) {
      add("default", "default");
      continue;
    }
    if (/^export\s+type\s*\{/.test(statement)) {
      for (const binding of namedExportList(statement, true)) add(binding.name, "type");
      continue;
    }
    const typeDecl = statement.match(/^export\s+(?:type|interface)\s+([A-Za-z0-9_]+)/);
    if (typeDecl?.[1]) {
      add(typeDecl[1], "type");
      continue;
    }
    if (/^export\s*\{/.test(statement)) {
      for (const binding of namedExportList(statement, false)) add(binding.name, binding.kind);
      continue;
    }
    const valueDecl = statement.match(
      /^export\s+(?:declare\s+)?(?:async\s+)?(?:function|class|enum|const|let|var|abstract\s+class)\s+([A-Za-z0-9_]+)/
    );
    if (valueDecl?.[1]) add(valueDecl[1], "value");
  }

  return found;
}

function exportStatement(lines: string[], start: number): string | null {
  const first = lines[start]?.trim() ?? "";
  if (!/^export\b/.test(first)) return null;
  let text = first;
  let index = start;
  while (text.includes("{") && !text.includes("}") && index + 1 < lines.length) {
    index += 1;
    text += ` ${lines[index]?.trim() ?? ""}`;
  }
  return text;
}

function namedExportList(statement: string, forceType: boolean): ExportBinding[] {
  const inner = statement.match(/\{([\s\S]*)\}/)?.[1] ?? "";
  return inner
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part): ExportBinding[] => {
      const typeOnly = forceType || /^type\s+/.test(part);
      const body = part.replace(/^type\s+/, "");
      const exported = body.match(/^[A-Za-z0-9_]+\s+as\s+([A-Za-z0-9_]+)$/)?.[1] ?? body.match(/^([A-Za-z0-9_]+)$/)?.[1];
      if (!exported) return [];
      if (exported === "default") return [{ name: "default", kind: "default" as const }];
      return [{ name: exported, kind: typeOnly ? ("type" as const) : ("value" as const) }];
    });
}

function fileDiff(filePath: string, before: string[], after: string[]): string {
  const removed = Math.min(before.length, 8);
  const preview = before.slice(0, removed).map((line) => `-${line}`);
  const hidden = before.length - removed;
  return [
    `diff --git a/${filePath} b/${filePath}`,
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -1,${before.length} +1,${after.length} @@`,
    ...preview,
    hidden > 0 ? `-... ${hidden} more removed lines` : "",
    ...after.map((line) => `+${line}`),
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function newFileDiff(filePath: string, content: string): string {
  const lines = content.split(/\r?\n/);
  const preview = lines.slice(0, 24);
  return [
    `diff --git a/${filePath} b/${filePath}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${filePath}`,
    `@@ -0,0 +1,${lines.length} @@`,
    ...preview.map((line) => `+${line}`),
    lines.length > preview.length ? `+... ${lines.length - preview.length} more lines` : "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function emptyDiff(filePath: string): string {
  return [`diff --git a/${filePath} b/${filePath}`, "--- unchanged", "+++ unchanged"].join("\n");
}

function capDiff(diff: string): string {
  if (diff.length <= 12000) return diff;
  return `${diff.slice(0, 12000)}\n... diff truncated`;
}
