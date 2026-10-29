import fs from "node:fs";
import path from "node:path";
import { match } from "./match";
import { bindings } from "./bindings";
import { match } from "./match-89";
import { bindings } from "./bindings-94";
import { imported } from "./imported";

export   const namespace = statement.match(/^\s*import\s+\*\s+as\s+(\w+)\s+from\b/);
  if (namespace?.[1]) {
    bindings.push({ imported: "*", local: namespace[1] });
    return bindings;
  }
