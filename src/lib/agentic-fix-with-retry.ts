import { readFile } from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import { finalizeAutofixWrites, type AutofixWriteFile } from "@/lib/autofix-write-validation";
import {
  mergeServerAction,
  SECRET_RULE_CATALOG,
  serverActionFilePath,
  type SecurityFixLayout,
} from "@/lib/scanner/security-suite";

const MAX_ATTEMPTS = 3;
const MAX_CONTENT = 1_500_000;
const MODELS = ["gemini-3.6-flash", "gemini-3.5-flash-lite"] as const;

const CLIENT_DB_SYSTEM_PROMPT = `You refactor one client-side Supabase query into a signed-in server action.

Return JSON only: {"writes":[{"filePath":"...","content":"..."}]}.
Include only the client file and the server action file named in the prompt.
The server action must start with "use server", import createClient from "@/utils/supabase/server", call supabase.auth.getUser(), and return { data, error }.
If the server action file already has exports, keep every existing exported function and append the new one. Never delete or rename existing exports.
Replace the client query with an import of that action. Do not use any. Do not edit other files.`;

const SECRET_SYSTEM_PROMPT = `You remove one hardcoded secret or API key.

Return JSON only: {"writes":[{"filePath":"...","content":"..."}]}.
Write only the finding file and, when the secret is in source rather than an env file, .env.example.
Replace the secret with process.env.THE_ENV_NAME. .env.example may contain only NAME= with an empty value.
Do not leave the raw key in any file. Do not invent a replacement key. Do not use any. Do not edit other files.`;

const DEPENDENCY_SYSTEM_PROMPT = `You fix one vulnerable or deprecated dependency finding.

Return JSON only: {"writes":[{"filePath":"...","content":"..."}]}.
Write only the finding file. Keep package.json valid and leave unrelated dependencies in place.
Bump or remove only the package named in the finding. For a full-library import, replace that import and keep the file typechecking.
Do not use any. Do not edit other files.`;

const ARCHITECTURE_SYSTEM_PROMPT = `You split one oversized or tangled component into modules.

Return JSON only: {"writes":[{"filePath":"...","content":"..."}]}.
Include the original file and at least one new module.
Turn the original file into a barrel that re-exports every existing public export.
Put new modules in the folder named in the prompt, using the same extension, and import them with relative paths.
Nested helpers that close over locals must take those values as parameters or import a shared module.
Keep "use client" or "use server" on every file that needs it. Do not use any. Do not edit files outside that folder.`;

function isArchitectureFinding(category: string): boolean {
  return category === "ARCHITECTURAL_BLOAT" || category === "Architectural Bloat";
}

function systemInstruction(category: string): string {
  if (category === "SECRET_LEAK") return SECRET_SYSTEM_PROMPT;
  if (category === "VULNERABLE_DEPENDENCY") return DEPENDENCY_SYSTEM_PROMPT;
  if (isArchitectureFinding(category)) return ARCHITECTURE_SYSTEM_PROMPT;
  return CLIENT_DB_SYSTEM_PROMPT;
}

export type AgenticFixFinding = {
  filePath: string;
  line: number;
  category: string;
  snippet?: string;
};

export type AgenticFixResult =
  | { ok: true; writes: AutofixWriteFile[]; attempts: number }
  | { ok: false; message: string; attempts: number };

export type AgenticFixGenerate = (prompt: string) => Promise<string>;

export function isAgenticClientDbEnabled(): boolean {
  return process.env.PROVIX_AGENTIC_CLIENT_DB === "1";
}

function quietFailure(message: string, attempts: number): AgenticFixResult {
  return { ok: false, message, attempts };
}

function normalizeRepoPath(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, "/").trim().replace(/^\.\/+/, "").replace(/^\/+/, "");
  if (!normalized || normalized.includes("\0")) return null;
  if (/^[A-Za-z]:/.test(normalized)) return null;
  if (normalized.split("/").some((part) => part === ".." || part === "")) return null;
  return normalized;
}

const EXPORTED_ASYNC_FUNCTION = /export\s+async\s+function\s+([A-Za-z0-9_]+)/g;

function exportedAsyncFunctionNames(source: string): string[] {
  return [...source.matchAll(EXPORTED_ASYNC_FUNCTION)].map((match) => match[1] ?? "").filter(Boolean);
}

function exportedAsyncFunctionBlocks(source: string): { name: string; source: string }[] {
  const matches = [...source.matchAll(EXPORTED_ASYNC_FUNCTION)];
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = index + 1 < matches.length ? (matches[index + 1]?.index ?? source.length) : source.length;
    return { name: match[1] ?? "", source: source.slice(start, end).trim() };
  }).filter((fn) => fn.name.length > 0 && fn.source.length > 0);
}

