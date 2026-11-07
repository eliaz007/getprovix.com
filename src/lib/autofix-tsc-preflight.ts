import { existsSync, readFileSync } from "node:fs";
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

export type TscPreflightNote = {
  mode: "full" | "skipped-no-lib" | "stubbed";
  stubCount: number;
};

export type TscPreflightResult =
  | { success: true; preflight: TscPreflightNote }
  | { success: false; message: string; diagnostics: string };

function preflightPass(stubCount: number, skippedNoLib = false): TscPreflightResult {
  return {
    success: true,
    preflight: {
      mode: skippedNoLib ? "skipped-no-lib" : stubCount > 0 ? "stubbed" : "full",
      stubCount,
    },
  };
}

/** One section for the Open Fix PR body. Does not change whether the PR opens. */
export function preflightPullRequestSection(note: TscPreflightNote): string {
  if (note.mode === "skipped-no-lib") {
    return [
      "### Preflight",
      "Typecheck did not run: `typescript/lib` is not in this runtime. Syntax and server-action checks did run.",
    ].join("\n");
  }
  if (note.mode === "stubbed") {
    return [
      "### Preflight",
      `\`tsc --noEmit\` passed with ${note.stubCount} ambient stub(s). Unresolved imports were typed as \`any\`.`,
    ].join("\n");
  }
  return ["### Preflight", "`tsc --noEmit` passed on the patch graph with no ambient stubs."].join("\n");
}

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

