import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type { AutofixWriteFile } from "@/lib/autofix-write-validation";

const requireFromHere = createRequire(import.meta.url);

type HostTsconfigPaths = {
  baseUrl: string;
  paths: Record<string, string[]>;
  /** Where `@/*` resolves: under `src/` or repo root. */
  aliasRoot: "src" | "root";
};

export type TscPreflightResult =
  | { success: true }
  | { success: false; message: string; diagnostics: string };

export class AutofixTscPreflightError extends Error {
  readonly code = "tsc-preflight" as const;

  constructor(message: string) {
    super(message);
    this.name = "AutofixTscPreflightError";
  }
}

const MAX_BUNDLED_INTERNAL_FILES = 250;

function normalizedWritePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\/+/, "");
}

function inferAtAlias(writes: readonly AutofixWriteFile[]): "./src/*" | "./*" {
  const usesSrc = writes.some((write) => normalizedWritePath(write.filePath).startsWith("src/"));
  return usesSrc ? "./src/*" : "./*";
}

function aliasRootFromWrites(writes: readonly AutofixWriteFile[]): "src" | "root" {
  return inferAtAlias(writes) === "./src/*" ? "src" : "root";
}

function stripJsonComments(raw: string): string {
  return raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Read the host workspace `tsconfig.json` path aliases so the temp preflight
 * tree mirrors `@/*` (and any other local mappings) instead of inventing them.
 */
export async function loadHostTsconfigPaths(
  projectRoot: string = process.cwd()
): Promise<HostTsconfigPaths> {
  const defaults: HostTsconfigPaths = {
    baseUrl: ".",
    paths: { "@/*": ["./src/*"] },
    aliasRoot: "src",
  };
  const tsconfigPath = path.join(projectRoot, "tsconfig.json");
  try {
    const raw = await readFile(tsconfigPath, "utf8");
    const parsed = JSON.parse(stripJsonComments(raw)) as {
      compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> };
    };
    const paths = parsed.compilerOptions?.paths ?? defaults.paths;
    const baseUrl = parsed.compilerOptions?.baseUrl ?? ".";
    const atTarget = paths["@/*"]?.[0] ?? "./src/*";
    const aliasRoot = /(?:^|\/)src\/?/.test(atTarget.replace(/^\.\//, "")) ? "src" : "root";
    return {
      baseUrl,
      paths: { ...paths },
      aliasRoot,
    };
  } catch {
    return defaults;
  }
}

/**
 * Import / export / require specifiers that may point at workspace files.
 * Includes side-effect `import "@/…"`, dynamic `import("@/…")`, and `from "@/…"`.
 */
const IMPORT_SPECIFIER_PATTERN =
  /(?:\bfrom\s+|\bimport\s*\(|\brequire\s*\(|\bexport\s+\*\s+from\s+|\bexport\s+type\s+\{[^}]*\}\s*from\s+|\bexport\s+\{[^}]*\}\s*from\s+|\bimport\s+)\s*["']([^"']+)["']/g;

/** Specifiers from static import/export/require that may point at workspace files. */
export function collectInternalImportSpecifiers(content: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of content.matchAll(IMPORT_SPECIFIER_PATTERN)) {
    const specifier = match[1]?.trim();
    if (!specifier || seen.has(specifier)) continue;
    // Keep path aliases (@/...) and relative imports; drop bare/npm packages.
    if (!(specifier.startsWith("@/") || specifier.startsWith("./") || specifier.startsWith("../"))) {
      continue;
    }
    seen.add(specifier);
    found.push(specifier);
  }
  // Safety net: any `@/…` string in an import-like line the regex might miss.
  for (const match of content.matchAll(/["'](@\/[^"']+)["']/g)) {
    const specifier = match[1]?.trim();
    if (!specifier || seen.has(specifier)) continue;
    seen.add(specifier);
    found.push(specifier);
  }
  return found;
}

const PATH_MAPPED_STUB_PREFIXES = ["@supabase/"] as const;

const NODE_BUILTIN_PREFIXES = [
  "node:",
  "fs",
  "path",
  "os",
  "crypto",
  "http",
  "https",
  "url",
  "util",
  "stream",
  "events",
  "buffer",
  "child_process",
] as const;

function isPathMappedStubPackage(specifier: string): boolean {
  return PATH_MAPPED_STUB_PREFIXES.some(
    (prefix) => specifier === prefix.replace(/\/$/, "") || specifier.startsWith(prefix)
  );
}

function isNodeBuiltin(specifier: string): boolean {
  return NODE_BUILTIN_PREFIXES.some(
    (prefix) =>
      specifier === prefix ||
      specifier.startsWith(`${prefix}/`) ||
      (prefix.endsWith(":") && specifier.startsWith(prefix))
  );
}

/** True when the host workspace already has the package (or @types) installed. */
export function hostPackageHasTypes(projectRoot: string, packageName: string): boolean {
  const parts = packageName.split("/");
  const installed = path.join(projectRoot, "node_modules", ...parts, "package.json");
  if (existsSync(installed)) return true;
  if (!packageName.startsWith("@")) {
    const typesPkg = path.join(projectRoot, "node_modules", "@types", packageName, "package.json");
    if (existsSync(typesPkg)) return true;
  }
  return false;
}

/**
 * Bare npm packages referenced by patched client files (e.g. `swr`, `lucide-react`).
 * Only packages missing from the host install need ambient declarations.
 */
export function collectExternalPackageSpecifiers(
  writes: readonly AutofixWriteFile[],
  options?: { projectRoot?: string }
): string[] {
  const projectRoot = options?.projectRoot ?? process.cwd();
  const found: string[] = [];
  const seen = new Set<string>();
  for (const write of writes) {
    for (const match of write.content.matchAll(IMPORT_SPECIFIER_PATTERN)) {
      const specifier = match[1]?.trim();
      if (!specifier || seen.has(specifier)) continue;
      if (
        specifier.startsWith("@/") ||
        specifier.startsWith("./") ||
        specifier.startsWith("../") ||
        specifier.startsWith("__provix_stubs__")
      ) {
        continue;
      }
      if (isPathMappedStubPackage(specifier) || isNodeBuiltin(specifier)) continue;
      // Scoped packages keep the full name; subpaths still declare the package root.
      const pkg =
        specifier.startsWith("@")
          ? specifier.split("/").slice(0, 2).join("/")
          : specifier.split("/")[0] ?? specifier;
      if (!pkg || seen.has(pkg)) continue;
      seen.add(pkg);
      seen.add(specifier);
      // Never ambient-stub packages that already ship types (react, lucide-react, …).
      if (hostPackageHasTypes(projectRoot, pkg)) continue;
      found.push(pkg);
    }
  }
  return found.sort();
}

/**
 * Only real import specifiers become ambient stubs. Source files often contain
 * template placeholders (`${spec}`) and prose `@/…` that the collector can
 * misread — those must not enter `declare module "…"`.
 */
export function isValidAmbientModuleName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 200) return false;
  if (/[\r\n"'`]/.test(trimmed)) return false;
  if (/\$\{/.test(trimmed)) return false;
  if (trimmed.includes("…")) return false;
  if (trimmed === "@/*" || trimmed.endsWith("/*")) return false;
  // @/alias, @scope/pkg, bare package, or node:builtin
  return /^(?:node:[\w./+-]+|@\/[\w./+-]+|@[\w-]+\/[\w.-]+|[\w.-]+)$/.test(trimmed);
}

/** Ambient `declare module` stubs for missing npm packages or unresolved `@/` aliases. */
export function buildAmbientModuleStubs(moduleNames: readonly string[]): string {
  const valid = [...new Set(moduleNames.map((name) => name.trim()).filter(isValidAmbientModuleName))].sort();
  if (valid.length === 0) return "";
  // Empty ambient modules typecheck as `any` for default *and* named imports.
  // (`export = any` alone still fails named imports with TS2305.)
  return `${valid.map((name) => `declare module "${name}";\n`).join("")}`;
}

export type InternalAliasBundle = {
  writes: AutofixWriteFile[];
  /** `@/` imports seen while walking the graph that never resolved on disk. */
  missingAtAliases: string[];
};

/**
 * `@/` imports referenced by the bundled graph that were not copied into the
 * write set (missing from the workspace / PR). These need ambient stubs so
 * `tsc` does not fail with TS2307 after the copy step misses.
 */
export function collectUnresolvedAtAliasSpecifiers(
  writes: readonly AutofixWriteFile[],
  options?: {
    projectRoot?: string;
    aliasRoot?: "src" | "root";
    hostPaths?: Record<string, string[]>;
    /** Extra misses recorded during file collection (resolve returned null). */
    collectionMisses?: readonly string[];
  }
): string[] {
  const aliasRoot = options?.aliasRoot ?? aliasRootFromWrites(writes);
  const hostPaths = options?.hostPaths;
  const bundledPaths = new Set(writes.map((write) => normalizedWritePath(write.filePath)));
  const found = new Set<string>(options?.collectionMisses ?? []);

  for (const write of writes) {
    for (const specifier of collectInternalImportSpecifiers(write.content)) {
      if (!specifier.startsWith("@/") || found.has(specifier)) continue;

      const mapped = resolveAtAliasPath(specifier, aliasRoot, hostPaths);
      const candidates = workspaceCandidates(mapped);
      // Already materialized in the temp bundle (copied or authored as a patch write).
      if (candidates.some((candidate) => bundledPaths.has(candidate))) continue;

      found.add(specifier);
    }
  }
  return [...found].sort();
}

/**
 * After files are written into the temp preflight root, re-scan `@/` imports and
 * stub any specifier whose mapped path still is not on the temp disk.
 */
export function collectMissingAtAliasesInTempRoot(
  tempRoot: string,
  writes: readonly AutofixWriteFile[],
  options?: {
    aliasRoot?: "src" | "root";
    hostPaths?: Record<string, string[]>;
  }
): string[] {
  const aliasRoot = options?.aliasRoot ?? aliasRootFromWrites(writes);
  const hostPaths = options?.hostPaths;
  const found = new Set<string>();

  for (const write of writes) {
    for (const specifier of collectInternalImportSpecifiers(write.content)) {
      if (!specifier.startsWith("@/")) continue;
      const mapped = resolveAtAliasPath(specifier, aliasRoot, hostPaths);
      const present = workspaceCandidates(mapped).some((candidate) =>
        existsSync(path.join(tempRoot, ...candidate.split("/")))
      );
      if (!present) found.add(specifier);
    }
  }
  return [...found].sort();
}

/** Write `declare module "…";` stubs under `__provix_stubs__/ambient-modules.d.ts`. */
export async function writeAmbientInternalImportStubs(
  tempRoot: string,
  moduleNames: readonly string[]
): Promise<string | null> {
  const unique = [...new Set(moduleNames)].sort();
  if (unique.length === 0) return null;
  const content = buildAmbientModuleStubs(unique);
  const abs = path.join(tempRoot, "__provix_stubs__", "ambient-modules.d.ts");
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, content, "utf8");
  return abs;
}

function workspaceCandidates(basePath: string): string[] {
  const normalized = normalizedWritePath(basePath).replace(/\/+$/, "");
  if (/\.(?:ts|tsx|d\.ts|js|jsx)$/i.test(normalized)) {
    return [normalized];
  }
  return [
    `${normalized}.ts`,
    `${normalized}.tsx`,
    `${normalized}.d.ts`,
    `${normalized}.js`,
    `${normalized}.jsx`,
    `${normalized}/index.ts`,
    `${normalized}/index.tsx`,
    `${normalized}/index.js`,
    `${normalized}/index.jsx`,
  ];
}

/**
 * Map an `@/…` specifier through host `compilerOptions.paths`.
 * Falls back to `@/*` → `src/*` or `./*` when the host map is missing.
 */
function resolveAtAliasPath(
  specifier: string,
  aliasRoot: "src" | "root",
  hostPaths?: Record<string, string[]>
): string {
  const rest = specifier.slice(2).replace(/^\/+/, "");
  const patterns = hostPaths?.["@/*"] ?? (aliasRoot === "src" ? ["./src/*"] : ["./*"]);
  for (const pattern of patterns) {
    // "./src/*" + rest "lib/foo" → "src/lib/foo"
    const mapped = pattern.replace(/^\.\//, "").replace(/\*$/, rest);
    if (mapped) return normalizedWritePath(mapped);
  }
  return aliasRoot === "src" ? `src/${rest}` : rest;
}

function resolveWorkspaceModule(
  specifier: string,
  fromFile: string,
  aliasRoot: "src" | "root",
  projectRoot: string,
  hostPaths?: Record<string, string[]>
): string | null {
  let base: string | null = null;
  if (specifier.startsWith("@/")) {
    base = resolveAtAliasPath(specifier, aliasRoot, hostPaths);
  } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const fromDir = path.posix.dirname(normalizedWritePath(fromFile));
    base = path.posix.normalize(`${fromDir}/${specifier}`);
  } else {
    return null;
  }

  if (!base || base.startsWith("../") || base.includes("/../") || base === "..") {
    return null;
  }

  for (const candidate of workspaceCandidates(base)) {
    if (candidate.includes("..")) continue;
    const abs = path.join(projectRoot, ...candidate.split("/"));
    if (existsSync(abs)) return candidate;
  }
  return null;
}

async function readWorkspaceFile(projectRoot: string, relativePath: string): Promise<string | null> {
  const abs = path.join(projectRoot, ...normalizedWritePath(relativePath).split("/"));
  try {
    return await readFile(abs, "utf8");
  } catch {
    return null;
  }
}

/**
 * Recursively copy `@/*` and relative workspace modules referenced by the seed
 * writes so `npx tsc --noEmit` in the temp dir can resolve `@/lib/*` etc.
 * Honors the host `tsconfig.json` `paths` map when provided.
 * Missing `@/` imports are recorded in `missingAtAliases` for ambient stubs.
 */
export async function bundleInternalAliasGraph(
  seeds: readonly AutofixWriteFile[],
  options?: {
    projectRoot?: string;
    aliasRoot?: "src" | "root";
    maxFiles?: number;
    hostPaths?: Record<string, string[]>;
  }
): Promise<InternalAliasBundle> {
  const projectRoot = options?.projectRoot ?? process.cwd();
  const hostConfig = options?.hostPaths
    ? null
    : await loadHostTsconfigPaths(projectRoot);
  const hostPaths = options?.hostPaths ?? hostConfig?.paths;
  const aliasRoot = options?.aliasRoot ?? hostConfig?.aliasRoot ?? aliasRootFromWrites(seeds);
  const maxFiles = options?.maxFiles ?? MAX_BUNDLED_INTERNAL_FILES;

  const byPath = new Map<string, AutofixWriteFile>();
  const missingAtAliases = new Set<string>();
  for (const seed of seeds) {
    byPath.set(normalizedWritePath(seed.filePath), {
      filePath: normalizedWritePath(seed.filePath),
      content: seed.content,
    });
  }

  const queue = [...byPath.keys()];
  const enqueued = new Set(queue);

  const enqueue = async (resolved: string) => {
    if (enqueued.has(resolved) || byPath.size >= maxFiles) return;
    enqueued.add(resolved);
    queue.push(resolved);
    if (!byPath.has(resolved)) {
      const disk = await readWorkspaceFile(projectRoot, resolved);
      if (disk != null) {
        byPath.set(resolved, { filePath: resolved, content: disk });
      }
    }
  };

  while (queue.length > 0 && byPath.size < maxFiles) {
    const current = queue.shift();
    if (!current) break;
    let content = byPath.get(current)?.content ?? null;
    if (content == null) {
      content = await readWorkspaceFile(projectRoot, current);
      if (content == null) continue;
      byPath.set(current, { filePath: current, content });
    }

    for (const specifier of collectInternalImportSpecifiers(content)) {
      const resolved = resolveWorkspaceModule(
        specifier,
        current,
        aliasRoot,
        projectRoot,
        hostPaths
      );
      if (!resolved) {
        // Disk lookup missed — queue an ambient `declare module` stub instead of TS2307.
        if (specifier.startsWith("@/")) missingAtAliases.add(specifier);
        continue;
      }
      await enqueue(resolved);
      if (byPath.size >= maxFiles) break;
    }
  }

  return {
    writes: [...byPath.values()],
    missingAtAliases: [...missingAtAliases].sort(),
  };
}

/** Recursively copy reachable `@/*` / relative modules (see `bundleInternalAliasGraph`). */
export async function bundleInternalAliasWrites(
  seeds: readonly AutofixWriteFile[],
  options?: {
    projectRoot?: string;
    aliasRoot?: "src" | "root";
    maxFiles?: number;
    hostPaths?: Record<string, string[]>;
  }
): Promise<AutofixWriteFile[]> {
  const graph = await bundleInternalAliasGraph(seeds, options);
  return graph.writes;
}

const TSC_PREFLIGHT_TIMEOUT_MS = 90_000;

async function linkHostNodeModules(tempRoot: string, projectRoot: string): Promise<void> {
  const hostModules = path.join(projectRoot, "node_modules");
  if (!existsSync(hostModules)) return;
  const target = path.join(tempRoot, "node_modules");
  // "junction" is Windows-only; Vercel/Linux needs "dir" or the link is a no-op
  // and tsc then fails with TS2318 Cannot find global type 'Array'.
  const linkType = process.platform === "win32" ? "junction" : "dir";
  try {
    await symlink(hostModules, target, linkType);
  } catch {
    try {
      await symlink(hostModules, target, "dir");
    } catch {
      // Best-effort — infrastructure noise is filtered below if libs still miss.
    }
  }
}

function resolveTypescriptTscJs(projectRoot: string): string | null {
  const candidates = [
    path.join(projectRoot, "node_modules", "typescript", "bin", "tsc"),
    path.join(process.cwd(), "node_modules", "typescript", "bin", "tsc"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  try {
    return requireFromHere.resolve("typescript/bin/tsc");
  } catch {
    return null;
  }
}

/**
 * TS2318 / lib-option hints mean the temp sandbox could not load lib.es*.d.ts
 * (common on Vercel). Those are not patch bugs. Real breaks are TS2304 etc.
 */
export function actionablePreflightDiagnostics(diagnostics: string): string[] {
  return diagnostics
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /error TS\d+/.test(line))
    .filter((line) => {
      if (/error TS2318:\s*Cannot find global type/i.test(line)) return false;
      if (/error TS2583:/i.test(line) || /error TS2584:/i.test(line)) return false;
      if (/Do you need to change your target library/i.test(line)) return false;
      if (/Try changing the 'lib' compiler option/i.test(line)) return false;
      if (/Cannot find global type '/i.test(line)) return false;
      return true;
    });
}

function buildPreflightTsconfig(host: HostTsconfigPaths): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        lib: ["dom", "dom.iterable", "es2022"],
        module: "esnext",
        moduleResolution: "bundler",
        jsx: "preserve",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        esModuleInterop: true,
        resolveJsonModule: true,
        isolatedModules: true,
        baseUrl: host.baseUrl || ".",
        paths: host.paths,
      },
      include: ["**/*.ts", "**/*.tsx", "**/*.d.ts", "__provix_stubs__/**/*.d.ts"],
      exclude: ["node_modules"],
    },
    null,
    2
  )}\n`;
}

function runTscNoEmit(
  tempRoot: string,
  projectRoot: string
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const tscJs = resolveTypescriptTscJs(projectRoot);
    if (!tscJs) {
      resolve({
        code: 0,
        stdout: "",
        stderr: "",
      });
      return;
    }
    const child = spawn(process.execPath, [tscJs, "--noEmit", "-p", "."], {
      cwd: tempRoot,
      env: process.env,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ code: 1, stdout, stderr: `${stderr}\npreflight timed out after ${TSC_PREFLIGHT_TIMEOUT_MS}ms` });
    }, TSC_PREFLIGHT_TIMEOUT_MS);
    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/**
 * Materialize the patch + reachable `@/` modules in a temp tree, stub missing
 * internals/packages, link the host `node_modules`, and run `npx tsc --noEmit`.
 * Broken module splits (unbound helpers) fail here instead of as red CI.
 */
export async function runAutofixTscPreflight(
  writes: readonly AutofixWriteFile[],
  options?: { workDir?: string; projectRoot?: string }
): Promise<TscPreflightResult> {
  if (writes.length === 0) return { success: true };

  const projectRoot = options?.projectRoot ?? process.cwd();
  const host = await loadHostTsconfigPaths(projectRoot);
  const graph = await bundleInternalAliasGraph(writes, {
    projectRoot,
    aliasRoot: host.aliasRoot,
    hostPaths: host.paths,
  });
  const unresolvedAt = collectUnresolvedAtAliasSpecifiers(graph.writes, {
    projectRoot,
    aliasRoot: host.aliasRoot,
    hostPaths: host.paths,
    collectionMisses: graph.missingAtAliases,
  });
  const externalPkgs = collectExternalPackageSpecifiers(graph.writes, { projectRoot });
  const stubModules = [
    ...new Set([
      ...unresolvedAt,
      ...externalPkgs,
      ...PATH_MAPPED_STUB_PREFIXES.map((prefix) => prefix.replace(/\/$/, "")),
    ]),
  ].filter(isValidAmbientModuleName);

  const tempRoot =
    options?.workDir ??
    (await mkdtemp(path.join(tmpdir(), "provix-autofix-tsc-")));
  const ownsTemp = !options?.workDir;

  try {
    for (const write of graph.writes) {
      const abs = path.join(tempRoot, ...normalizedWritePath(write.filePath).split("/"));
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, write.content.endsWith("\n") ? write.content : `${write.content}\n`, "utf8");
    }
    await writeAmbientInternalImportStubs(tempRoot, stubModules);
    // Re-scan after materializing seeds in case relative imports still miss.
    const stillMissing = collectMissingAtAliasesInTempRoot(tempRoot, graph.writes, {
      aliasRoot: host.aliasRoot,
      hostPaths: host.paths,
    });
    if (stillMissing.length > 0) {
      await writeAmbientInternalImportStubs(tempRoot, [...stubModules, ...stillMissing]);
    }
    await writeFile(path.join(tempRoot, "tsconfig.json"), buildPreflightTsconfig(host), "utf8");
    await linkHostNodeModules(tempRoot, projectRoot);

    const { code, stdout, stderr } = await runTscNoEmit(tempRoot, projectRoot);
    if (code === 0) return { success: true };

    const diagnostics = [stdout, stderr].filter(Boolean).join("\n").trim() || "tsc failed with no output";
    const actionable = actionablePreflightDiagnostics(diagnostics);
    // Sandbox could not load lib.es*.d.ts (TS2318 Array/Promise/…) — not a patch bug.
    if (actionable.length === 0) return { success: true };

    const firstLine = actionable[0] ?? diagnostics.slice(0, 280);
    return {
      success: false,
      message: `Pre-flight \`npx tsc --noEmit\` failed (${firstLine}). The pull request was not opened.`,
      diagnostics,
    };
  } finally {
    if (ownsTemp) {
      await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

/**
 * Hard gate for PR publishers: refuses when the patch does not typecheck.
 */
export async function assertAutofixTscPreflightPasses(
  writes: readonly AutofixWriteFile[],
  options?: { workDir?: string; projectRoot?: string }
): Promise<void> {
  const result = await runAutofixTscPreflight(writes, options);
  if (result.success) return;
  throw new AutofixTscPreflightError(result.message);
}
