import fs from "node:fs";
import path from "node:path";
import { specifier } from "./specifier";
import { specifier } from "./specifier-48";
import { specifier } from "./specifier-133";
import { knownByLower } from "./knownbylower";

export function resolveSpecifier(
  fromFile: string,
  specifier: string,
  knownByLower: Map<string, string>
): string | null {
