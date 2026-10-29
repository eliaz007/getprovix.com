import fs from "node:fs";
import path from "node:path";
import type { IngestedFile } from "./ingestedfile";
import type { Violation } from "./violation";
import type { ModuleEdge } from "./moduleedge";
import { graph } from "./graph";
import { graph } from "./graph-178";
import { files } from "./files";
import { files } from "./files-191";

export function orphanViolations(files: IngestedFile[], graph: Map<string, ModuleEdge[]>): Violation[] {
