import path from "node:path";
import type { FirewallAutofixModule } from "@/lib/firewall-contract";

type Block = {
  name: string;
  exported: boolean;
  isDefault: boolean;
  start: number;
  end: number;
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
  /^(export\s+default\s+(?:async\s+)?function(?:\s+([A-Za-z0-9_]+))?|export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)|export\s+(?:const|let|var|class|type|interface|enum)\s+([A-Za-z0-9_]+)|(?:async\s+)?function\s+([A-Za-z0-9_]+)|class\s+([A-Za-z0-9_]+)|(?:const|let|var)\s+([A-Za-z0-9_]+))/;

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

export function planAutofix(filePath: string, content: string): AutofixPlan {
  const normalized = filePath.replace(/\\/g, "/");
  const lines = content.split(/\r?\n/);
  const blocks = topLevelBlocks(lines, lineStartDepths(content));
  if (blocks.length < 2) {
    return {
      ok: true,
      filePath: normalized,
      summary: "No safe top-level split. The file stays one unit, so the diff is empty.",
      diff: emptyDiff(normalized),
      modules: [],
      canOpenPullRequest: false,
      writes: [],
    };
  }

  const directive = lines.find((line) => /^\s*['"]use (?:client|server)['"];?\s*$/.test(line)) ?? "";
  const preamble = lines.slice(0, blocks[0]?.start ?? 0).filter((line) => line.trim() !== directive.trim());
  const modules = blocks.map((block, index) =>
    renderModule(normalized, lines, block, index, directive, preamble, blocks)
  );
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

  return starts.map((start, index) => {
    const end = (starts[index + 1] ?? lines.length) - 1;
    const match = DECL.exec(lines[start]?.trim() ?? "");
    const name = match?.slice(2).find((part) => part) ?? (match?.[1]?.startsWith("export default") ? "default" : `part${index + 1}`);
    const raw = lines[start] ?? "";
    return {
      name,
      exported: /^\s*export\b/.test(raw),
      isDefault: /^\s*export\s+default\b/.test(raw),
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
): { filePath: string; exportName: string; lineCount: number; content: string; slug: string; isDefault: boolean } {
  const slug = uniqueSlug(block.name, index, blocks);
  const modulePath = siblingModulePath(sourcePath, slug);
  const body = lines.slice(block.start, block.end + 1).join("\n");
  const localImports = blocks
    .filter((other) => other !== block && new RegExp(`\\b${other.name}\\b`).test(body))
    .map((other) => {
      const otherSlug = uniqueSlug(other.name, blocks.indexOf(other), blocks);
      const spec = `./${otherSlug}`;
      return other.isDefault
        ? `import ${other.name === "default" ? "importedDefault" : other.name} from "${spec}";`
        : `import { ${other.name} } from "${spec}";`;
    });
  const header = [directive, ...preamble, ...localImports].filter((line) => line.trim().length > 0);
  const content = [...header, header.length > 0 ? "" : "", ensureExported(body, block)].filter((line, lineIndex, all) => !(line === "" && all[lineIndex - 1] === "")).join("\n").trim() + "\n";
  return {
    filePath: modulePath,
    exportName: block.name,
    lineCount: content.split(/\r?\n/).length,
    content,
    slug,
    isDefault: block.isDefault,
  };
}

function ensureExported(body: string, block: Block): string {
  if (block.exported) return body;
  return `export ${body}`;
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
  modules: Array<{ slug: string; exportName: string; isDefault: boolean }>
): string {
  const lines = [directive.trim()].filter(Boolean);
  for (const mod of modules) {
    const folder = path.posix.basename(sourcePath).replace(/\.(tsx|ts|jsx|js)$/, "");
    const spec = `./${folder}/${mod.slug}`;
    lines.push(
      mod.isDefault
        ? `export { default } from "${spec}";`
        : `export { ${mod.exportName} } from "${spec}";`
    );
  }
  return `${lines.join("\n")}\n`;
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
