import fs from "node:fs";
import path from "node:path";

export function collectSourceFiles(directory: string, found: string[]): void {
