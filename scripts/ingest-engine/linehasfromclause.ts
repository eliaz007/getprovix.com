import fs from "node:fs";
import path from "node:path";
import { line } from "./line";
import { line } from "./line-119";
import { line } from "./line-134";

export function lineHasFromClause(line: string): boolean {
  return /\bfrom\s+['"][^'"]+['"]/.test(line);
}
