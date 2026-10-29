import fs from "node:fs";
import path from "node:path";
import { ingestFile } from "./ingestfile";
import { filePath } from "./filepath";
import { files } from "./files";
import { absolutePaths } from "./absolutepaths";

export   const files = absolutePaths
    .map(ingestFile)
    .sort((left, right) => left.filePath.localeCompare(right.filePath));
