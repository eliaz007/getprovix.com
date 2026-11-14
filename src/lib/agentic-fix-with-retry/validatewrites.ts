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
import { isArchitectureFinding } from "./isarchitecturefinding";
import { architectureModuleFolder } from "./architecturemodulefolder";
import { isArchitectureWritePath } from "./isarchitecturewritepath";
import { publicExportNames } from "./publicexportnames";
import { allowedPaths } from "./allowedpaths";
import { stillHasHardcodedSecret } from "./stillhashardcodedsecret";

export function validateWrites(
  writes: readonly AutofixWriteFile[],
  category: string,
  clientPath: string,
  serverActionPath: string,
  source: string
): string | null {
  if (writes.length === 0) return "Gemini returned no writes.";
  const architecture = isArchitectureFinding(category);
  const allowed = allowedPaths(category, clientPath, serverActionPath);
  const seen = new Set<string>();
  for (const write of writes) {
    const pathAllowed = architecture
      ? isArchitectureWritePath(clientPath, write.filePath)
      : allowed.has(write.filePath);
    if (!pathAllowed) {
      if (architecture) {
        return `Rejected write outside ${clientPath} and ${architectureModuleFolder(clientPath)}/: ${write.filePath}.`;
      }
      return category === "CLIENT_DB_EXPOSURE"
        ? `Rejected write outside the client file and server action: ${write.filePath}.`
        : `Rejected write outside the finding file: ${write.filePath}.`;
    }
    if (seen.has(write.filePath)) return `Rejected duplicate write ${write.filePath}.`;
    seen.add(write.filePath);
    if (category === "SECRET_LEAK" && stillHasHardcodedSecret(write.content)) {
      return "The patch still contains a hardcoded secret.";
    }
  }
  if (!seen.has(clientPath)) return "Gemini did not return the finding file.";
  if (architecture && writes.length < 2) {
    return "The split must include the original file and at least one new module.";
  }
  if (architecture) {
    const original = writes.find((write: AutofixWriteFile) => write.filePath === clientPath);
    const missing = publicExportNames(source).filter(
      (name) => !original || !new RegExp(`\\b${name}\\b`).test(original.content)
    );
    if (missing.length > 0) {
      return `The original file must still export ${missing.join(", ")}.`;
    }
  }
  return null;
}
