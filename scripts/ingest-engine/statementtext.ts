import fs from "node:fs";
import path from "node:path";
import type { ImportStatement } from "./importstatement";
import { lines } from "./lines";
import { lines } from "./lines-64";

export function statementText(statement: ImportStatement): string {
  return statement.lines.join("\n");
}
