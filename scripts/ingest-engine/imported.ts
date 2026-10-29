import fs from "node:fs";
import path from "node:path";
import { line } from "./line";
import { line } from "./line-119";
import { edges } from "./edges";
import { line } from "./line-134";
import { graph } from "./graph";
import { edges } from "./edges-137";
import { isOrphanExcluded } from "./isorphanexcluded";
import { rule } from "./rule";
import { graph } from "./graph-178";
import { filePath } from "./filepath";
import { files } from "./files";
import { files } from "./files-191";

export   const imported = new Set<string>();
  for (const [from, edges] of graph) {
    for (const edge of edges) {
      if (edge.to !== from) imported.add(edge.to);
    }
  }

  return files
    .filter((file) => !imported.has(file.filePath) && !isOrphanExcluded(file.filePath))
    .map((file) => ({
      filePath: file.filePath,
      severity: "LOW" as const,
      rule: "Dead Weight / Orphaned Code",
      line: 1,
      message: "No other scanned file imports this module.",
    }));
}
