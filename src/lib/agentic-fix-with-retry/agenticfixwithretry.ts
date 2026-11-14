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
import { MAX_ATTEMPTS } from "./max-attempts";
import { systemInstruction } from "./systeminstruction";
import type { AgenticFixFinding } from "./agenticfixfinding";
import type { AgenticFixResult } from "./agenticfixresult";
import type { AgenticFixGenerate } from "./agenticfixgenerate";
import { quietFailure } from "./quietfailure";
import { normalizeRepoPath } from "./normalizerepopath";
import { prepareWrites } from "./preparewrites";
import { readWorkspaceText } from "./readworkspacetext";
import { buildPrompt } from "./buildprompt";
import { parseWrites } from "./parsewrites";
import { validateWrites } from "./validatewrites";
import { generateWithGemini } from "./generatewithgemini";

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
