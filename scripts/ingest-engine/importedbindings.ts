import fs from "node:fs";
import path from "node:path";
import { isTypeOnlyImport } from "./istypeonlyimport";
import { imported } from "./imported";

export function importedBindings(statement: string): Array<{ imported: string; local: string }> {
  if (isTypeOnlyImport(statement)) return [];
