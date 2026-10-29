import fs from "node:fs";
import path from "node:path";
import type { IngestedFile } from "./ingestedfile";
import { rawContent } from "./rawcontent";
import { hasDirective } from "./hasdirective";
import { isRouteModule } from "./isroutemodule";
import { isAppOrComponents } from "./isapporcomponents";
import { filePath } from "./filepath";

export function isClientBoundary(file: IngestedFile): boolean {
  if (hasDirective(file.rawContent, "use client")) return true;
  if (hasDirective(file.rawContent, "use server") || isRouteModule(file.filePath)) return false;
  return isAppOrComponents(file.filePath);
}
