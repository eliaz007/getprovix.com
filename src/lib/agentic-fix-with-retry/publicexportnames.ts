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

export function publicExportNames(source: string): string[] {
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
