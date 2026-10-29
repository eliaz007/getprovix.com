import fs from "node:fs";
import path from "node:path";
import { trimmed } from "./trimmed";
import { trimmed } from "./trimmed-72";
import { trimmed } from "./trimmed-88";

export function isCommentLine(trimmed: string): boolean {
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/*")
  );
}
