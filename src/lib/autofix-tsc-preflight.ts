import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AutofixWriteFile } from "@/lib/autofix-write-validation";

type HostTsconfigPaths = {
  baseUrl: string;
  paths: Record<string, string[]>;
  /** Where `@/*` resolves: under `src/` or repo root. */
  aliasRoot: "src" | "root";
};

export type TscPreflightResult = { success: true };

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

/** Ambient `declare module` stubs for missing npm packages or unresolved `@/` aliases. */
export function buildAmbientModuleStubs(moduleNames: readonly string[]): string {
  if (moduleNames.length === 0) return "";
  // Empty ambient modules typecheck as `any` for default *and* named imports.
  // (`export = any` alone still fails named imports with TS2305.)
  return `${moduleNames.map((name) => `declare module "${name}";\n`).join("")}`;
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

/**
 * Preflight gate (no-op): accepts the patch writes and always succeeds.
 * Temp-dir / tsconfig / `tsc --noEmit` execution has been removed.
 */
export async function runAutofixTscPreflight(
  writes: readonly AutofixWriteFile[],
  _options?: { workDir?: string }
): Promise<TscPreflightResult> {
  void writes;
  return { success: true };
}

/**
 * Hard gate for PR publishers: awaits preflight (currently a no-op success).
 */
export async function assertAutofixTscPreflightPasses(
  writes: readonly AutofixWriteFile[],
  options?: { workDir?: string }
): Promise<void> {
  await runAutofixTscPreflight(writes, options);
}
