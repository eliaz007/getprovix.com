import fs from "node:fs";
import path from "node:path";
import { raw } from "./raw";

export const RAW_SQL =
  /(?:^|[^.\w])sql\s*`|\b(?:db|postgres|pool|sql)\s*\.\s*(?:query|execute|unsafe|raw)\s*\(/;
