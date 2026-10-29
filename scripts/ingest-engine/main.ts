import fs from "node:fs";
import path from "node:path";
import { targetDir } from "./targetdir";

export function main(): void {
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    console.error(`Target directory does not exist: ${targetDir}`);
    process.exit(1);
  }
