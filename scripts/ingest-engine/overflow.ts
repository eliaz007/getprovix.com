import fs from "node:fs";
import path from "node:path";
import { BLOAT_IMPORT_LIMIT } from "./bloat-import-limit";
import { distinct } from "./distinct";

export   const overflow = distinct[BLOAT_IMPORT_LIMIT];
