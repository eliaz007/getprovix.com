import fs from "node:fs";
import path from "node:path";
import { collectSourceFiles } from "./collectsourcefiles";
import { name } from "./name";

export     const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      collectSourceFiles(absolutePath, found);
      continue;
    }

    if (!entry.isFile()) continue;
