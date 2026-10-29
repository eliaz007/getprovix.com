import fs from "node:fs";
import path from "node:path";
import { buildReport } from "./buildreport";
import { audit } from "./audit";
import { ingestSourceText } from "./ingestsourcetext";
import { filePath } from "./filepath";
import { files } from "./files-191";

export   const files = sources
    .map(ingestSourceText)
    .sort((left, right) => left.filePath.localeCompare(right.filePath));
  return buildReport(files, audit(files, options?.includeOrphans !== false));
}
