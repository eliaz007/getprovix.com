import fs from "node:fs";
import path from "node:path";

export function isTypeOnlyImport(statement: string): boolean {
  return /^\s*import\s+type\b/.test(statement);
}
