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
import type { AgenticFixFinding } from "./agenticfixfinding";
import { architectureModuleFolder } from "./architecturemodulefolder";

export function taskLines(input: {
  finding: AgenticFixFinding;
  clientPath: string;
  serverActionPath: string;
  importModule: string;
}): string[] {
  if (input.finding.category === "SECRET_LEAK") {
    const names = SECRET_RULE_CATALOG.map((rule) => `${rule.label} -> ${rule.envName}`).join("\n");
    return [
      `Finding file: ${input.clientPath}`,
      "Remove the hardcoded secret. You may also write .env.example.",
      "Known secret types:",
      names,
    ];
  }
  if (input.finding.category === "VULNERABLE_DEPENDENCY") {
    return [`Finding file: ${input.clientPath}`, "Fix only this dependency finding in that file."];
  }
  if (isArchitectureFinding(input.finding.category)) {
    return [
      `Original file: ${input.clientPath}`,
      `New modules folder: ${architectureModuleFolder(input.clientPath)}/`,
      "Keep every public export available from the original path.",
    ];
  }
  return [
    `Client file path: ${input.clientPath}`,
    `Server action path: ${input.serverActionPath}`,
    `Client import module: ${input.importModule}`,
  ];
}
