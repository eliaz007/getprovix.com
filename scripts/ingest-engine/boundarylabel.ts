import fs from "node:fs";
import path from "node:path";
import type { IngestedFile } from "./ingestedfile";
import { rawContent } from "./rawcontent";
import { hasDirective } from "./hasdirective";

export function boundaryLabel(file: IngestedFile): string {
  if (hasDirective(file.rawContent, "use client")) return "Client component (`use client`)";
  return "Module in app/ or components/ that is not a server action or route";
}
