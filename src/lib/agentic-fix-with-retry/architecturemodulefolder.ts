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

export function architectureModuleFolder(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const directory = normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : "";
  const base = normalized.split("/").pop()?.replace(/\.(tsx|ts|jsx|js)$/i, "") ?? "module";
  return directory ? `${directory}/${base}` : base;
}
