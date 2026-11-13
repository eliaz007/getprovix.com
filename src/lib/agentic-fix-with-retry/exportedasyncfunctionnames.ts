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

export function exportedAsyncFunctionNames(source: string): string[] {
  return [...source.matchAll(EXPORTED_ASYNC_FUNCTION)].map((match) => match[1] ?? "").filter(Boolean);
}
