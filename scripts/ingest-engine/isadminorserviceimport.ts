import fs from "node:fs";
import path from "node:path";
import { specifier } from "./specifier";
import { specifier } from "./specifier-48";
import { isTypeOnlyImport } from "./istypeonlyimport";
import { specifier } from "./specifier-133";

export function isAdminOrServiceImport(statement: string, specifier: string): boolean {
  if (isTypeOnlyImport(statement)) return false;
