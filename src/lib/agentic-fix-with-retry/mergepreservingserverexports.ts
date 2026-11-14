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
import { exportedAsyncFunctionNames } from "./exportedasyncfunctionnames";
import { exportedAsyncFunctionBlocks } from "./exportedasyncfunctionblocks";

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
  const generatedNames = new Set(generatedFns.map((fn: (typeof generatedFns)[number]) => fn.name));
  const wiped = existingNames.some((name: (typeof existingNames)[number]) => !generatedNames.has(name));
  if (!wiped) return next;
  const imports = generated.split(/\r?\n/).filter((line) => /^\s*import\s/.test(line));
  let merged = existing.endsWith("\n") ? existing : `${existing}\n`;
  for (const fn of generatedFns) {
    if (existingNames.includes(fn.name)) continue;
    merged = mergeServerAction(merged, [`"use server";`, ...imports, "", fn.source, ""].join("\n"));
  }
  return merged;
}
