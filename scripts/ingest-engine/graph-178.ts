import fs from "node:fs";
import path from "node:path";
import { buildGraph } from "./buildgraph";
import { graph } from "./graph";
import { knownByLower } from "./knownbylower";
import { statementsByFile } from "./statementsbyfile";
import { files } from "./files";
import { files } from "./files-191";

export   const graph = buildGraph(files, statementsByFile, knownByLower);
