import fs from "node:fs";
import path from "node:path";
import { isTypeOnlyImport } from "./istypeonlyimport";
import { bindings } from "./bindings";
import { bindings } from "./bindings-94";
import { cycle } from "./cycle";

export /** `import type` and `import { type X }` bindings are erased and cannot cycle at runtime. */
function isPureTypeImport(statement: string): boolean {
  if (isTypeOnlyImport(statement)) return true;
  if (!/^\s*import\s+\{/.test(statement)) return false;
