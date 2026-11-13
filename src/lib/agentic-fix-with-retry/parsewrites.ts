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
import { MAX_CONTENT } from "./max-content";
import { normalizeRepoPath } from "./normalizerepopath";

export function parseWrites(raw: string): AutofixWriteFile[] | { error: string } {
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
