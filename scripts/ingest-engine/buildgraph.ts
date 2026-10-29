import fs from "node:fs";
import path from "node:path";
import type { IngestedFile } from "./ingestedfile";
import type { ImportStatement } from "./importstatement";
import type { ModuleEdge } from "./moduleedge";
import { knownByLower } from "./knownbylower";
import { statementsByFile } from "./statementsbyfile";
import { files } from "./files";
import { files } from "./files-191";

export function buildGraph(
  files: IngestedFile[],
  statementsByFile: Map<string, ImportStatement[]>,
  knownByLower: Map<string, string>
): Map<string, ModuleEdge[]> {
