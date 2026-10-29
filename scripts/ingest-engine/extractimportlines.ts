import fs from "node:fs";
import path from "node:path";
import { lines } from "./lines";
import { extractImportStatements } from "./extractimportstatements";
import { line } from "./line";
import { lines } from "./lines-64";
import { line } from "./line-119";
import { source } from "./source";
import { line } from "./line-134";

export /** Collect every source line that belongs to an `import ... from ...` statement. */
function extractImportLines(content: string): string[] {
  return extractImportStatements(content).flatMap((statement) => statement.lines);
}
