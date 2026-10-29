import fs from "node:fs";
import path from "node:path";

export function countLines(content: string): number {
  if (content.length === 0) return 0;
