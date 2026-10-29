import fs from "node:fs";
import path from "node:path";
import { filePath } from "./filepath";
import { files } from "./files";
import { files } from "./files-191";

export   const knownByLower = new Map(files.map((file: ReportFile) => [file.filePath.toLowerCase(), file.filePath]));
