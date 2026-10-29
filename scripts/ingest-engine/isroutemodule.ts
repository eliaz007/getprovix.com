import fs from "node:fs";
import path from "node:path";
import { filePath } from "./filepath";

export function isRouteModule(filePath: string): boolean {
  return /(?:^|\/)route\.tsx?$/.test(filePath);
}
