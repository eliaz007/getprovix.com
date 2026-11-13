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
import { mergePreservingServerExports } from "./mergepreservingserverexports";

export function preserveServerAction(
  writes: readonly AutofixWriteFile[],
  serverActionPath: string,
  existing: string | null
): AutofixWriteFile[] {
  if (!existing?.trim()) return [...writes];
  return writes.map((write: AutofixWriteFile) =>
    write.filePath === serverActionPath
      ? { filePath: write.filePath, content: mergePreservingServerExports(existing, write.content) }
      : write
  );
}
