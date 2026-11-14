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
import { EXPORTED_ASYNC_FUNCTION } from "./exported-async-function";

export function exportedAsyncFunctionBlocks(source: string): { name: string; source: string }[] {
  const matches = [...source.matchAll(EXPORTED_ASYNC_FUNCTION)];
  return matches.map((match: (typeof matches)[number], index: number) => {
    const start = match.index ?? 0;
    const end = index + 1 < matches.length ? (matches[index + 1]?.index ?? source.length) : source.length;
    return { name: match[1] ?? "", source: source.slice(start, end).trim() };
  }).filter((fn) => fn.name.length > 0 && fn.source.length > 0);
}