/**
 * Append new server actions onto the existing file. A model reply that
 * replaces `secure-query.ts` keeps every `secureQuery*` export.
 */
export function mergePreservingServerExports(existing: string | null, generated: string): string {
  const next = generated.endsWith("\n") ? generated : `${generated}\n`;
  if (!existing?.trim()) return next;
  const existingNames = exportedAsyncFunctionNames(existing);
  if (existingNames.length === 0) return next;
  const generatedFns = exportedAsyncFunctionBlocks(generated);
  const generatedNames = new Set(generatedFns.map((fn) => fn.name));
  const wiped = existingNames.some((name) => !generatedNames.has(name));
  if (!wiped) return next;
  const imports = generated.split(/\r?\n/).filter((line) => /^\s*import\s/.test(line));
  let merged = existing.endsWith("\n") ? existing : `${existing}\n`;
  for (const fn of generatedFns) {
    if (existingNames.includes(fn.name)) continue;
    merged = mergeServerAction(merged, [`"use server";`, ...imports, "", fn.source, ""].join("\n"));
  }
  return merged;
}

function preserveServerAction(
  writes: readonly AutofixWriteFile[],
  serverActionPath: string,
  existing: string | null
): AutofixWriteFile[] {
  if (!existing?.trim()) return [...writes];
  return writes.map((write) =>
    write.filePath === serverActionPath
      ? { filePath: write.filePath, content: mergePreservingServerExports(existing, write.content) }
      : write
  );
}

function prepareWrites(
  writes: readonly AutofixWriteFile[],
  category: string,
  serverActionPath: string,
  existingServerAction: string | null,
  existingEnvExample: string | null
): AutofixWriteFile[] {
  if (category === "CLIENT_DB_EXPOSURE") {
    return preserveServerAction(writes, serverActionPath, existingServerAction);
  }
  if (category !== "SECRET_LEAK" || !existingEnvExample?.trim()) return [...writes];
  return writes.map((write) =>
    write.filePath === ".env.example"
      ? { filePath: write.filePath, content: mergeEnvExampleFile(existingEnvExample, write.content) }
      : write
  );
}

async function readWorkspaceText(filePath: string): Promise<string | null> {
  try {
    return await readFile(path.join(process.cwd(), filePath), "utf8");
  } catch {
    return null;
  }
}

function taskLines(input: {
  finding: AgenticFixFinding;
  clientPath: string;
  serverActionPath: string;
  importModule: string;
}): string[] {
  if (input.finding.category === "SECRET_LEAK") {
    const names = SECRET_RULE_CATALOG.map((rule) => `${rule.label} -> ${rule.envName}`).join("\n");
    return [
      `Finding file: ${input.clientPath}`,
      "Remove the hardcoded secret. You may also write .env.example.",
      "Known secret types:",
      names,
    ];
  }
  if (input.finding.category === "VULNERABLE_DEPENDENCY") {
    return [`Finding file: ${input.clientPath}`, "Fix only this dependency finding in that file."];
  }
  if (isArchitectureFinding(input.finding.category)) {
    return [
      `Original file: ${input.clientPath}`,
      `New modules folder: ${architectureModuleFolder(input.clientPath)}/`,
      "Keep every public export available from the original path.",
    ];
  }
  return [
    `Client file path: ${input.clientPath}`,
    `Server action path: ${input.serverActionPath}`,
    `Client import module: ${input.importModule}`,
  ];
}

function buildPrompt(input: {
  finding: AgenticFixFinding;
  content: string;
  clientPath: string;
  serverActionPath: string;
  importModule: string;
  existingServerAction: string | null;
  existingEnvExample: string | null;
  previous?: { writes: readonly AutofixWriteFile[]; diagnostics: string };
}): string {
  const lines = [
    `Finding: ${input.finding.category} at ${input.clientPath}:${input.finding.line}.`,
    input.finding.snippet ? `Snippet:\n${input.finding.snippet}` : "",
    ...taskLines(input),
    "Current file:",
    input.content,
  ];
  if (input.finding.category === "CLIENT_DB_EXPOSURE" && input.existingServerAction?.trim()) {
    lines.push(
      "Current server action file. Keep every existing export and append the new function:",
      input.existingServerAction
    );
  }
  if (input.finding.category === "SECRET_LEAK" && input.existingEnvExample?.trim()) {
    lines.push("Current .env.example. Keep existing keys and add the new name with an empty value:", input.existingEnvExample);
  }
  if (input.previous) {
    lines.push(
      "The previous patch failed the TypeScript preflight. Fix every diagnostic below and return a new full patch.",
      input.previous.diagnostics,
      "Previous patch:",
      JSON.stringify(input.previous.writes)
    );
  }
  return lines.filter((line) => line !== "").join("\n\n");
}

