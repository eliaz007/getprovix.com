import fs from "node:fs";
import path from "node:path";
import { BLOAT_LINE_LIMIT } from "./bloat-line-limit";
import { BLOAT_IMPORT_LIMIT } from "./bloat-import-limit";
import { lines } from "./lines";
import { lines } from "./lines-64";
import { distinct } from "./distinct";
import { tooLong } from "./toolong";
import { tooManyImports } from "./toomanyimports";

export   const reasons: string[] = [];
  if (tooLong) {
    reasons.push(`${file.lineCount.toLocaleString("en-US")} lines (limit ${BLOAT_LINE_LIMIT})`);
  }
  if (tooManyImports) {
    reasons.push(`${distinct.length} distinct imports (limit ${BLOAT_IMPORT_LIMIT})`);
  }
