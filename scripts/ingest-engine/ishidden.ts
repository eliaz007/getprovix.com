import fs from "node:fs";
import path from "node:path";
import { name } from "./name";

export function isHidden(name: string): boolean {
  return name.startsWith(".");
}
