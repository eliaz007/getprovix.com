import fs from "node:fs";
import path from "node:path";

export function isPureTypeReexport(statement: string): boolean {
  if (/^\s*export\s+type\b/.test(statement)) return true;
  if (!/^\s*export\s+\{/.test(statement)) return false;