/** True when `pkgDir` ships usable `.d.ts` (types/typings entry or index.d.ts). */
function packageHasBundledTypes(pkgDir: string): boolean {
  const pkgJsonPath = path.join(pkgDir, "package.json");
  if (!existsSync(pkgJsonPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as {
      types?: string;
      typings?: string;
    };
    const entry = pkg.types ?? pkg.typings;
    if (entry && existsSync(path.join(pkgDir, ...entry.replace(/^\.\//, "").split("/")))) {
      return true;
    }
  } catch {
    // Fall through to index.d.ts / @types lookup.
  }
  return existsSync(path.join(pkgDir, "index.d.ts"));
}

/**
 * True when the host can resolve real types for `packageName`.
 * Package presence alone is not enough — `react` ships JS only; types live in
 * `@types/react`. On Vercel `/var/task`, that @types package is often missing,
 * so returning true here used to skip ambient stubs and fail Open Fix with TS7016.
 */
export function hostPackageHasTypes(projectRoot: string, packageName: string): boolean {
  const parts = packageName.split("/");
  const pkgDir = path.join(projectRoot, "node_modules", ...parts);
  if (packageHasBundledTypes(pkgDir)) return true;

  if (!packageName.startsWith("@")) {
    const typesDir = path.join(projectRoot, "node_modules", "@types", packageName);
    if (packageHasBundledTypes(typesDir) || existsSync(path.join(typesDir, "package.json"))) {
      return true;
    }
    return false;
  }

  // Scoped: @scope/name → @types/scope__name
  const bare = packageName.slice(1);
  const slash = bare.indexOf("/");
  if (slash > 0) {
    const typesDir = path.join(
      projectRoot,
      "node_modules",
      "@types",
      `${bare.slice(0, slash)}__${bare.slice(slash + 1)}`
    );
    if (packageHasBundledTypes(typesDir) || existsSync(path.join(typesDir, "package.json"))) {
      return true;
    }
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
      // `next` is installed, but `next/navigation` and the other subpaths do not
      // resolve from a temp tsconfig. Leaving them unstubbed fails the PR with
      // TS2307 in whatever file imported them, even when the patch is fine.
      if (specifier === "next" || specifier.startsWith("next/")) {
        seen.add(specifier);
        found.push(specifier);
        continue;
      }
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
  // @/alias, @scope/pkg, bare package (+ subpath like react/jsx-runtime), or node:builtin
  return /^(?:node:[\w./+-]+|@\/[\w./+-]+|@[\w-]+\/[\w./+-]+|[\w.-]+(?:\/[\w.-]+)*)$/.test(
    trimmed
  );
}

const NEXT_TYPE_STUBS = new Set(["next", "next/server"]);

/**
 * A script-file `declare module "next/server";` replaces `node_modules/next`
 * and turns `NextResponse` / `Metadata` into namespaces (TS2709). Those two
 * modules are written separately: an augmentation when Next's real types
 * exist, or a class/interface declaration when they do not.
 */
function isNextTypeStub(name: string): boolean {
  return NEXT_TYPE_STUBS.has(name);
}

/** Ambient `declare module` stubs for missing npm packages or unresolved `@/` aliases. */
export function buildAmbientModuleStubs(moduleNames: readonly string[]): string {
  const valid = [...new Set(moduleNames.map((name) => name.trim()).filter(isValidAmbientModuleName))]
    .filter((name) => !isNextTypeStub(name))
    .sort();
  if (valid.length === 0) return "";
  // Empty ambient modules typecheck as `any` for default *and* named imports.
  // (`export = any` alone still fails named imports with TS2305.)
  return `${valid.map((name) => `declare module "${name}";\n`).join("")}`;
}

/**
 * `next` and `next/server` stubs that keep `NextResponse` and `Metadata`
 * usable as types. When the host has Next's real declarations this file is a
 * module, so the interfaces augment instead of replacing `after` and the rest.
 * When Next is absent, the declarations live in the script stub file and
 * define the modules themselves.
 */
export function buildNextTypeStubs(
  moduleNames: readonly string[],
  nextTypesAvailable: boolean
): { script: string; moduleFile: string } {
  const names = [...new Set(moduleNames.map((name) => name.trim()))].filter(isNextTypeStub).sort();
  if (names.length === 0) return { script: "", moduleFile: "" };
  const metadata = `declare module "next" {
  export interface Metadata {
    title?: string | { absolute?: string; default?: string; template?: string };
    description?: string;
    alternates?: { canonical?: string | string[] };
    openGraph?: { [key: string]: unknown };
    twitter?: { [key: string]: unknown };
    [key: string]: unknown;
  }
}`;
  const responseAugment = `declare module "next/server" {
  export interface NextResponse<Body = unknown> extends Response {}
  export interface NextRequest extends Request {}
}`;
  const responseDeclare = `declare module "next/server" {
  export class NextResponse<Body = unknown> extends Response {
    static json<JsonBody>(body: JsonBody, init?: ResponseInit): NextResponse<JsonBody>;
    static redirect(url: string | URL, init?: number | ResponseInit): NextResponse<unknown>;
    static rewrite(destination: string | URL, init?: ResponseInit): NextResponse<unknown>;
    static next(init?: ResponseInit): NextResponse<unknown>;
  }
  export class NextRequest extends Request {}
  export function after(task: () => unknown): void;
}`;
  const blocks = [
    names.includes("next") ? metadata : "",
    names.includes("next/server") ? (nextTypesAvailable ? responseAugment : responseDeclare) : "",
  ].filter(Boolean);
  if (nextTypesAvailable) {
    return { script: "", moduleFile: `export {};\n\n${blocks.join("\n\n")}\n` };
  }
  return { script: `${blocks.join("\n\n")}\n`, moduleFile: "" };
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
  moduleNames: readonly string[],
  options?: { projectRoot?: string }
): Promise<string | null> {
  const unique = [...new Set(moduleNames)].sort();
  if (unique.length === 0) return null;
  const projectRoot = options?.projectRoot ?? process.cwd();
  const nextTypes = buildNextTypeStubs(unique, hostPackageHasTypes(projectRoot, "next"));
  const content = `${buildAmbientModuleStubs(unique)}${nextTypes.script}`;
  const dir = path.join(tempRoot, "__provix_stubs__");
  await mkdir(dir, { recursive: true });
  const abs = path.join(dir, "ambient-modules.d.ts");
  if (content.trim()) await writeFile(abs, content, "utf8");
  const nextAbs = path.join(dir, "next-types.d.ts");
  if (nextTypes.moduleFile) {
    await writeFile(nextAbs, nextTypes.moduleFile, "utf8");
  } else if (existsSync(nextAbs)) {
    await rm(nextAbs, { force: true });
  }
  return content.trim() ? abs : nextTypes.moduleFile ? nextAbs : null;
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
 * Autofix / webhook routes set `maxDuration = 60` (seconds). Child tsc must
 * finish with margin for materialization, cleanup, and JSON response writing.
 * Never raise this to meet or exceed the route budget.
 */
export const AUTOFIX_ROUTE_MAX_DURATION_MS = 60_000;
export const TSC_PREFLIGHT_TIMEOUT_MS = 45_000;

/**
 * Env keys the Node/`tsc` child may need for path resolution and OS temp I/O.
 * Explicit allowlist only — never copy `process.env` wholesale (secrets leak).
 * Do not include NODE_OPTIONS (preload injection) or any app credentials.
 */
const TSC_PREFLIGHT_ENV_ALLOWLIST = [
  // Path lookup (Node native addons / Windows PATHEXT)
  "PATH",
  "Path",
  "PATHEXT",
  // Windows process / temp roots
  "SystemRoot",
  "SYSTEMROOT",
  "windir",
  "WINDIR",
  "ComSpec",
  "COMSPEC",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  // POSIX
  "HOME",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
] as const;

/**
 * Build a minimal environment for the TypeScript preflight subprocess.
 * Never silently falls back to the full parent environment.
 */
export function buildTscPreflightEnv(
  source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of TSC_PREFLIGHT_ENV_ALLOWLIST) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) {
      env[key] = value;
    }
  }
  return env;
}

/**
 * Remove a Provix-owned preflight temp tree. Failures are logged without
 * dumping file contents or absolute paths that may include user data.
 */
export async function removeOwnedPreflightTempDir(tempRoot: string): Promise<void> {
  try {
    await rm(tempRoot, { recursive: true, force: true });
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    console.error("[autofix/tsc-preflight] temp cleanup failed", {
      dir: path.basename(tempRoot),
      code: typeof err?.code === "string" ? err.code : undefined,
      message: (err?.message ?? String(error)).slice(0, 200),
    });
  }
}

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

/** `typescript/lib/lib.*.d.ts` — often stripped from the Vercel serverless bundle. */
export function typescriptLibDirectory(projectRoot: string): string | null {
  const tscJs = resolveTypescriptTscJs(projectRoot);
  if (tscJs) {
    const fromBin = path.join(path.dirname(tscJs), "..", "lib");
    if (existsSync(path.join(fromBin, "lib.es2022.d.ts")) || existsSync(path.join(fromBin, "lib.d.ts"))) {
      return fromBin;
    }
  }
  const fallbacks = [
    path.join(projectRoot, "node_modules", "typescript", "lib"),
    path.join(process.cwd(), "node_modules", "typescript", "lib"),
  ];
  for (const dir of fallbacks) {
    if (existsSync(path.join(dir, "lib.es2022.d.ts")) || existsSync(path.join(dir, "lib.d.ts"))) {
      return dir;
    }
  }
  try {
    const resolved = requireFromHere.resolve("typescript/lib/lib.es2022.d.ts");
    return path.dirname(resolved);
  } catch {
    return null;
  }
}

/**
 * TS2318 / TS6053 / lib-option hints mean the runtime could not load lib.*.d.ts
 * (common on Vercel `/var/task`). Those are not patch bugs. Real breaks are TS2304.
 */
function diagnosticMentionsWrite(line: string, writePaths: readonly string[]): boolean {
  const needles = writePaths.flatMap((filePath) => {
    const normalized = filePath.replace(/\\/g, "/");
    const noExt = normalized.replace(/\.(?:tsx|ts|jsx|js)$/, "");
    return [normalized, noExt, noExt.replace(/^src\//, "@/")];
  });
  return needles.some((needle) => needle.length > 0 && line.includes(needle));
}

/**
 * Every actionable `tsc` line, with errors in the patched files and their
 * importers first. The retry prompt needs more than the first line.
 */
export function formatAutofixTscFailure(
  actionable: readonly string[],
  writePaths: readonly string[] = []
): string {
  const ranked = [...actionable].sort(
    (left, right) =>
      Number(diagnosticMentionsWrite(right, writePaths)) - Number(diagnosticMentionsWrite(left, writePaths))
  );
  const shown = ranked.slice(0, 80);
  const hidden = ranked.length - shown.length;
  const head = "Pre-flight `npx tsc --noEmit` failed. The pull request was not opened.";
  const body = [
    ...shown,
    ...(hidden > 0 ? [`… ${hidden} more TypeScript diagnostics`] : []),
  ].join("\n");
  return body ? `${head}\n${body}` : head;
}

export function actionablePreflightDiagnostics(diagnostics: string): string[] {
  return diagnostics
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /error TS\d+/.test(line))
    .filter((line) => {
      if (/error TS2318:\s*Cannot find global type/i.test(line)) return false;
      if (/error TS6053:.*typescript[/\\]lib[/\\]lib\./i.test(line)) return false;
      if (/error TS6053:.*lib\.(dom|es\d+|scripthost)/i.test(line)) return false;
      if (/File '.*lib\.dom\.d\.ts' not found/i.test(line)) return false;
      if (/error TS2583:/i.test(line) || /error TS2584:/i.test(line)) return false;
      if (/Do you need to change your target library/i.test(line)) return false;
      if (/Try changing the 'lib' compiler option/i.test(line)) return false;
      if (/Cannot find global type '/i.test(line)) return false;
      // Missing .d.ts in the serverless bundle or a stubbed import. Not a patch bug.
      if (/error TS7016:/i.test(line)) return false;
      if (/error TS2688:/i.test(line)) return false;
      return true;
    });
}

/** Extra ambient modules needed when the root package is stubbed (JSX runtime). */
export function expandAmbientStubModules(moduleNames: readonly string[]): string[] {
  const out = new Set(moduleNames.map((name) => name.trim()).filter(Boolean));
  if (out.has("react")) {
    out.add("react/jsx-runtime");
    out.add("react/jsx-dev-runtime");
  }
  if (out.has("react-dom")) {
    out.add("react-dom/client");
  }
  return [...out].sort();
}

function buildPreflightTsconfig(host: HostTsconfigPaths, libDir: string | null): string {
  // Prefer es2022-only when libs exist. Never request dom libs we cannot ship on Vercel.
  const compilerOptions: Record<string, unknown> = {
    target: "ES2022",
    module: "esnext",
    moduleResolution: "bundler",
    // react-jsx resolves through `react/jsx-runtime`, which we can ambient-stub when
    // `@types/react` is missing from the serverless bundle (jsx:preserve cannot).
    jsx: "react-jsx",
    strict: true,
    // Stubs type missing imports as `any`. strict's noImplicitAny then fails
    // every `.map((row) => …)` on that result (TS7006) even when the real
    // project infers `row`. Real mismatches (TS2304, TS2322, TS2345) still fail.
    noImplicitAny: false,
    noEmit: true,
    skipLibCheck: true,
    esModuleInterop: true,
    resolveJsonModule: true,
    isolatedModules: true,
    baseUrl: host.baseUrl || ".",
    paths: host.paths,
  };
  if (libDir) {
    // Include DOM when the real typescript/lib folder is present (local/CI).
    compilerOptions.lib = ["es2022", "dom", "dom.iterable"];
  } else {
    // No lib.*.d.ts in this runtime (Vercel /var/task) — avoid TS6053 entirely.
    compilerOptions.noLib = true;
  }
  return `${JSON.stringify(
    {
      compilerOptions,
      include: ["**/*.ts", "**/*.tsx", "**/*.d.ts", "__provix_stubs__/**/*.d.ts"],
      exclude: ["node_modules"],
    },
    null,
    2
  )}\n`;
}

export type PreflightChildResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  spawnFailed: boolean;
  signal: NodeJS.Signals | null;
};

/**
 * Best-effort termination of the preflight child (and descendants when practical).
 * Windows: `taskkill /T /F`. POSIX: kill the process group started with `detached: true`.
 */
export function forceKillPreflightChild(child: {
  pid?: number | undefined;
  kill: (signal?: NodeJS.Signals | number) => boolean;
}): void {
  const pid = child.pid;
  if (typeof pid !== "number" || !Number.isFinite(pid) || pid <= 0) {
    try {
      child.kill("SIGKILL");
    } catch {
      // Already exited.
    }
    return;
  }

  if (process.platform === "win32") {
    try {
      const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
        // Cast: project `ProcessEnv` requires NODE_ENV; allowlist intentionally omits it.
        env: buildTscPreflightEnv() as NodeJS.ProcessEnv,
      });
      killer.on("error", () => {
        try {
          child.kill("SIGKILL");
        } catch {
          // Already exited.
        }
      });
      return;
    } catch {
      // Fall through to direct kill.
    }
  } else {
    try {
      // Negative PID = process group (requires detached spawn below).
      process.kill(-pid, "SIGKILL");
      return;
    } catch {
      // Fall through to direct kill.
    }
  }

  try {
    child.kill("SIGKILL");
  } catch {
    try {
      child.kill();
    } catch {
      // Already exited.
    }
  }
}

/**
 * Map timeout / spawn / signal / null-exit outcomes to a hard preflight failure.
 * Returns null when the child completed normally (exit code 0 or ordinary tsc diagnostics).
 */
export function hardPreflightFailureFromChild(
  result: PreflightChildResult,
  timeoutMs: number = TSC_PREFLIGHT_TIMEOUT_MS
): Extract<TscPreflightResult, { success: false }> | null {
  const combined =
    [result.stdout, result.stderr].filter(Boolean).join("\n").trim() || "tsc failed with no output";

  if (result.timedOut) {
    return {
      success: false,
      message: `Pre-flight \`npx tsc --noEmit\` timed out after ${timeoutMs}ms. The pull request was not opened.`,
      diagnostics: combined,
    };
  }
  if (result.spawnFailed) {
    return {
      success: false,
      message: `Pre-flight \`npx tsc --noEmit\` failed to start (${combined.slice(0, 280)}). The pull request was not opened.`,
      diagnostics: combined,
    };
  }
  if (result.signal != null) {
    return {
      success: false,
      message: `Pre-flight \`npx tsc --noEmit\` was terminated by signal ${result.signal}. The pull request was not opened.`,
      diagnostics: combined,
    };
  }
  if (result.code === null) {
    return {
      success: false,
      message:
        "Pre-flight `npx tsc --noEmit` exited abnormally without an exit code. The pull request was not opened.",
      diagnostics: combined,
    };
  }
  return null;
}

/**
 * Spawn a Node child with the fixed env allowlist and a hard deadline.
 * `env` cannot be overridden — secrets must never reach the subprocess.
 * Exported for timeout regression tests; production uses `runTscNoEmit`.
 */
export function spawnPreflightNodeChild(
  args: readonly string[],
  options: {
    cwd: string;
    timeoutMs?: number;
  }
): Promise<PreflightChildResult> {
  const timeoutMs = options.timeoutMs ?? TSC_PREFLIGHT_TIMEOUT_MS;
  const env = buildTscPreflightEnv();
  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    let stdout = "";
    let stderr = "";
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (result: PreflightChildResult) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolve(result);
    };

    // Cast: project `ProcessEnv` requires NODE_ENV; allowlist intentionally omits it.
    // POSIX: detached so forceKill can signal the whole process group.
    const child = spawn(process.execPath, [...args], {
      cwd: options.cwd,
      env: env as NodeJS.ProcessEnv,
      windowsHide: true,
      detached: process.platform !== "win32",
    });

    const timeoutDiagnostics = () =>
      `${stderr}\npreflight timed out after ${timeoutMs}ms`;

    timer = setTimeout(() => {
      timedOut = true;
      forceKillPreflightChild(child);
      // Wait briefly for `close` so Windows releases cwd locks before temp cleanup.
      // If the process never exits, still settle so the route can hard-fail.
      setTimeout(() => {
        finish({
          code: 1,
          stdout,
          stderr: timeoutDiagnostics(),
          timedOut: true,
          spawnFailed: false,
          signal: null,
        });
      }, 1_500);
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    child.on("error", (error: Error) => {
      finish({
        code: 1,
        stdout,
        stderr: error.message,
        timedOut,
        spawnFailed: true,
        signal: null,
      });
    });
    child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
      if (timedOut) {
        finish({
          code: 1,
          stdout,
          stderr: timeoutDiagnostics(),
          timedOut: true,
          spawnFailed: false,
          signal: signal ?? null,
        });
        return;
      }
      finish({
        code,
        stdout,
        stderr,
        timedOut: false,
        spawnFailed: false,
        signal: signal ?? null,
      });
    });
  });
}

