import fs from "node:fs";
import path from "node:path";
import { filePath } from "./filepath";

export function isAppOrComponents(filePath: string): boolean {
  return filePath.split("/").some((part) => part === "app" || part === "components");
}
