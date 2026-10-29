import fs from "node:fs";
import path from "node:path";
import { projectRoot } from "./projectroot";
import { absolutePath } from "./absolutepath";

export function toProjectPath(absolutePath: string): string {
  return path.relative(projectRoot, absolutePath).split(path.sep).join("/");
}
