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
import { preserveServerAction } from "./preserveserveraction";
import { mergeEnvExampleFile } from "./mergeenvexamplefile";

export function prepareWrites(
  writes: readonly AutofixWriteFile[],
  category: string,
  serverActionPath: string,
  existingServerAction: string | null,
  existingEnvExample: string | null
): AutofixWriteFile[] {
  if (category === "CLIENT_DB_EXPOSURE") {
    return preserveServerAction(writes, serverActionPath, existingServerAction);
  }
  if (category !== "SECRET_LEAK" || !existingEnvExample?.trim()) return [...writes];
  return writes.map((write: AutofixWriteFile) =>
    write.filePath === ".env.example"
      ? { filePath: write.filePath, content: mergeEnvExampleFile(existingEnvExample, write.content) }
      : write
  );
}
