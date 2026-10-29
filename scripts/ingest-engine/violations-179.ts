import fs from "node:fs";
import path from "node:path";
import { boundaryViolations } from "./boundaryviolations";
import { violations } from "./violations";
import { bloatViolations } from "./bloatviolations";
import { graph } from "./graph";
import { cycleViolations } from "./cycleviolations";
import { violations } from "./violations-146";
import { orphanViolations } from "./orphanviolations";
import { dedupeAndSort } from "./dedupeandsort";
import { statementsByFile } from "./statementsbyfile";
import { graph } from "./graph-178";
import { filePath } from "./filepath";
import { files } from "./files";
import { files } from "./files-191";
import { violations } from "./violations-192";

export   const violations = files.flatMap((file: ReportFile) => [
    ...boundaryViolations(file),
    ...bloatViolations(file, statementsByFile.get(file.filePath) ?? []),
  ]);

  violations.push(...cycleViolations(graph));
  if (includeOrphans) violations.push(...orphanViolations(files, graph));
  return dedupeAndSort(violations);
}
