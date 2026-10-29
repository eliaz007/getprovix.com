import fs from "node:fs";
import path from "node:path";
import type { ModuleEdge } from "./moduleedge";
import { graph } from "./graph-178";
import { files } from "./files";
import { files } from "./files-191";

export   const graph = new Map<string, ModuleEdge[]>();

  for (const file of files) {
