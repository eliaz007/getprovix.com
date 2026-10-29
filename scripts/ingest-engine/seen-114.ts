import fs from "node:fs";
import path from "node:path";
import { statements } from "./statements";
import { specifier } from "./specifier";
import { specifier } from "./specifier-48";
import { seen } from "./seen";
import { statements } from "./statements-101";
import { distinct } from "./distinct";
import { specifier } from "./specifier-133";
import { seen } from "./seen-147";

export   const seen = new Set<string>();
  for (const statement of statements) {
    if (seen.has(statement.specifier)) continue;
    seen.add(statement.specifier);
    distinct.push(statement);
  }
