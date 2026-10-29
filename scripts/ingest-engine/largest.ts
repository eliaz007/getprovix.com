import fs from "node:fs";
import path from "node:path";
import { filePath } from "./filepath";
import { files } from "./files";
import { files } from "./files-191";

export   const largest = [...files]
    .sort((left, right) => right.lineCount - left.lineCount || left.filePath.localeCompare(right.filePath))
    .slice(0, 5);
