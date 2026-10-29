import fs from "node:fs";
import path from "node:path";
import { isTestModule } from "./istestmodule";
import { filePath } from "./filepath";

export function isOrphanExcluded(filePath: string): boolean {
  if (filePath === "scripts" || filePath.startsWith("scripts/")) return true;
  if (isTestModule(filePath)) return true;
