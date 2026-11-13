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

export function normalizeRepoPath(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, "/").trim().replace(/^\.\/+/, "").replace(/^\/+/, "");
  if (!normalized || normalized.includes("\0")) return null;
  if (/^[A-Za-z]:/.test(normalized)) return null;
  if (normalized.split("/").some((part) => part === ".." || part === "")) return null;
  return normalized;
}