function parseWrites(raw: string): AutofixWriteFile[] | { error: string } {
  let parsed: unknown;
  try {
    const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    parsed = JSON.parse(trimmed);
  } catch {
    return { error: "Gemini returned invalid JSON." };
  }
  if (!parsed || typeof parsed !== "object" || !("writes" in parsed) || !Array.isArray(parsed.writes)) {
    return { error: "Gemini JSON must be { writes: [...] }." };
  }
  const writes: AutofixWriteFile[] = [];
  for (const entry of parsed.writes) {
    if (!entry || typeof entry !== "object") return { error: "Each write must be an object." };
    const record = entry as { filePath?: unknown; content?: unknown };
    if (typeof record.filePath !== "string" || typeof record.content !== "string") {
      return { error: "Each write needs string filePath and content." };
    }
    const filePath = normalizeRepoPath(record.filePath);
    if (!filePath) return { error: `Rejected non-repo-relative path ${record.filePath}.` };
    if (record.content.length > MAX_CONTENT) return { error: `Rejected oversized write ${filePath}.` };
    writes.push({ filePath, content: record.content });
  }
  return writes;
}

function architectureModuleFolder(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const directory = normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : "";
  const base = normalized.split("/").pop()?.replace(/\.(tsx|ts|jsx|js)$/i, "") ?? "module";
  return directory ? `${directory}/${base}` : base;
}

function architectureExtension(filePath: string): string {
  return filePath.match(/\.(tsx|ts|jsx|js)$/i)?.[0] ?? ".ts";
}

function isArchitectureWritePath(original: string, candidate: string): boolean {
  if (candidate === original) return true;
  const folder = architectureModuleFolder(original);
  const extension = architectureExtension(original);
  if (!candidate.startsWith(`${folder}/`)) return false;
  const rest = candidate.slice(folder.length + 1);
  return rest.length > 0 && !rest.includes("/") && rest.endsWith(extension);
}

function publicExportNames(source: string): string[] {
  const names = new Set<string>();
  for (const match of source.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class|enum|type|interface)\s+([A-Za-z_$][\w$]*)/g)) {
    if (match[1]) names.add(match[1]);
  }
  for (const match of source.matchAll(/export\s+(?:type\s+)?\{([^}]+)\}/g)) {
    for (const part of (match[1] ?? "").split(",")) {
      const pieces = part.trim().split(/\s+as\s+/);
      const name = pieces[pieces.length - 1]?.trim().replace(/^type\s+/, "");
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  return [...names];
}

function allowedPaths(category: string, clientPath: string, serverActionPath: string): Set<string> {
  if (category === "SECRET_LEAK") return new Set([clientPath, ".env.example"]);
  if (category === "VULNERABLE_DEPENDENCY") return new Set([clientPath]);
  if (isArchitectureFinding(category)) return new Set([clientPath]);
  return new Set([clientPath, serverActionPath]);
}

function stillHasHardcodedSecret(content: string): boolean {
  return SECRET_RULE_CATALOG.some((rule) => new RegExp(rule.pattern).test(content));
}

function validateWrites(
  writes: readonly AutofixWriteFile[],
  category: string,
  clientPath: string,
  serverActionPath: string,
  source: string
): string | null {
  if (writes.length === 0) return "Gemini returned no writes.";
  const architecture = isArchitectureFinding(category);
  const allowed = allowedPaths(category, clientPath, serverActionPath);
  const seen = new Set<string>();
  for (const write of writes) {
    const pathAllowed = architecture
      ? isArchitectureWritePath(clientPath, write.filePath)
      : allowed.has(write.filePath);
    if (!pathAllowed) {
      if (architecture) {
        return `Rejected write outside ${clientPath} and ${architectureModuleFolder(clientPath)}/: ${write.filePath}.`;
      }
      return category === "CLIENT_DB_EXPOSURE"
        ? `Rejected write outside the client file and server action: ${write.filePath}.`
        : `Rejected write outside the finding file: ${write.filePath}.`;
    }
    if (seen.has(write.filePath)) return `Rejected duplicate write ${write.filePath}.`;
    seen.add(write.filePath);
    if (category === "SECRET_LEAK" && stillHasHardcodedSecret(write.content)) {
      return "The patch still contains a hardcoded secret.";
    }
  }
  if (!seen.has(clientPath)) return "Gemini did not return the finding file.";
  if (architecture && writes.length < 2) {
    return "The split must include the original file and at least one new module.";
  }
  if (architecture) {
    const original = writes.find((write) => write.filePath === clientPath);
    const missing = publicExportNames(source).filter(
      (name) => !original || !new RegExp(`\\b${name}\\b`).test(original.content)
    );
    if (missing.length > 0) {
      return `The original file must still export ${missing.join(", ")}.`;
    }
  }
  return null;
}

function mergeEnvExampleFile(existing: string | null, generated: string): string {
  const next = generated.endsWith("\n") ? generated : `${generated}\n`;
  if (!existing?.trim()) return next;
  const present = new Set(
    existing
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/^export\s+/, "").split("=")[0]?.trim() ?? "")
      .filter(Boolean)
  );
  const additions = next.split(/\r?\n/).filter((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return false;
    const key = trimmed.replace(/^export\s+/, "").split("=")[0]?.trim() ?? "";
    return key.length > 0 && !present.has(key);
  });
  if (additions.length === 0) return existing.endsWith("\n") ? existing : `${existing}\n`;
  return `${existing.replace(/\s*$/, "")}\n${additions.join("\n")}\n`;
}

