import fs from "node:fs";
import path from "node:path";
import { BLOAT_IMPORT_LIMIT } from "./bloat-import-limit";
import { distinct } from "./distinct";
import { tooLong } from "./toolong";

export   const tooManyImports = distinct.length > BLOAT_IMPORT_LIMIT;
  if (!tooLong && !tooManyImports) return [];
