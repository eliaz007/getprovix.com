import fs from "node:fs";
import path from "node:path";
import type { ImportStatement } from "./importstatement";

export function extractImportStatements(content: string): ImportStatement[] {
