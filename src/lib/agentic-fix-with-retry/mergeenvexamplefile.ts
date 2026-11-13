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

export function mergeEnvExampleFile(existing: string | null, generated: string): string {
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
