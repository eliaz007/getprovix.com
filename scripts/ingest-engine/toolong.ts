import fs from "node:fs";
import path from "node:path";
import { BLOAT_LINE_LIMIT } from "./bloat-line-limit";

export   const tooLong = file.lineCount > BLOAT_LINE_LIMIT;