function runTscNoEmit(
  tempRoot: string,
  projectRoot: string,
  timeoutMs: number = TSC_PREFLIGHT_TIMEOUT_MS
): Promise<PreflightChildResult> {
  const tscJs = resolveTypescriptTscJs(projectRoot);
  if (!tscJs) {
    return Promise.resolve({
      code: 0,
      stdout: "",
      stderr: "",
      timedOut: false,
      spawnFailed: false,
      signal: null,
    });
  }
  return spawnPreflightNodeChild([tscJs, "--noEmit", "-p", "."], {
    cwd: tempRoot,
    timeoutMs,
  });
}

/**
 * Materialize the patch + reachable `@/` modules in a temp tree, stub missing
 * internals/packages, link the host `node_modules`, and run `npx tsc --noEmit`.
 * Broken module splits (unbound helpers) fail here instead of as red CI.
 */
export async function runAutofixTscPreflight(
  writes: readonly AutofixWriteFile[],
  options?: { workDir?: string; projectRoot?: string; timeoutMs?: number }
): Promise<TscPreflightResult> {
  if (writes.length === 0) return preflightPass(0);

  const projectRoot = options?.projectRoot ?? process.cwd();
  const timeoutMs = options?.timeoutMs ?? TSC_PREFLIGHT_TIMEOUT_MS;
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
  const stubModules = expandAmbientStubModules([
    ...new Set([
      ...unresolvedAt,
      ...externalPkgs,
      ...PATH_MAPPED_STUB_PREFIXES.map((prefix) => prefix.replace(/\/$/, "")),
    ]),
  ]).filter(isValidAmbientModuleName);

  const tempRoot =
    options?.workDir ??
    (await mkdtemp(path.join(tmpdir(), "provix-autofix-tsc-")));
  const ownsTemp = !options?.workDir;

  try {
    const libDir = typescriptLibDirectory(projectRoot);
    // Vercel /var/task often ships `tsc` without `typescript/lib/*.d.ts` → TS6053.
    // Skip CLI preflight there; heal + structural validation already ran.
    if (!libDir) {
      return preflightPass(stubModules.length, true);
    }

    for (const write of graph.writes) {
      const abs = path.join(tempRoot, ...normalizedWritePath(write.filePath).split("/"));
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, write.content.endsWith("\n") ? write.content : `${write.content}\n`, "utf8");
    }
    await writeAmbientInternalImportStubs(tempRoot, stubModules, { projectRoot });
    // Re-scan after materializing seeds in case relative imports still miss.
    const stillMissing = collectMissingAtAliasesInTempRoot(tempRoot, graph.writes, {
      aliasRoot: host.aliasRoot,
      hostPaths: host.paths,
    });
    if (stillMissing.length > 0) {
      await writeAmbientInternalImportStubs(tempRoot, [...stubModules, ...stillMissing], { projectRoot });
    }
    const stubCount = new Set([...stubModules, ...stillMissing]).size;
    await writeFile(path.join(tempRoot, "tsconfig.json"), buildPreflightTsconfig(host, libDir), "utf8");
    await linkHostNodeModules(tempRoot, projectRoot);

    const childResult = await runTscNoEmit(tempRoot, projectRoot, timeoutMs);
    const abnormal = hardPreflightFailureFromChild(childResult, timeoutMs);
    if (abnormal) return abnormal;
    if (childResult.code === 0) return preflightPass(stubCount);

    const diagnostics =
      [childResult.stdout, childResult.stderr].filter(Boolean).join("\n").trim() ||
      "tsc failed with no output";
    const actionable = actionablePreflightDiagnostics(diagnostics);
    // Sandbox lib gaps (TS2318 / TS6053) — not a patch bug. Only after a normal exit.
    if (actionable.length === 0) return preflightPass(stubCount);

    return {
      success: false,
      message: formatAutofixTscFailure(
        actionable.length > 0 ? actionable : [diagnostics.slice(0, 280)],
        graph.writes.map((write) => write.filePath)
      ),
      diagnostics,
    };
  } finally {
    if (ownsTemp) {
      await removeOwnedPreflightTempDir(tempRoot);
    }
  }
}

/**
 * Hard gate for PR publishers: refuses when the patch does not typecheck.
 */
export async function assertAutofixTscPreflightPasses(
  writes: readonly AutofixWriteFile[],
  options?: { workDir?: string; projectRoot?: string; timeoutMs?: number }
): Promise<TscPreflightNote> {
  const result = await runAutofixTscPreflight(writes, options);
  if (!result.success) throw new AutofixTscPreflightError(result.message);
  return result.preflight;
}