async function generateWithGemini(prompt: string, system: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  const ai = new GoogleGenAI({ apiKey });
  let last: unknown;
  for (const model of MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          temperature: 0,
        },
      });
      const text = response.text?.trim();
      if (!text) throw new Error(`Gemini (${model}) returned an empty response.`);
      return text;
    } catch (error) {
      last = error;
    }
  }
  throw last instanceof Error ? last : new Error("Gemini request failed.");
}

/**
 * Ask Gemini to fix one finding, then run the existing heal + tsc gate.
 * Client queries, secrets, dependencies, and architectural splits each get
 * their own prompt and allowed write set. Architecture patches may create
 * multiple new modules under `<file-stem>/`. Up to 3 attempts. Never throws.
 */
export async function agenticFixWithRetry(
  input: {
    finding: AgenticFixFinding;
    content: string;
    layout?: Pick<SecurityFixLayout, "serverActionPath" | "importModule"> | null;
    /** `null` means the file is absent. Omit to read it from the workspace. */
    existingServerAction?: string | null;
    /** `null` means `.env.example` is absent. Omit to read it from the workspace. */
    existingEnvExample?: string | null;
  },
  options?: { generate?: AgenticFixGenerate }
): Promise<AgenticFixResult> {
  const generate = options?.generate;
  if (!generate && !process.env.GEMINI_API_KEY?.trim()) {
    return quietFailure("No fix produced. GEMINI_API_KEY is not configured.", 0);
  }
  const system = systemInstruction(input.finding.category);
  const complete = generate ?? ((prompt: string) => generateWithGemini(prompt, system));
  const clientPath = normalizeRepoPath(input.finding.filePath);
  if (!clientPath) return quietFailure("No fix produced. The finding path is not repo-relative.", 0);
  const serverActionPath =
    normalizeRepoPath(input.layout?.serverActionPath ?? serverActionFilePath(clientPath)) ??
    serverActionFilePath(clientPath);
  const importModule = input.layout?.importModule ?? "@/app/actions/secure-query";
  const clientDb = input.finding.category === "CLIENT_DB_EXPOSURE";
  const existingServerAction = !clientDb
    ? null
    : input.existingServerAction !== undefined
      ? input.existingServerAction
      : await readWorkspaceText(serverActionPath);
  const existingEnvExample =
    input.finding.category !== "SECRET_LEAK"
      ? null
      : input.existingEnvExample !== undefined
        ? input.existingEnvExample
        : await readWorkspaceText(".env.example");

  let previous: { writes: AutofixWriteFile[]; diagnostics: string } | undefined;
  let lastMessage = "No fix produced after 3 attempts.";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let raw: string;
    try {
      raw = await complete(
        buildPrompt({
          finding: input.finding,
          content: input.content,
          clientPath,
          serverActionPath,
          importModule,
          existingServerAction,
          existingEnvExample,
          previous,
        })
      );
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : "Gemini request failed.";
      previous = { writes: [], diagnostics: lastMessage };
      continue;
    }

    const parsed = parseWrites(raw);
    if ("error" in parsed) {
      lastMessage = parsed.error;
      previous = { writes: [], diagnostics: parsed.error };
      continue;
    }
    const rejected = validateWrites(parsed, input.finding.category, clientPath, serverActionPath, input.content);
    if (rejected) {
      lastMessage = rejected;
      previous = { writes: parsed, diagnostics: rejected };
      continue;
    }

    const prepared = prepareWrites(parsed, input.finding.category, serverActionPath, existingServerAction, existingEnvExample);

    try {
      const finalized = await finalizeAutofixWrites(prepared);
      if (finalized.ok) return { ok: true, writes: finalized.writes, attempts: attempt };
      lastMessage = finalized.message;
      previous = { writes: prepared, diagnostics: finalized.message };
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : "Preflight failed.";
      previous = { writes: prepared, diagnostics: lastMessage };
    }
  }

  return quietFailure(lastMessage, MAX_ATTEMPTS);
}
